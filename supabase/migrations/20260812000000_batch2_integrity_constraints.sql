-- ============================================================
-- Batch 2 — قيود سلامة البيانات
-- موثّق بأثر رجعي: اتطبّق فعليًا على Production بعد فحص إن صفر سجل بيخالفها.
-- ============================================================
alter table public.stock_levels
  add constraint stock_levels_quantity_non_negative check (quantity >= 0);

alter table public.invoices
  add constraint invoices_paid_not_exceeding_total check (paid_amount <= total_amount);
