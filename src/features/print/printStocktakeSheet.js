import { fc, fd, today } from "../../utils/format";

// محضر جرد مخزون احترافي: بيوضح لكل منتج الرصيد الدفتري، الجرد الفعلي، الفرق،
// وقيمة الفرق بسعر التكلفة، بالإضافة لتوقيعات معتمدة في الآخر.
export function printStocktakeSheet(rows, org, meta) {
  const counted = rows.filter((r) => r.counted !== "" && r.counted != null);
  const diffRows = counted.filter((r) => r.diff !== 0);
  const totalDiffValue = diffRows.reduce((s, r) => s + r.diffValue, 0);
  const rowsHtml = rows
    .map((r, i) => {
      const hasCount = r.counted !== "" && r.counted != null;
      const diffColor = !hasCount ? "#9c9080" : r.diff > 0 ? "#16a34a" : r.diff < 0 ? "#dc2626" : "#6b6456";
      return `<tr>
      <td style="text-align:center;color:#6b6456">${i + 1}</td>
      <td><strong>${r.name}</strong></td>
      <td style="text-align:center"><code>${r.sku || "—"}</code></td>
      <td style="text-align:center">${r.unit || "—"}</td>
      <td style="text-align:center">${r.system.toLocaleString()}</td>
      <td style="text-align:center;font-weight:700">${hasCount ? Number(r.counted).toLocaleString() : "—"}</td>
      <td style="text-align:center;font-weight:700;color:${diffColor}">${
        hasCount ? (r.diff > 0 ? "+" : "") + r.diff.toLocaleString() : "—"
      }</td>
      <td style="text-align:center;color:${diffColor}">${hasCount && r.diff !== 0 ? fc(r.diffValue) : "—"}</td>
    </tr>`;
    })
    .join("");
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>محضر جرد مخزون</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl;background:#fff;color:#1a1814;font-size:12px;padding:12mm}
h1{font-size:19px;margin-bottom:4px}
.meta{display:flex;justify-content:space-between;color:#6b6456;font-size:12px;margin-bottom:14px;border-bottom:2px solid #1a1814;padding-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th{background:#1a1814;color:#fff;padding:7px 6px;text-align:center;font-weight:500;font-size:10.5px}
td{padding:6px;border-bottom:1px solid #e5e1d8}
.summary{margin-top:14px;display:flex;justify-content:flex-end;gap:24px;font-size:13px;font-weight:700}
.summary span.label{font-weight:400;color:#6b6456;margin-left:6px}
.signatures{margin-top:50px;display:flex;justify-content:space-between}
.sig{width:30%;text-align:center}
.sig .line{border-top:1px solid #1a1814;margin-top:40px;padding-top:6px;font-size:12px}
.print-btn{position:fixed;bottom:20px;left:20px;background:#0d7a7a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
<h1>محضر جرد مخزون</h1>
<div class="meta">
  <span>${org?.name_ar || org?.name || "المنشأة"}</span>
  <span>تاريخ الجرد: ${fd(meta?.date || today())} — رقم الجلسة: ${meta?.sessionLabel || "—"}</span>
</div>
<table><thead><tr>
  <th>#</th><th>المنتج</th><th>الكود</th><th>الوحدة</th>
  <th>الرصيد الدفتري</th><th>الجرد الفعلي</th><th>الفرق</th><th>قيمة الفرق</th>
</tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="8" style="text-align:center;color:#9c9080">لا توجد أصناف</td></tr>`}</tbody></table>
<div class="summary">
  <div><span class="label">عدد الأصناف المجرودة:</span>${counted.length} من ${rows.length}</div>
  <div><span class="label">عدد الأصناف المختلفة:</span>${diffRows.length}</div>
  <div><span class="label">إجمالي قيمة الفروقات:</span>${fc(totalDiffValue)}</div>
</div>
<div class="signatures">
  <div class="sig"><div class="line">قام بالجرد</div></div>
  <div class="sig"><div class="line">راجع الجرد</div></div>
  <div class="sig"><div class="line">اعتماد الإدارة</div></div>
</div>
<script>window.onload=()=>{ setTimeout(()=>window.print(),400); }<\/script>
</body></html>`);
  w.document.close();
}
