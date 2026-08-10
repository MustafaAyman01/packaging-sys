-- ============================================================
-- BASELINE MIGRATION — reverse-engineered from the live Supabase
-- database via information_schema / pg_catalog queries run by the
-- client in the SQL Editor. Nothing here is invented; every table,
-- column, constraint, index, function, trigger, and policy below
-- was confirmed from an actual query result, not assumed.
--
-- Do NOT run this against production. It documents the current
-- state as a starting point for future versioned migrations; it is
-- not intended to be re-applied to the same project.
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

create table public.organizations (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  name_ar text,
  phone text,
  address text,
  tax_number text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  whatsapp_phone text,
  show_address_on_invoice boolean default true,
  show_phone_on_invoice boolean default true,
  show_whatsapp_on_invoice boolean default true,
  show_tax_number_on_invoice boolean default true,
  max_total_payables numeric
);

create table public.profiles (
  id uuid not null primary key references auth.users(id), -- inferred target (auth.users); the public-schema-only
                                                            -- query reported this FK's target table as null/null
  org_id uuid not null references public.organizations(id),
  full_name text not null,
  email text not null,
  role text not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  allowed_pages jsonb
);
create index idx_profiles_org on public.profiles (org_id);

create table public.categories (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  name text not null,
  created_at timestamptz not null default now()
);
create index idx_categories_org on public.categories (org_id);

create table public.units (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  name text not null,
  abbreviation text not null,
  created_at timestamptz not null default now()
);
create index idx_units_org on public.units (org_id);

create table public.products (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  sku text not null,
  name text not null,
  category_id uuid references public.categories(id),
  unit_id uuid references public.units(id),
  cost_price numeric not null default 0,
  sale_price numeric not null default 0,
  min_stock_level numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku)
);
create index idx_products_org on public.products (org_id);

create table public.clients (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  name text not null,
  phone text,
  email text,
  address text,
  tax_number text,
  type text not null default 'retail',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  credit_limit numeric
);
create index idx_clients_org on public.clients (org_id);

create table public.suppliers (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  name text not null,
  phone text,
  email text,
  address text,
  tax_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  credit_limit numeric
);
create index idx_suppliers_org on public.suppliers (org_id);

create table public.stock_levels (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  product_id uuid not null references public.products(id),
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (org_id, product_id)
);
create index idx_stock_levels_org on public.stock_levels (org_id);

