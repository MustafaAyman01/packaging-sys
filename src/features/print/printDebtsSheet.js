import { fc, fd, today } from "../../utils/format";

export function printDebtsSheet(clientDebts, supplierDebts, org) {
  const clientRows = clientDebts
    .map(
      (c, i) => `<tr>
      <td style="text-align:center;color:#6b6456">${i + 1}</td>
      <td><strong>${c.name}</strong></td>
      <td style="text-align:center">${c.phone || "—"}</td>
      <td style="text-align:center;font-weight:700;color:#dc2626">${fc(c.balance)}</td>
    </tr>`
    )
    .join("");
  const supplierRows = supplierDebts
    .map(
      (s, i) => `<tr>
      <td style="text-align:center;color:#6b6456">${i + 1}</td>
      <td><strong>${s.name}</strong></td>
      <td style="text-align:center">${s.phone || "—"}</td>
      <td style="text-align:center;font-weight:700;color:#c47f0a">${fc(s.balance)}</td>
    </tr>`
    )
    .join("");
  const totalClientDebts = clientDebts.reduce((s, c) => s + c.balance, 0);
  const totalSupplierDebts = supplierDebts.reduce((s, sp) => s + sp.balance, 0);
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف مديونيات</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl;background:#fff;color:#1a1814;font-size:12.5px;padding:12mm}
h1{font-size:19px;margin-bottom:4px}
h2{font-size:14px;margin:18px 0 8px}
.sub{color:#6b6456;font-size:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1a1814;color:#fff;padding:7px 8px;text-align:right;font-weight:500;font-size:11px}
td{padding:7px 8px;border-bottom:1px solid #e5e1d8}
.final{margin-top:10px;text-align:left;font-size:14px;font-weight:700}
.print-btn{position:fixed;bottom:20px;left:20px;background:#0d7a7a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
<h1>كشف مديونيات شامل</h1>
<div class="sub">${org?.name_ar || org?.name || "باك سيستم"} — تاريخ الطباعة: ${fd(today())}</div>
<h2>مستحقات على العملاء (مدين)</h2>
<table><thead><tr><th>#</th><th>العميل</th><th>الهاتف</th><th>المبلغ المستحق</th></tr></thead>
<tbody>${clientRows || `<tr><td colspan="4" style="text-align:center;color:#9c9080">لا توجد مديونيات</td></tr>`}</tbody></table>
<div class="final">إجمالي مستحق على العملاء: ${fc(totalClientDebts)}</div>
<h2>مستحقات للموردين (دائن)</h2>
<table><thead><tr><th>#</th><th>المورد</th><th>الهاتف</th><th>المبلغ المستحق</th></tr></thead>
<tbody>${supplierRows || `<tr><td colspan="4" style="text-align:center;color:#9c9080">لا توجد مديونيات</td></tr>`}</tbody></table>
<div class="final">إجمالي مستحق للموردين: ${fc(totalSupplierDebts)}</div>
<script>window.onload=()=>{ setTimeout(()=>window.print(),400); }<\/script>
</body></html>`);
  w.document.close();
}
