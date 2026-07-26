// حساب رصيد عميل أو مورد — نفس المنطق ده كان اتكرر في 4 أماكن مختلفة في الكود
// (صفحة العملاء، الموردين، الدفعات، والتقارير)، فاتنقل هنا في مكان واحد بس عشان
// أي تصحيح في المستقبل يتطبق في كل مكان مرة واحدة.
//
// الرصيد = (إجمالي فواتيره غير الملغاة - المدفوع منها) - أي دفعة "على الحساب"
// مش مربوطة بفاتورة معينة (بتمثل مقدم/رصيد له).

export function getPartyBalance(data, partyType, partyId) {
  if (!partyId) return 0;
  const invField = partyType === "client" ? "client_id" : "supplier_id";
  const invType = partyType === "client" ? "sale" : "purchase";
  const invBalance = data.invoices
    .filter((i) => i[invField] === partyId && i.type === invType && i.status !== "cancelled")
    .reduce((s, i) => s + (i.total_amount - i.paid_amount), 0);
  const unapplied = data.payments
    .filter((p) => !p.invoice_id && p.party_type === partyType && p.party_id === partyId)
    .reduce((s, p) => s + p.amount, 0);
  return invBalance - unapplied;
}

// نسخة "مجمّعة" بتحسب الدفعات غير المخصصة لكل الأطراف مرة واحدة، لتفادي إعادة
// الفلترة على data.payments لكل عميل/مورد لوحده (مفيدة في الصفحات اللي بتلف على
// قائمة كاملة زي التقارير وكشف المديونيات).
export function getUnappliedMap(data, partyType) {
  const map = {};
  data.payments.forEach((p) => {
    if (p.invoice_id) return;
    if (p.party_type !== partyType) return;
    map[p.party_id] = (map[p.party_id] || 0) + p.amount;
  });
  return map;
}
