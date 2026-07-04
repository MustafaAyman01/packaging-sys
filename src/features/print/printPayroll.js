import { fc, fd, today } from "../../utils/format";

export function printPayrollSheet(month, payments, employees, org) {
  const rows = payments
    .map((sp, i) => {
      const emp = employees.find((e) => e.id === sp.employee_id);
      const net = sp.net_amount ?? sp.amount;
      return `<tr>
      <td style="text-align:center;color:#6b6456">${i + 1}</td>
      <td><strong>${emp?.name || "—"}</strong></td>
      <td style="text-align:center">${fc(sp.base_salary ?? sp.amount)}</td>
      <td style="text-align:center;color:#16a34a">${sp.overtime_amount > 0 ? "+ " + fc(sp.overtime_amount) : "—"}</td>
      <td style="text-align:center;color:#dc2626">${sp.deduction_amount > 0 ? "- " + fc(sp.deduction_amount) : "—"}</td>
      <td style="text-align:center;color:#dc2626">${sp.penalties_amount > 0 ? "- " + fc(sp.penalties_amount) : "—"}</td>
      <td style="text-align:center;color:#dc2626">${sp.advance_deduction > 0 ? "- " + fc(sp.advance_deduction) : "—"}</td>
      <td style="text-align:center;font-weight:700">${fc(net)}</td>
    </tr>`;
    })
    .join("");
  const totalNet = payments.reduce((s, sp) => s + (sp.net_amount ?? sp.amount), 0);
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف مرتبات ${month}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl;background:#fff;color:#1a1814;font-size:12.5px;padding:12mm}
h1{font-size:19px;margin-bottom:4px}
.sub{color:#6b6456;font-size:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1a1814;color:#fff;padding:7px 8px;text-align:right;font-weight:500;font-size:11px}
td{padding:7px 8px;border-bottom:1px solid #e5e1d8}
.final{margin-top:14px;text-align:left;font-size:15px;font-weight:700}
.print-btn{position:fixed;bottom:20px;left:20px;background:#0d7a7a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
<h1>كشف مرتبات شهر ${month}</h1>
<div class="sub">${org?.name_ar || org?.name || "باك سيستم"} — عدد الموظفين المصروف لهم: ${payments.length} — تاريخ الطباعة: ${fd(today())}</div>
<table><thead><tr><th>#</th><th>الموظف</th><th>الأساسي</th><th>أوفر تايم</th><th>خصم حضور</th><th>جزاءات</th><th>سلفة</th><th>الصافي</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="final">إجمالي المرتبات الصافية المصروفة: ${fc(totalNet)}</div>
<script>window.onload=()=>{ setTimeout(()=>window.print(),400); }<\/script>
</body></html>`);
  w.document.close();
}
