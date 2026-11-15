// تحديث متفائل للمخزون في واجهة المتصفح (للعرض الفوري بس — السيرفر هو المرجع).
// نفس سلوك الطريقة القديمة: الرصيد مايقلش عن صفر، ويتعمل صف جديد لو المنتج ملوش صف وdelta موجب.
// بيرجّع مصفوفة جديدة ومابيعدّلش الأصلية.
export function applyStockDeltaLocal(levels, productId, delta, makeId) {
  const out = levels.map((sl) =>
    sl.product_id === productId ? { ...sl, quantity: Math.max(0, (+sl.quantity || 0) + delta) } : sl
  );
  if (!out.some((sl) => sl.product_id === productId) && delta > 0) {
    out.push({ id: makeId(), product_id: productId, quantity: delta });
  }
  return out;
}
