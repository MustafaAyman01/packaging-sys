-- ============================================================
-- جلسات الخزنة اليومية (cash_sessions + open/get_summary/close) + عمود method على expenses و salary_payments
-- موثّق بأثر رجعي: نفس الـ SQL اللي اتراجع واتنفّذ فعليًا على Production
-- (اتشغّل يدويًا من SQL Editor وقتها)، من غير أي تعديل على السلوك.
-- ============================================================
-- ============================================================
-- ============================================================

-- ---------- 1) أعمدة إضافية (حسب قرارك) ----------
-- إضافي فقط، القيمة الافتراضية 'cash' — الصفوف القديمة (قبل الميزة دي) خارج
-- نطاق أي جلسة أصلاً لأننا بنفلتر بـ created_at ضمن وقت الجلسة، فمش هتتأثر.
-- ⚠️ حد معروف: لحد ما الفرونت إند يتحدث (Batch لاحقة)، أي مصروف/راتب جديد
-- هياخد 'cash' تلقائيًا حتى لو اتدفع فعليًا بنك — لازم فورم المصروفات
-- والرواتب يضيفوا اختيار method قبل ما نعتمد على الرقم ده في تقارير رسمية.
alter table public.expenses add column method text not null default 'cash';
alter table public.salary_payments add column method text not null default 'cash';

-- ---------- 2) جدول الجلسات ----------
create table public.cash_sessions (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  opened_at timestamptz not null default now(),
  opened_by uuid references public.profiles(id),
  opening_balance numeric not null,
  status text not null default 'open',        -- 'open' | 'closed'
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  expected_closing_balance numeric,
  actual_closing_balance numeric,
  difference numeric,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_cash_sessions_org on public.cash_sessions (org_id);
-- جلسة مفتوحة واحدة بس لكل منشأة، في أي لحظة — بيقفل سيناريو "اتفتح يوم جديد
-- من تابين في نفس الوقت" على مستوى الداتا بيز نفسها، مش بس تحذير فرونت إند.
create unique index cash_sessions_one_open_per_org on public.cash_sessions (org_id) where status = 'open';

alter table public.cash_sessions enable row level security;
create policy cash_sessions_select on public.cash_sessions for select using (org_id = get_my_org_id());
-- الكتابة كلها عن طريق الـ RPCs بس (SECURITY DEFINER)، مفيش insert/update مباشر من الفرونت إند.

-- ---------- 3) فتح يوم جديد ----------
create or replace function public.open_cash_session(
  p_opening_balance numeric,   -- null = هات آخر رصيد إقفال تلقائيًا
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid := get_my_org_id();
  v_opening numeric;
  v_last_closed record;
  v_new_session record;
begin
  if v_org_id is null then
    raise exception 'Not authorized';
  end if;

  -- قفل على مستوى المنشأة عشان يمنع فتحتين في نفس اللحظة من تابين مختلفين
  -- قبل حتى ما يوصلوا للـ UNIQUE INDEX نفسه.
  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':cash_session_open', 0));

  if exists (select 1 from cash_sessions where org_id = v_org_id and status = 'open') then
    raise exception 'يوجد بالفعل جلسة خزنة مفتوحة لهذه المنشأة';
  end if;

  if p_opening_balance is not null then
    v_opening := p_opening_balance;
  else
    select actual_closing_balance into v_last_closed
    from cash_sessions
    where org_id = v_org_id and status = 'closed'
    order by closed_at desc
    limit 1;

    if v_last_closed.actual_closing_balance is null then
      raise exception 'لا توجد جلسة سابقة لأخذ الرصيد الافتتاحي منها — أدخل رصيد افتتاحي يدويًا';
    end if;
    v_opening := v_last_closed.actual_closing_balance;
  end if;

  insert into cash_sessions (org_id, opened_by, opening_balance, notes)
  values (v_org_id, auth.uid(), v_opening, p_notes)
  returning * into v_new_session;

  return to_jsonb(v_new_session);
end;
$$;

