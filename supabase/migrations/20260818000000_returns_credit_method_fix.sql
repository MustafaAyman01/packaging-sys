-- ============================================================
-- إصلاح: رصيد المرتجع method=other بدل cash عشان ميتحسبش كفلوس داخلة للدرج
-- موثّق بأثر رجعي: نفس الـ SQL اللي اتراجع واتنفّذ فعليًا على Production
-- (اتشغّل يدويًا من SQL Editor وقتها)، من غير أي تعديل على السلوك.
-- ============================================================
-- ============================================================
-- إصلاح: رصيد المرتجع (credit) كان بيتسجل method='cash' فكان بيتحسب
-- كأنه فلوس دخلت درج الخزنة في get_cash_session_summary. دلوقتي بيتسجل
-- method='other' (موجودة أصلاً في PAYMENT_METHODS) فبيتجاهله حساب الخزنة.
-- تغيير سطر واحد بس — CREATE OR REPLACE للدالة، صفر تعديل على أي جدول أو بيانات.
-- ============================================================

create or replace function public.record_invoice_return(
  p_return_id uuid, p_invoice_id uuid, p_lines jsonb, p_reason text
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $BODY2$
declare
  v_org_id uuid := get_my_org_id();
  v_invoice record; v_line jsonb; v_item record; v_qty numeric; v_line_value numeric;
  v_total_return_value numeric := 0; v_new_subtotal numeric; v_new_tax numeric; v_new_total numeric;
  v_new_paid numeric; v_credit_amount numeric := 0; v_party_type text; v_party_id uuid;
  v_product_id uuid; v_current_qty numeric; v_return_delta numeric; v_existing_return record;
begin
  if v_org_id is null then raise exception 'Not authorized'; end if;
  if p_return_id is null then raise exception 'p_return_id is required and cannot be null'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_return_id::text, 0));

  select * into v_existing_return from invoice_returns where id = p_return_id and org_id = v_org_id;
  if v_existing_return.id is not null then
    return jsonb_build_object('status', 'already_applied', 'return', to_jsonb(v_existing_return));
  end if;

  select * into v_invoice from invoices where id = p_invoice_id and org_id = v_org_id for update;
  if v_invoice.id is null then
    raise exception 'invoice % not found in this organization', p_invoice_id;
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'return must include at least one line';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select ii.*, inv.org_id as inv_org_id
    into v_item
    from invoice_items ii
    join invoices inv on inv.id = ii.invoice_id
    where ii.id = (v_line->>'invoice_item_id')::uuid and ii.invoice_id = p_invoice_id
    for update;

    if v_item.id is null or v_item.inv_org_id <> v_org_id then
      raise exception 'invoice item % not found on this invoice', (v_line->>'invoice_item_id');
    end if;

    v_qty := coalesce((v_line->>'quantity')::numeric, 0);
    if v_qty <= 0 then
      raise exception 'return quantity must be positive for item %', v_item.id;
    end if;
    if v_qty > (v_item.quantity - v_item.returned_quantity) then
      raise exception 'cannot return % — only % remaining to return for this line',
        v_qty, (v_item.quantity - v_item.returned_quantity);
    end if;

    v_line_value := v_qty * v_item.unit_price * (1 - v_item.discount_percent / 100);
    v_total_return_value := v_total_return_value + v_line_value;

    update invoice_items set returned_quantity = returned_quantity + v_qty where id = v_item.id;

    v_product_id := v_item.product_id;
    v_return_delta := case when v_invoice.type = 'sale' then v_qty else -v_qty end;

    insert into stock_levels (org_id, product_id, quantity)
    values (v_org_id, v_product_id, 0)
    on conflict (org_id, product_id) do nothing;

    select quantity into v_current_qty
    from stock_levels where org_id = v_org_id and product_id = v_product_id for update;

    insert into stock_movements (org_id, product_id, movement_type, quantity, reference_type, reference_id, created_by)
    values (
      v_org_id, v_product_id,
      case when v_invoice.type = 'sale' then 'return_in' else 'return_out' end,
      v_qty, 'return', p_return_id, auth.uid()
    );

    update stock_levels
    set quantity = greatest(0, v_current_qty + v_return_delta), updated_at = now()
    where org_id = v_org_id and product_id = v_product_id;
  end loop;

  v_new_subtotal := v_invoice.subtotal - v_total_return_value;
  v_new_tax := (v_new_subtotal - v_invoice.discount_amount) * (v_invoice.tax_rate / 100);
  v_new_total := (v_new_subtotal - v_invoice.discount_amount) + v_new_tax;

  v_new_paid := v_invoice.paid_amount;
  if v_new_paid > v_new_total then
    v_credit_amount := v_new_paid - v_new_total;
    v_new_paid := v_new_total;

    v_party_type := case when v_invoice.type = 'sale' then 'client' else 'supplier' end;
    v_party_id := coalesce(v_invoice.client_id, v_invoice.supplier_id);

    insert into payments (id, org_id, invoice_id, amount, payment_date, method, reference_number, notes, party_type, party_id, idempotency_key, created_by)
    values (
      gen_random_uuid(), v_org_id, null, v_credit_amount, current_date, 'other', '',
      'رصيد ناتج عن مرتجع فاتورة ' || v_invoice.invoice_number, v_party_type, v_party_id,
      md5(p_return_id::text || ':credit')::uuid, auth.uid()
    );
  end if;

  update invoices
  set subtotal = v_new_subtotal,
      tax_amount = v_new_tax,
      total_amount = v_new_total,
      paid_amount = v_new_paid,
      status = case when v_new_paid >= v_new_total then 'paid' when v_new_paid > 0 then 'partial' else 'pending' end,
      notes = coalesce(v_invoice.notes, '') || ' | مرتجع: ' || coalesce(p_reason, 'بدون سبب محدد')
  where id = p_invoice_id;

  insert into invoice_returns (id, org_id, invoice_id, reason, total_amount, created_by)
  values (p_return_id, v_org_id, p_invoice_id, p_reason, v_total_return_value, auth.uid());

  return jsonb_build_object(
    'status', 'applied',
    'return_value', v_total_return_value,
    'credit_issued', v_credit_amount,
    'new_total_amount', v_new_total,
    'new_paid_amount', v_new_paid
  );
end;
$BODY2$;

revoke execute on function public.record_invoice_return(uuid, uuid, jsonb, text) from public;
grant execute on function public.record_invoice_return(uuid, uuid, jsonb, text) to authenticated;
