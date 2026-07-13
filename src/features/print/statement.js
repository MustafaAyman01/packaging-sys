import { fc, fd, today } from "../../utils/format";

export function buildStatementEntries(party, partyType, data) {
  // partyType: "client" -> sale invoices, "supplier" -> purchase invoices
  const invType = partyType === "client" ? "sale" : "purchase";
  const idField = partyType === "client" ? "client_id" : "supplier_id";
  const invoices = data.invoices.filter((i) => i[idField] === party.id && i.status !== "cancelled");
  const invoiceIds = new Set(invoices.map((i) => i.id));
  // دفعات مرتبطة بفاتورة معينة، بالإضافة لدفعات "على الحساب" غير مخصصة (invoice_id = null)
  // ومربوطة مباشرة بهذا العميل/المورد عبر party_id
  const payments = data.payments.filter(
    (p) =>
      invoiceIds.has(p.invoice_id) || (p.party_type === partyType && p.party_id === party.id && !p.invoice_id)
  );
  const entries = [];
  invoices.forEach((inv) => {
    entries.push({
      date: inv.invoice_date,
      type: "invoice",
      label: `فاتورة ${inv.invoice_number}`,
      debit: invType === "sale" ? inv.total_amount : 0,
      // عليه (مدين) — مستحق منه
      credit: invType === "purchase" ? inv.total_amount : 0,
      // عليه (دائن) — مستحق له
      ref: inv,
    });
  });
  payments.forEach((p) => {
    const inv = data.invoices.find((i) => i.id === p.invoice_id);
    entries.push({
      date: p.payment_date,
      type: "payment",
      label: inv
        ? `دفعة ${invType === "sale" ? "محصّلة" : "مدفوعة"} — فاتورة ${inv.invoice_number}`
        : `دفعة ${invType === "sale" ? "محصّلة" : "مدفوعة"} — مقدم غير مخصص لفاتورة`,
      debit: invType === "purchase" ? p.amount : 0,
      credit: invType === "sale" ? p.amount : 0,
      ref: p,
    });
  });
  entries.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.type === "invoice" ? -1 : 1));
  let running = 0;
  entries.forEach((e) => {
    // للعميل: الفاتورة (مدين) بتزوّد المستحق منه، والدفعة (دائن) بتقلله.
    // للمورد: الفاتورة (دائن) بتزوّد اللي علينا ليه، والدفعة (مدين) بتقلله —
    // يعني الاتجاه هنا عكس العميل، فلازم نعكس المعادلة عشان "الرصيد" يفضل معناه
    // ثابت: موجب = مستحق منه/عليه، سالب = هو اللي له رصيد عندنا (دفع بزيادة).
    running += invType === "sale" ? e.debit - e.credit : e.credit - e.debit;
    e.balance = running;
  });
  return entries;
}
export function printStatement(party, partyType, entries, org) {
  const title = partyType === "client" ? "كشف حساب عميل" : "كشف حساب مورد";
  const finalBalance = entries.length ? entries[entries.length - 1].balance : 0;
  const rows = entries
    .map(
      (e) => `<tr>
    <td>${fd(e.date)}</td>
    <td>${e.label}</td>
    <td style="text-align:center">${e.debit > 0 ? fc(e.debit) : "—"}</td>
    <td style="text-align:center">${e.credit > 0 ? fc(e.credit) : "—"}</td>
    <td style="text-align:center;font-weight:700">${fc(e.balance)}</td>
  </tr>`
    )
    .join("");
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${title} - ${party.name}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl;background:#fff;color:#1a1814;font-size:13px;padding:14mm}
h1{font-size:20px;margin-bottom:4px}
.sub{color:#6b6456;font-size:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{background:#1a1814;color:#fff;padding:8px 10px;text-align:right;font-weight:500}
td{padding:8px 10px;border-bottom:1px solid #e5e1d8}
.final{margin-top:14px;text-align:left;font-size:15px;font-weight:700}
.print-btn{position:fixed;bottom:20px;left:20px;background:#A9743E;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
<h1>${title}: ${party.name}</h1>
<div class="sub">${org?.name_ar || org?.name || "مصنع الملابس"} — تاريخ الطباعة: ${fd(today())}</div>
<table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="final">الرصيد النهائي: ${fc(Math.abs(finalBalance))} ${
    finalBalance > 0.01
      ? partyType === "client"
        ? "(مستحق من العميل)"
        : "(مستحق له)"
      : finalBalance < -0.01
      ? partyType === "client"
        ? "(له رصيد لدينا)"
        : "(لنا رصيد عنده)"
      : ""
  }</div>
<script>window.onload=()=>{ setTimeout(()=>window.print(),400); }<\/script>
</body></html>`);
  w.document.close();
}
