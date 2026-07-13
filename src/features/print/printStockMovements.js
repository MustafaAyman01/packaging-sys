import { fc, fd, today } from "../../utils/format";

const TYPE_LABELS = {
  in: "⬇ وارد",
  out: "⬆ صادر",
  return_in: "↩️ مرتجع مبيعات",
  return_out: "↪️ مرتجع مشتريات",
};

export function printStockMovements(movements, products, units, org) {
  const rows = movements
    .map((m, i) => {
      const prod = products.find((p) => p.id === m.product_id);
      const unit = units.find((u) => u.id === prod?.unit_id);
      const label = m.reference_type === "waste" || m.reference_type === "surplus" || m.reference_type === "adjustment"
        ? { waste: "🗑️ هالك", surplus: "➕ زيادة", adjustment: "⚖️ تسوية" }[m.reference_type]
        : TYPE_LABELS[m.movement_type] || m.movement_type;
      return `<tr>
      <td style="text-align:center;color:#6b6456">${i + 1}</td>
      <td style="text-align:center">${fd(m.created_at)}</td>
      <td><strong>${prod?.name || "—"}</strong></td>
      <td style="text-align:center"><code>${prod?.sku || "—"}</code></td>
      <td style="text-align:center">${label}</td>
      <td style="text-align:center;font-weight:700">${m.quantity.toLocaleString()} ${unit?.abbreviation || ""}</td>
      <td style="text-align:center">${m.unit_cost ? fc(m.unit_cost) : "—"}</td>
      <td style="text-align:center">${m.unit_cost ? fc(m.quantity * m.unit_cost) : "—"}</td>
      <td style="color:#6b6456;font-size:11px">${m.notes || "—"}</td>
    </tr>`;
    })
    .join("");
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>حركات المخزون</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl;background:#fff;color:#1a1814;font-size:12px;padding:12mm}
h1{font-size:19px;margin-bottom:4px}
.meta{display:flex;justify-content:space-between;color:#6b6456;font-size:12px;margin-bottom:14px;border-bottom:2px solid #1a1814;padding-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#1a1814;color:#fff;padding:7px 6px;text-align:center;font-weight:500;font-size:10.5px}
td{padding:6px;border-bottom:1px solid #e5e1d8}
.print-btn{position:fixed;bottom:20px;left:20px;background:#0d7a7a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
<h1>سجل حركات المخزون</h1>
<div class="meta">
  <span>${org?.name_ar || org?.name || "المنشأة"}</span>
  <span>تاريخ الطباعة: ${fd(today())} — عدد الحركات: ${movements.length}</span>
</div>
<table><thead><tr>
  <th>#</th><th>التاريخ</th><th>المنتج</th><th>الكود</th><th>النوع</th>
  <th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th><th>ملاحظات</th>
</tr></thead>
<tbody>${rows || `<tr><td colspan="9" style="text-align:center;color:#9c9080">لا توجد حركات</td></tr>`}</tbody></table>
<script>window.onload=()=>{ setTimeout(()=>window.print(),400); }<\/script>
</body></html>`);
  w.document.close();
}