-- ---------- 4) معاينة الرصيد المتوقع (قراءة فقط — بدون SECURITY DEFINER، RLS كفاية) ----------
create or replace function public.get_cash_session_summary(p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_org_id uuid := get_my_org_id();
  v_session record;
  v_end_time timestamptz;
  v_cash_in_payments numeric;
  v_cash_out_payments numeric;
  v_cash_in_vouchers numeric;
  v_cash_out_vouchers numeric;
  v_cash_expenses numeric;
  v_cash_salaries numeric;
  v_expected numeric;
begin
  if v_org_id is null then
    raise exception 'Not authorized';
  end if;

  select * into v_session from cash_sessions where id = p_session_id and org_id = v_org_id;
  if v_session.id is null then
    raise exception 'Cash session % not found in this organization', p_session_id;
  end if;

  v_end_time := coalesce(v_session.closed_at, now());

  select coalesce(sum(case
    when pay.invoice_id is not null then
      case when inv.type = 'sale' then pay.amount
           when inv.type = 'purchase' then -pay.amount
           else 0 end
    else
      case when pay.party_type = 'client' then pay.amount
           when pay.party_type = 'supplier' then -pay.amount
           else 0 end
  end) filter (where (case
    when pay.invoice_id is not null then inv.type = 'sale'
    else pay.party_type = 'client' end)), 0)
  into v_cash_in_payments
  from payments pay
  left join invoices inv on inv.id = pay.invoice_id
  where pay.org_id = v_org_id and pay.method = 'cash'
    and pay.created_at >= v_session.opened_at and pay.created_at < v_end_time;

  select coalesce(sum(pay.amount), 0) into v_cash_out_payments
  from payments pay
  left join invoices inv on inv.id = pay.invoice_id
  where pay.org_id = v_org_id and pay.method = 'cash'
    and pay.created_at >= v_session.opened_at and pay.created_at < v_end_time
    and ((pay.invoice_id is not null and inv.type = 'purchase') or (pay.invoice_id is null and pay.party_type = 'supplier'));

  select coalesce(sum(amount), 0) into v_cash_in_vouchers
  from cash_vouchers
  where org_id = v_org_id and method = 'cash' and type = 'receipt'
    and created_at >= v_session.opened_at and created_at < v_end_time;

  select coalesce(sum(amount), 0) into v_cash_out_vouchers
  from cash_vouchers
  where org_id = v_org_id and method = 'cash' and type = 'payment'
    and created_at >= v_session.opened_at and created_at < v_end_time;

  select coalesce(sum(amount), 0) into v_cash_expenses
  from expenses
  where org_id = v_org_id and method = 'cash'
    and created_at >= v_session.opened_at and created_at < v_end_time;

  select coalesce(sum(amount), 0) into v_cash_salaries
  from salary_payments
  where org_id = v_org_id and method = 'cash'
    and created_at >= v_session.opened_at and created_at < v_end_time;

  v_expected := v_session.opening_balance
    + v_cash_in_payments - v_cash_out_payments
    + v_cash_in_vouchers - v_cash_out_vouchers
    - v_cash_expenses - v_cash_salaries;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'opening_balance', v_session.opening_balance,
    'cash_in_payments', v_cash_in_payments,
    'cash_out_payments', v_cash_out_payments,
    'cash_in_vouchers', v_cash_in_vouchers,
    'cash_out_vouchers', v_cash_out_vouchers,
    'cash_expenses', v_cash_expenses,
    'cash_salaries', v_cash_salaries,
    'expected_balance', v_expected
  );
end;
$$;

-- ---------- 5) قفل اليوم ----------
create or replace function public.close_cash_session(
  p_session_id uuid,
  p_actual_closing_balance numeric,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid := get_my_org_id();
  v_session record;
  v_summary jsonb;
  v_expected numeric;
  v_updated record;
begin
  if v_org_id is null then
    raise exception 'Not authorized';
  end if;

  -- قفل صف الجلسة نفسها يمنع اتنين يقفلوا نفس اليوم في نفس اللحظة
  select * into v_session from cash_sessions where id = p_session_id and org_id = v_org_id for update;
  if v_session.id is null then
    raise exception 'Cash session % not found in this organization', p_session_id;
  end if;

  -- لو حد تاني قفلها بالفعل وهي مستنية القفل، رجّع النتيجة الموجودة بدل خطأ
  if v_session.status = 'closed' then
    return jsonb_build_object(
      'status', 'already_closed',
      'session', to_jsonb(v_session)
    );
  end if;

  v_summary := get_cash_session_summary(p_session_id);
  v_expected := (v_summary->>'expected_balance')::numeric;

  update cash_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      expected_closing_balance = v_expected,
      actual_closing_balance = p_actual_closing_balance,
      difference = p_actual_closing_balance - v_expected,
      notes = p_notes
  where id = p_session_id
  returning * into v_updated;

  return jsonb_build_object('status', 'closed', 'session', to_jsonb(v_updated));
end;
$$;

-- ---------- 6) الصلاحيات ----------
revoke execute on function public.open_cash_session(numeric, text) from public;
grant execute on function public.open_cash_session(numeric, text) to authenticated;

revoke execute on function public.get_cash_session_summary(uuid) from public;
grant execute on function public.get_cash_session_summary(uuid) to authenticated;

revoke execute on function public.close_cash_session(uuid, numeric, text) from public;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;
