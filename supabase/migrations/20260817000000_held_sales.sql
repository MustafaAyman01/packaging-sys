-- ============================================================
-- البيعات المعلّقة في POS: جدول held_sales
-- موثّق بأثر رجعي: نفس الـ SQL اللي اتراجع واتنفّذ فعليًا على Production
-- (اتشغّل يدويًا من SQL Editor وقتها)، من غير أي تعديل على السلوك.
-- ============================================================
create table public.held_sales (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  held_by uuid references public.profiles(id),
  cart jsonb not null,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_held_sales_org on public.held_sales (org_id);
alter table public.held_sales enable row level security;
create policy held_sales_all on public.held_sales for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());
