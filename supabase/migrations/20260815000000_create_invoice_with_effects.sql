-- ============================================================
-- create_invoice_with_effects: فاتورة + بنود + مخزون + حركات + دفعة في Transaction واحدة
-- موثّق بأثر رجعي: نفس الـ SQL اللي اتراجع واتنفّذ فعليًا على Production
-- (اتشغّل يدويًا من SQL Editor وقتها)، من غير أي تعديل على السلوك.
-- ============================================================
create or replace function public.create_invoice_with_effects(
  p_invoice_id uuid,
  p_type text,
  p_client_id uuid,
  p_supplier_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_discount_amount numeric,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb,
  p_payment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $BODY$
declare
  v_org_id uuid := get_my_org_id();
  v_existing_invoice record;
  v_item jsonb;
  v_qty numeric;
  v_price numeric;
  v_disc numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_taxable numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_year_prefix text;
  v_next_num int;
  v_invoice_number text;
  v_invoice record;
  v_item_id uuid;
  v_product_id uuid;
  v_current_qty numeric;
  v_true_delta numeric;
  v_payment_result jsonb := null;
  v_payment_idempotency_key uuid;
  v_items_result jsonb := '[]'::jsonb;
begin
  if v_org_id is null then
    raise exception 'Not authorized';
  end if;

  if p_invoice_id is null then
    raise exception 'p_invoice_id is required and cannot be null';
  end if;

  if p_type not in ('sale', 'purchase') then
    raise exception 'p_type must be sale or purchase (got %)', p_type;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text, 0));

  select * into v_existing_invoice from invoices where id = p_invoice_id and org_id = v_org_id;
  if v_existing_invoice.id is not null then
    return jsonb_build_object('status', 'already_applied', 'invoice', to_jsonb(v_existing_invoice));
  end if;

  if p_type = 'sale' then
    if p_client_id is null then
      raise exception 'p_client_id is required for a sale invoice';
    end if;
    if not exists (select 1 from clients where id = p_client_id and org_id = v_org_id) then
      raise exception 'client % not found in this organization', p_client_id;
    end if;
  else
    if p_supplier_id is null then
      raise exception 'p_supplier_id is required for a purchase invoice';
    end if;
    if not exists (select 1 from suppliers where id = p_supplier_id and org_id = v_org_id) then
      raise exception 'supplier % not found in this organization', p_supplier_id;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'invoice must have at least one item';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'product_id') or (v_item->>'product_id') is null then
      raise exception 'each item must include a non-null product_id';
    end if;
    v_product_id := (v_item->>'product_id')::uuid;

    if not exists (select 1 from products where id = v_product_id and org_id = v_org_id) then
      raise exception 'product % not found in this organization', v_product_id;
    end if;

    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_disc := coalesce((v_item->>'discount_percent')::numeric, 0);

    if v_qty <= 0 then
      raise exception 'quantity must be positive for product %', v_product_id;
    end if;
    if v_price < 0 then
      raise exception 'unit_price cannot be negative for product %', v_product_id;
    end if;
    if v_disc < 0 or v_disc > 100 then
      raise exception 'discount_percent must be between 0 and 100 for product %', v_product_id;
    end if;

    v_line_total := v_qty * v_price * (1 - v_disc / 100);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_taxable := v_subtotal - coalesce(p_discount_amount, 0);
  v_tax_amount := v_taxable * (coalesce(p_tax_rate, 0) / 100);
  v_total_amount := v_taxable + v_tax_amount;

  v_year_prefix := (case when p_type = 'sale' then 'INV' else 'PUR' end)
    || '-' || extract(year from current_date)::text || '-';

  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || v_year_prefix, 0));

  select coalesce(max(
    nullif(regexp_replace(substring(invoice_number from length(v_year_prefix) + 1), '\D', '', 'g'), '')::int
  ), 0) + 1
  into v_next_num
  from invoices
  where org_id = v_org_id and type = p_type and invoice_number like v_year_prefix || '%';

  v_invoice_number := v_year_prefix || lpad(v_next_num::text, 3, '0');

  insert into invoices (
    id, org_id, invoice_number, type, client_id, supplier_id, invoice_date, due_date,
    subtotal, discount_amount, tax_rate, tax_amount, total_amount, paid_amount, status, notes, created_by
  ) values (
    p_invoice_id, v_org_id, v_invoice_number, p_type,
    case when p_type = 'sale' then p_client_id else null end,
    case when p_type = 'purchase' then p_supplier_id else null end,
    p_invoice_date, p_due_date, v_subtotal, coalesce(p_discount_amount, 0), coalesce(p_tax_rate, 0),
    v_tax_amount, v_total_amount, 0, 'pending', p_notes, auth.uid()
  ) returning * into v_invoice;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_disc := coalesce((v_item->>'discount_percent')::numeric, 0);
    v_line_total := v_qty * v_price * (1 - v_disc / 100);
    v_item_id := gen_random_uuid();

    insert into invoice_items (id, invoice_id, product_id, quantity, unit_price, discount_percent, total_price)
    values (v_item_id, p_invoice_id, v_product_id, v_qty, v_price, v_disc, v_line_total);

    v_true_delta := case when p_type = 'sale' then -v_qty else v_qty end;

    insert into stock_levels (org_id, product_id, quantity)
    values (v_org_id, v_product_id, 0)
    on conflict (org_id, product_id) do nothing;

    select quantity into v_current_qty
    from stock_levels
    where org_id = v_org_id and product_id = v_product_id
    for update;

    insert into stock_movements (org_id, product_id, movement_type, quantity, reference_type, reference_id, created_by)
    values (
      v_org_id, v_product_id,
      case when p_type = 'sale' then 'out' else 'in' end,
      abs(v_true_delta), 'invoice', p_invoice_id, auth.uid()
    );

    update stock_levels
    set quantity = greatest(0, v_current_qty + v_true_delta), updated_at = now()
    where org_id = v_org_id and product_id = v_product_id;

    v_items_result := v_items_result || jsonb_build_object(
      'item_id', v_item_id, 'product_id', v_product_id, 'quantity', v_qty, 'total_price', v_line_total
    );
  end loop;

  if p_payment is not null and coalesce((p_payment->>'amount')::numeric, 0) > 0 then
    v_payment_idempotency_key := md5(p_invoice_id::text || ':payment')::uuid;
    v_payment_result := record_payment(
      v_payment_idempotency_key,
      null, null,
      (p_payment->>'amount')::numeric,
      p_invoice_date,
      coalesce(p_payment->>'method', 'cash'),
      coalesce(p_payment->>'reference_number', ''),
      coalesce(p_payment->>'notes', ''),
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
        'invoice_id', p_invoice_id,
        'amount', (p_payment->>'amount')::numeric
      ))
    );
  end if;

  select * into v_invoice from invoices where id = p_invoice_id;

  return jsonb_build_object(
    'status', 'created',
    'invoice', to_jsonb(v_invoice),
    'items', v_items_result,
    'payment', v_payment_result
  );
end;
$BODY$;

revoke execute on function public.create_invoice_with_effects(
  uuid, text, uuid, uuid, date, date, numeric, numeric, text, jsonb, jsonb
) from public;
grant execute on function public.create_invoice_with_effects(
  uuid, text, uuid, uuid, date, date, numeric, numeric, text, jsonb, jsonb
) to authenticated;