create table public.stock_movements (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  product_id uuid not null references public.products(id),
  movement_type text not null,
  quantity numeric not null,
  unit_cost numeric default 0,
  notes text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index idx_stock_movements_org on public.stock_movements (org_id);
create index idx_stock_movements_org_date on public.stock_movements (org_id, created_at desc);
create index idx_stock_movements_product on public.stock_movements (product_id);

create table public.manufacturing_orders (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  order_number text,
  order_date date not null default current_date,
  material_product_id uuid references public.products(id),
  material_quantity_used numeric not null default 0,
  material_unit_cost numeric not null default 0,
  material_cost_total numeric not null default 0,
  expense_items jsonb not null default '[]'::jsonb,
  expenses_total numeric not null default 0,
  total_cost numeric not null default 0,
  output_product_id uuid references public.products(id),
  output_quantity numeric not null default 0,
  cost_per_unit numeric not null default 0,
  notes text default '',
  created_at date not null default current_date
);
create index idx_manufacturing_orders_org on public.manufacturing_orders (org_id);
create index manufacturing_orders_org_id_idx on public.manufacturing_orders (org_id); -- duplicate of the above, present as-is in the live DB — harmless, safe cleanup candidate for Phase 2

create table public.invoices (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  invoice_number text not null,
  type text not null,
  client_id uuid references public.clients(id),
  supplier_id uuid references public.suppliers(id),
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 14,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  status text not null default 'draft',
  notes text,
  eta_uuid text,
  eta_submission_status text,
  eta_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (org_id, invoice_number)
);
create index idx_invoices_org on public.invoices (org_id);
create index idx_invoices_org_date on public.invoices (org_id, invoice_date desc);
create index idx_invoices_org_type_status on public.invoices (org_id, type, status);
create index idx_invoices_client on public.invoices (client_id);
create index idx_invoices_supplier on public.invoices (supplier_id);

create table public.invoice_items (
  id uuid not null default gen_random_uuid() primary key,
  invoice_id uuid not null references public.invoices(id),
  product_id uuid not null references public.products(id),
  quantity numeric not null,
  unit_price numeric not null,
  discount_percent numeric not null default 0,
  total_price numeric not null,
  created_at timestamptz not null default now()
  -- NOTE: no org_id column here — RLS relies on an EXISTS join back to
  -- invoices.org_id (see policies below). No FK ON DELETE behavior
  -- confirmed either way from information_schema alone.
);
create index idx_invoice_items_invoice on public.invoice_items (invoice_id);
create index idx_invoice_items_product on public.invoice_items (product_id);

create table public.payments (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  invoice_id uuid references public.invoices(id),
  amount numeric not null,
  payment_date date not null default current_date,
  method text not null default 'cash',
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  party_type text,
  party_id uuid
);
create index idx_payments_org on public.payments (org_id);
create index idx_payments_invoice on public.payments (invoice_id);
create index idx_payments_party on public.payments (party_type, party_id);

create table public.expenses (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  title text not null,
  amount numeric not null,
  expense_date date not null default current_date,
  category text not null default 'أخرى',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index idx_expenses_org on public.expenses (org_id);

create table public.employees (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  name text not null,
  job_title text,
  department text,
  phone text,
  email text,
  hire_date date,
  salary numeric not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  daily_rate numeric,
  overtime_hourly_rate numeric
);
create index idx_employees_org on public.employees (org_id);

create table public.salary_payments (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  amount numeric not null,
  period_month text not null,
  payment_date date not null default current_date,
  notes text,
  expense_id uuid references public.expenses(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  advance_deduction numeric default 0,
  net_amount numeric,
  advance_deduction_breakdown jsonb default '[]'::jsonb,
  base_salary numeric,
  deduction_amount numeric not null default 0,
  overtime_amount numeric not null default 0,
  penalties_amount numeric not null default 0
);
create index idx_salary_payments_org on public.salary_payments (org_id);
create index idx_salary_payments_employee on public.salary_payments (employee_id);

create table public.attendance (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  date date not null,
  status text not null,
  notes text,
  created_at timestamptz not null default now(),
  deduction_type text not null default 'none',
  overtime_hours numeric not null default 0,
  unique (org_id, employee_id, date)
);
create index idx_attendance_org on public.attendance (org_id);

create table public.penalties (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  amount numeric not null,
  penalty_date date not null default current_date,
  reason text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index idx_penalties_org on public.penalties (org_id);
create index idx_penalties_employee on public.penalties (employee_id);

create table public.advances (
  -- NOTE: id/employee_id are `text`, not `uuid`, unlike every other table in
  -- this schema — confirmed directly from information_schema, not a
  -- transcription error. No FK from advances.employee_id to employees.id
  -- exists (confirmed absent from the constraints dump). Reproduced as-is,
  -- not silently "fixed" — flagged for Phase 2 review.
  id text not null primary key,
  org_id uuid not null references public.organizations(id),
  employee_id text not null,
  amount numeric not null,
  remaining_amount numeric not null,
  advance_date date,
  reason text,
  notes text,
  created_at timestamptz default now()
);

create table public.cash_vouchers (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  type text not null,
  amount numeric not null,
  voucher_date date not null default current_date,
  party_name text not null,
  method text not null default 'cash',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index idx_cash_vouchers_org on public.cash_vouchers (org_id);

create table public.feature_flags (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  feature_key text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, feature_key)
);
create index idx_features_org on public.feature_flags (org_id);

create table public.invites (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  email text not null,
  role text not null,
  code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  used boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index idx_invites_org on public.invites (org_id);

create table public.activity_log (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id),
  user_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index idx_activity_log_org on public.activity_log (org_id);
create index idx_activity_log_org_date on public.activity_log (org_id, created_at desc);

-- ============================================================
-- 2. FUNCTIONS
-- ============================================================
-- Exact bodies confirmed via pg_get_functiondef() — reproduced verbatim,
-- not retyped from memory.

CREATE OR REPLACE FUNCTION public.get_my_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select org_id from profiles where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM profiles WHERE id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT get_my_role() IN ('owner','admin')
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'لا يمكنك تعديل صلاحيتك (role) بنفسك';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'لا يمكنك تغيير المنشأة التابع لها بنفسك';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'لا يمكنك تعديل حالة تفعيل حسابك بنفسك';
    end if;
  end if;
  return new;
end;
$function$;

-- Registration / onboarding RPCs (called from the frontend's Login/RedeemInvite/Settings pages)

CREATE OR REPLACE FUNCTION public.create_organization_and_owner(p_org_name text, p_full_name text, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'User already has a profile';
  end if;

  insert into organizations (name, name_ar)
  values (p_org_name, p_org_name)
  returning id into v_org_id;

  insert into profiles (id, org_id, full_name, email, role)
  values (auth.uid(), v_org_id, p_full_name, p_email, 'owner');

  insert into feature_flags (org_id, feature_key, enabled) values
    (v_org_id, 'core', true),
    (v_org_id, 'hr', true),
    (v_org_id, 'cash_vouchers', true),
    (v_org_id, 'csv_import', true),
    (v_org_id, 'eta_einvoice', false),
    (v_org_id, 'reports_advanced', true);

  return v_org_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text, p_full_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invite invites%rowtype;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'User already has a profile';
  end if;

  select * into v_invite from invites where code = p_code and used = false;
  if v_invite.id is null then
    raise exception 'Invalid or already used invite code';
  end if;

  insert into profiles (id, org_id, full_name, email, role)
  values (auth.uid(), v_invite.org_id, p_full_name, auth.jwt()->>'email', v_invite.role);

  update invites set used = true where id = v_invite.id;

  return v_invite.org_id;
end;
$function$;

-- Member/role management RPCs (all correctly re-check the caller's own role
-- server-side, and confirm the target profile belongs to the caller's own
-- org before acting — this closes the exact class of gap
-- prevent_self_privilege_escalation() was added to fix for direct table
-- writes; these RPCs were already safe on that specific point.)

CREATE OR REPLACE FUNCTION public.update_member_role(p_profile_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
begin
  if get_my_role() not in ('owner','admin') then
    raise exception 'Not authorized';
  end if;
  select org_id into v_org from profiles where id = p_profile_id;
  if v_org != get_my_org_id() then
    raise exception 'Cannot modify member outside your organization';
  end if;
  update profiles set role = p_role, is_active = true where id = p_profile_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.deactivate_member(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
begin
  if get_my_role() not in ('owner','admin') then
    raise exception 'Not authorized';
  end if;
  select org_id into v_org from profiles where id = p_profile_id;
  if v_org != get_my_org_id() then
    raise exception 'Cannot modify member outside your organization';
  end if;
  update profiles set is_active = false where id = p_profile_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_member_permissions(p_profile_id uuid, p_allowed_pages jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if get_my_role() not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;
  update profiles
    set allowed_pages = p_allowed_pages
    where id = p_profile_id and org_id = get_my_org_id();
end;
$function$;

-- Organization settings RPCs

CREATE OR REPLACE FUNCTION public.update_organization(p_name text, p_logo_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if get_my_role() not in ('owner','admin') then
    raise exception 'Not authorized';
  end if;
  update organizations
  set name = p_name, name_ar = p_name, logo_url = p_logo_url
  where id = get_my_org_id();
end;
$function$;

-- ⚠️ NOTE — kept exactly as found: two overloads of update_organization_details
-- coexist in the live database (an 8-arg version and a 9-arg version adding
-- p_max_total_payables). This is valid Postgres (overloading by argument
-- count) but is almost certainly leftover from an earlier iteration that
-- never got cleaned up. Reproduced faithfully — NOT resolved here, flagged
-- as a Phase 2/15 cleanup candidate, not touched per this batch's scope.

CREATE OR REPLACE FUNCTION public.update_organization_details(
  p_address text, p_phone text, p_whatsapp_phone text, p_tax_number text,
  p_show_address boolean, p_show_phone boolean, p_show_whatsapp boolean, p_show_tax_number boolean
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if get_my_role() not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;
  update organizations
  set address = p_address,
      phone = p_phone,
      whatsapp_phone = p_whatsapp_phone,
      tax_number = p_tax_number,
      show_address_on_invoice = p_show_address,
      show_phone_on_invoice = p_show_phone,
      show_whatsapp_on_invoice = p_show_whatsapp,
      show_tax_number_on_invoice = p_show_tax_number
  where id = get_my_org_id();
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_organization_details(
  p_address text, p_phone text, p_whatsapp_phone text, p_tax_number text,
  p_show_address boolean, p_show_phone boolean, p_show_whatsapp boolean, p_show_tax_number boolean,
  p_max_total_payables numeric
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if get_my_role() not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;
  update organizations
  set address = p_address,
      phone = p_phone,
      whatsapp_phone = p_whatsapp_phone,
      tax_number = p_tax_number,
      show_address_on_invoice = p_show_address,
      show_phone_on_invoice = p_show_phone,
      show_whatsapp_on_invoice = p_show_whatsapp,
      show_tax_number_on_invoice = p_show_tax_number,
      max_total_payables = p_max_total_payables
  where id = get_my_org_id();
end;
$function$;

-- Schema-hygiene safety net: automatically enables RLS on any newly created
-- table in the public schema, even if a future migration forgets to do it
-- explicitly. Confirmed present as a function; NOT independently confirmed
-- in this pass that the event trigger registration itself
-- (`CREATE EVENT TRIGGER ... EXECUTE FUNCTION rls_auto_enable()`) is active —
-- that requires one more query against pg_event_trigger to be 100% certain.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

create trigger trg_clients_updated before update on public.clients for each row execute function set_updated_at();
create trigger trg_employees_updated before update on public.employees for each row execute function set_updated_at();
create trigger trg_invoices_updated before update on public.invoices for each row execute function set_updated_at();
create trigger trg_organizations_updated before update on public.organizations for each row execute function set_updated_at();
create trigger trg_products_updated before update on public.products for each row execute function set_updated_at();
create trigger trg_profiles_updated before update on public.profiles for each row execute function set_updated_at();
create trigger trg_suppliers_updated before update on public.suppliers for each row execute function set_updated_at();
create trigger trg_prevent_self_privilege_escalation before update on public.profiles for each row execute function prevent_self_privilege_escalation();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.units enable row level security;
alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.manufacturing_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.employees enable row level security;
alter table public.salary_payments enable row level security;
alter table public.attendance enable row level security;
alter table public.penalties enable row level security;
alter table public.advances enable row level security;
alter table public.cash_vouchers enable row level security;
alter table public.feature_flags enable row level security;
alter table public.invites enable row level security;
alter table public.activity_log enable row level security;

create policy products_select on public.products for select using (org_id = get_my_org_id());
create policy products_insert on public.products for insert with check (org_id = get_my_org_id());
create policy products_update on public.products for update using (org_id = get_my_org_id());
create policy products_delete on public.products for delete using (org_id = get_my_org_id() and is_admin_or_owner());

create policy clients_all on public.clients for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy suppliers_all on public.suppliers for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy categories_all on public.categories for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy units_all on public.units for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy stock_levels_all on public.stock_levels for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy stock_movements_select on public.stock_movements for select using (org_id = get_my_org_id());
create policy stock_movements_insert on public.stock_movements for insert with check (org_id = get_my_org_id());
create policy stock_movements_delete on public.stock_movements for delete using (org_id = get_my_org_id() and is_admin_or_owner());

create policy "select own org" on public.manufacturing_orders for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "insert own org" on public.manufacturing_orders for insert
  with check (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "update own org" on public.manufacturing_orders for update
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "delete own org" on public.manufacturing_orders for delete
  using (org_id in (select org_id from public.profiles where id = auth.uid()));

create policy invoices_select on public.invoices for select using (org_id = get_my_org_id());
create policy invoices_insert on public.invoices for insert with check (org_id = get_my_org_id());
create policy invoices_update on public.invoices for update using (org_id = get_my_org_id());
create policy invoices_delete on public.invoices for delete using (org_id = get_my_org_id() and is_admin_or_owner());

create policy invoice_items_select on public.invoice_items for select
  using (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.org_id = get_my_org_id()));
create policy invoice_items_insert on public.invoice_items for insert
  with check (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.org_id = get_my_org_id()));
create policy invoice_items_update on public.invoice_items for update
  using (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.org_id = get_my_org_id()));
create policy invoice_items_delete on public.invoice_items for delete
  using (exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.org_id = get_my_org_id()) and is_admin_or_owner());

create policy payments_all on public.payments for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy expenses_select on public.expenses for select using (org_id = get_my_org_id());
create policy expenses_insert on public.expenses for insert with check (org_id = get_my_org_id());
create policy expenses_update on public.expenses for update using (org_id = get_my_org_id());
create policy expenses_delete on public.expenses for delete using (org_id = get_my_org_id() and is_admin_or_owner());

create policy employees_select on public.employees for select
  using (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin','accountant']));
create policy employees_write on public.employees for all
  using (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin']))
  with check (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin']));

create policy salary_payments_select on public.salary_payments for select
  using (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin','accountant']));
create policy salary_payments_write on public.salary_payments for all
  using (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin','accountant']))
  with check (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin','accountant']));

create policy attendance_all on public.attendance for all
  using (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin']))
  with check (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin']));

create policy penalties_select on public.penalties for select
  using (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin','accountant']));
create policy penalties_write on public.penalties for all
  using (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin','accountant']))
  with check (org_id = get_my_org_id() and get_my_role() = any (array['owner','admin','accountant']));

-- ⚠️ Still open per the audit: no role restriction on advances/cash_vouchers,
-- unlike every other HR/financial table above. Reproduced as-is, not fixed —
-- pending the client's confirmation on multi-role usage (Batch 3+ decision).
create policy "Users can access their org advances" on public.advances for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy cash_vouchers_all on public.cash_vouchers for all
  using (org_id = get_my_org_id()) with check (org_id = get_my_org_id());

create policy features_select on public.feature_flags for select using (org_id = get_my_org_id());
create policy features_update_owner on public.feature_flags for all
  using (org_id = get_my_org_id() and get_my_role() = 'owner');

create policy invites_select on public.invites for select using (org_id = get_my_org_id() and is_admin_or_owner());
create policy invites_insert on public.invites for insert with check (org_id = get_my_org_id() and is_admin_or_owner());
create policy invites_delete on public.invites for delete using (org_id = get_my_org_id() and is_admin_or_owner());

create policy activity_log_select on public.activity_log for select
  using (org_id = get_my_org_id() and is_admin_or_owner());
create policy activity_log_insert on public.activity_log for insert
  with check (org_id = get_my_org_id());
-- No UPDATE/DELETE policy exists on activity_log — confirmed intentional,
-- makes the audit log immutable. Do not add one.

create policy org_select on public.organizations for select using (id = get_my_org_id());
create policy org_update_admin on public.organizations for update using (id = get_my_org_id() and is_admin_or_owner());

create policy profiles_select on public.profiles for select using (org_id = get_my_org_id());
create policy profiles_insert_admin on public.profiles for insert with check (org_id = get_my_org_id() and is_admin_or_owner());
create policy profiles_update_admin on public.profiles for update using (org_id = get_my_org_id() and is_admin_or_owner());
-- profiles_update_self: historically the critical gap. Its WITH CHECK is
-- still null even after remediation — the actual enforcement point is the
-- trg_prevent_self_privilege_escalation trigger above (§3), not a change to
-- this policy. Reproduced faithfully:
create policy profiles_update_self on public.profiles for update using (id = auth.uid());
