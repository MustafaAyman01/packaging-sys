-- ============================================================
-- apply_stock_delta: تعديل رصيد المخزون كـ delta ذرّي على السيرفر.
-- بديل لكتابة الرصيد كرقم مطلق محسوب من نسخة المتصفح (اللي كانت بتمسح أي تعديل
-- حصل في نفس اللحظة من تاب تاني أو من بيع POS). نفس سلوك "حذّر واسمح": الرصيد مايقلش عن صفر.
-- ⚠️ لازم يتطبّق على Production قبل نشر الواجهة اللي بتناديه.
-- ============================================================
create or replace function public.apply_stock_delta(p_product_id uuid, p_delta numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid := get_my_org_id();
  v_id uuid;
  v_prev numeric;
  v_new numeric;
begin
  if v_org_id is null then
    raise exception 'Not authorized';
  end if;
  if p_product_id is null or p_delta is null then
    raise exception 'p_product_id and p_delta are required';
  end if;
  if not exists (select 1 from products where id = p_product_id and org_id = v_org_id) then
    raise exception 'product % not found in this organization', p_product_id;
  end if;

  -- نفس نمط create_invoice_with_effects: نضمن وجود الصف، وبعدين نقفله قبل التعديل
  insert into stock_levels (org_id, product_id, quantity)
  values (v_org_id, p_product_id, 0)
  on conflict (org_id, product_id) do nothing;

  select id, quantity into v_id, v_prev
  from stock_levels
  where org_id = v_org_id and product_id = p_product_id
  for update;

  v_new := greatest(0, v_prev + p_delta);

  update stock_levels set quantity = v_new, updated_at = now() where id = v_id;

  return jsonb_build_object('id', v_id, 'previous', v_prev, 'quantity', v_new);
end;
$$;

revoke execute on function public.apply_stock_delta(uuid, numeric) from public;
grant execute on function public.apply_stock_delta(uuid, numeric) to authenticated;
