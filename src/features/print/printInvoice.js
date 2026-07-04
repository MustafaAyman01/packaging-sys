import { fc, fd } from "../../utils/format";

export function printInvoice(inv, data, org) {
  const companyName = org?.name_ar || org?.name || "باك سيستم";
  const companySub = "معرض التعبئة والتغليف";
  const companyLogoHtml = org?.logo_url
    ? `<img src="${org.logo_url}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
    : "📦";
  const footerLogoHtml = org?.logo_url
    ? `<img src="${org.logo_url}" alt="logo" style="height:16px;vertical-align:middle;border-radius:3px;margin-left:4px">`
    : "📦";
  const client = data.clients.find((c) => c.id === inv.client_id);
  const supplier = data.suppliers.find((s) => s.id === inv.supplier_id);
  const party = inv.type === "sale" ? client : supplier;
  const statusMap = {
    paid: {
      label: "مدفوعة",
      bg: "#dcfce7",
      color: "#166534",
    },
    partial: {
      label: "جزئي",
      bg: "#fef3c7",
      color: "#92400e",
    },
    confirmed: {
      label: "مؤكدة",
      bg: "#dbeafe",
      color: "#1e40af",
    },
    cancelled: {
      label: "ملغاة",
      bg: "#fee2e2",
      color: "#991b1b",
    },
    draft: {
      label: "مسودة",
      bg: "#f3f4f6",
      color: "#374151",
    },
  };
  const st = statusMap[inv.status] || statusMap.draft;
  const remaining = Math.max(0, inv.total_amount - inv.paid_amount);
  const clientTotalDue =
    inv.type === "sale" && inv.client_id
      ? data.invoices
          .filter((i) => i.type === "sale" && i.client_id === inv.client_id && i.status !== "cancelled")
          .reduce((s, i) => s + Math.max(0, i.total_amount - i.paid_amount), 0)
      : 0;
  let serial = 0;
  const rows = (inv.items || [])
    .map((item) => {
      const prod = data.products.find((p) => p.id === item.product_id);
      const unit = data.units.find((u) => u.id === prod?.unit_id);
      const displayName = item.product_name || prod?.name || "—";
      const displaySku = item.product_sku || prod?.sku || "";
      serial++;
      const lineTotal = item.quantity * item.unit_price * (1 - item.discount_percent / 100);
      return `<tr>
      <td style="text-align:center;color:#6b6456">${serial}</td>
      <td><strong>${displayName}</strong>${displaySku ? `<br><span style="font-size:10px;color:#9c9080">${displaySku}</span>` : ""}</td>
      <td style="text-align:center">${item.quantity.toLocaleString("en-EG")}</td>
      <td style="text-align:center;color:#6b6456">${unit?.abbreviation || ""}</td>
      <td style="text-align:center">${fc(item.unit_price)}</td>
      <td style="text-align:center;color:${item.discount_percent > 0 ? "#16a34a" : "#9c9080"}">${item.discount_percent > 0 ? item.discount_percent + "%" : "—"}</td>
      <td style="text-align:center;font-weight:700;color:#1a1814">${fc(lineTotal)}</td>
    </tr>`;
    })
    .join("");
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>فاتورة ${inv.invoice_number}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl;background:#fff;color:#1a1814;font-size:13px;line-height:1.5}
  .page{max-width:210mm;margin:0 auto;padding:12mm 14mm;min-height:297mm;display:flex;flex-direction:column}

  /* ─── HEADER ─── */
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm;padding-bottom:5mm;border-bottom:3px solid #1a1814}
  .brand{display:flex;align-items:center;gap:10px}
  .brand-icon{width:44px;height:44px;background:#0d7a7a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
  .brand-name{font-size:20px;font-weight:700;color:#1a1814;line-height:1.2}
  .brand-sub{font-size:11px;color:#6b6456;margin-top:2px}
  .inv-meta{text-align:left}
  .inv-type{font-size:11px;color:#9c9080;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
  .inv-num{font-size:24px;font-weight:700;color:#0d7a7a;line-height:1}
  .inv-dates{margin-top:6px;font-size:11px;color:#6b6456;line-height:1.7}
  .inv-dates strong{color:#1a1814}
  .status-pill{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-top:6px;background:${st.bg};color:${st.color}}

  /* ─── PARTIES ─── */
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:6mm}
  .party{border:1px solid #e5e1d8;border-radius:8px;padding:4mm;background:#f9f8f5}
  .party-lbl{font-size:9px;color:#9c9080;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
  .party-name{font-size:14px;font-weight:700;color:#1a1814;margin-bottom:3px}
  .party-detail{font-size:11px;color:#6b6456;line-height:1.6}

  /* ─── TABLE ─── */
  .items-table{width:100%;border-collapse:collapse;margin-bottom:5mm;font-size:12.5px}
  .items-table thead tr{background:#1a1814}
  .items-table th{padding:8px 10px;color:#e8e4dd;font-weight:500;text-align:right;font-size:11px}
  .items-table th:not(:first-child):not(:nth-child(2)){text-align:center}
  .items-table td{padding:9px 10px;border-bottom:1px solid #e5e1d8;vertical-align:middle}
  .items-table tbody tr:nth-child(even) td{background:#f9f8f5}
  .items-table tbody tr:last-child td{border-bottom:2px solid #1a1814}

  /* ─── TOTALS ─── */
  .bottom{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6mm}
  .notes-box{flex:1;margin-left:8mm;background:#f9f8f5;border:1px solid #e5e1d8;border-radius:8px;padding:4mm;font-size:11.5px;color:#6b6456;min-height:30mm}
  .notes-lbl{font-size:10px;font-weight:700;color:#9c9080;text-transform:uppercase;margin-bottom:4px}
  .totals{width:68mm;border:2px solid #e5e1d8;border-radius:8px;overflow:hidden}
  .t-row{display:flex;justify-content:space-between;padding:5px 10px;font-size:12px;border-bottom:1px solid #e5e1d8}
  .t-row:last-child{border-bottom:none}
  .t-label{color:#6b6456}
  .t-val{font-weight:500;color:#1a1814}
  .t-final{background:#1a1814;padding:8px 10px;display:flex;justify-content:space-between;font-weight:700;font-size:14px;color:#fff}
  .t-paid{background:#f0fdf4;padding:5px 10px;display:flex;justify-content:space-between;font-size:12px;color:#166534;font-weight:500}
  .t-remain{background:#fef2f2;padding:5px 10px;display:flex;justify-content:space-between;font-size:12.5px;color:#dc2626;font-weight:700}
  .t-client-due{background:#fffbeb;padding:6px 10px;display:flex;justify-content:space-between;font-size:12px;color:#92400e;font-weight:700;border-top:1px dashed #e5e1d8}

  /* ─── FOOTER ─── */
  .footer{margin-top:auto;padding-top:4mm;border-top:1px solid #e5e1d8;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#9c9080}
  .footer-logo{font-size:12px;font-weight:600;color:#1a1814}
  .sig-box{border:1px solid #e5e1d8;border-radius:6px;padding:6px 16px;font-size:10px;color:#9c9080;text-align:center;min-width:40mm}
  .sig-line{height:20px;border-bottom:1px solid #d4cfc4;margin-bottom:4px}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{padding:8mm 10mm}
    .no-screen{display:block}
  }
  .print-btn{position:fixed;bottom:20px;left:20px;background:#0d7a7a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600;box-shadow:0 4px 12px rgba(13,122,122,.4);z-index:99}
  .print-btn:hover{background:#0a5e5e}
  @media print{.print-btn{display:none}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="brand">
      <div class="brand-icon">${companyLogoHtml}</div>
      <div>
        <div class="brand-name">${companyName}</div>
        <div class="brand-sub">${companySub}</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-type">${inv.type === "sale" ? "فاتورة مبيعات" : "فاتورة مشتريات"}</div>
      <div class="inv-num">${inv.invoice_number}</div>
      <div class="inv-dates">
        <span>تاريخ الفاتورة: <strong>${fd(inv.invoice_date)}</strong></span><br>
        <span>تاريخ الاستحقاق: <strong>${fd(inv.due_date)}</strong></span>
      </div>
      <span class="status-pill">${st.label}</span>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <div class="party">
      <div class="party-lbl">من</div>
      <div class="party-name">${companyName}</div>
      <div class="party-detail">${companySub}</div>
    </div>
    <div class="party">
      <div class="party-lbl">${inv.type === "sale" ? "إلى العميل" : "من المورد"}</div>
      <div class="party-name">${party?.name || "—"}</div>
      <div class="party-detail">
        ${party?.phone ? `<span>📞 ${party.phone}</span><br>` : ""}
        ${party?.address ? `<span>📍 ${party.address}</span><br>` : ""}
        ${party?.tax_number ? `<span>رقم ضريبي: ${party.tax_number}</span>` : ""}
      </div>
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:24px">#</th>
        <th>المنتج</th>
        <th style="width:50px">الكمية</th>
        <th style="width:40px">الوحدة</th>
        <th style="width:90px">سعر الوحدة</th>
        <th style="width:50px">خصم</th>
        <th style="width:100px">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- BOTTOM: NOTES + TOTALS -->
  <div class="bottom">
    <div class="notes-box">
      <div class="notes-lbl">ملاحظات</div>
      <div>${inv.notes || "—"}</div>
    </div>
    <div class="totals">
      <div class="t-row"><span class="t-label">المجموع الفرعي</span><span class="t-val">${fc(inv.subtotal)}</span></div>
      ${inv.discount_amount > 0 ? `<div class="t-row"><span class="t-label">الخصم</span><span class="t-val" style="color:#16a34a">- ${fc(inv.discount_amount)}</span></div>` : ""}
      <div class="t-row"><span class="t-label">ضريبة (${inv.tax_rate}%)</span><span class="t-val">${fc(inv.tax_amount)}</span></div>
      <div class="t-final"><span>الإجمالي النهائي</span><span>${fc(inv.total_amount)}</span></div>
      <div class="t-paid"><span>✓ المبلغ المدفوع</span><span>${fc(inv.paid_amount)}</span></div>
      ${remaining > 0.01 ? `<div class="t-remain"><span>⏳ المبلغ المتبقي</span><span>${fc(remaining)}</span></div>` : ""}
      ${clientTotalDue > 0.01 ? `<div class="t-client-due"><span>📌 إجمالي المستحق (كل الفواتير)</span><span>${fc(clientTotalDue)}</span></div>` : ""}
    </div>
  </div>

  <!-- SIGNATURES -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;margin-bottom:6mm">
    <div class="sig-box"><div class="sig-line"></div>توقيع المستلم</div>
    <div class="sig-box"><div class="sig-line"></div>توقيع المحاسب</div>
    <div class="sig-box"><div class="sig-line"></div>ختم الشركة</div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div>
      <div class="footer-logo">${footerLogoHtml} ${companyName}</div>
      <div>${companySub}</div>
    </div>
    <div style="text-align:center;color:#d4cfc4;font-size:18px">· · ·</div>
    <div style="text-align:left">
      <div>تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG", {
        numberingSystem: "latn",
      })}</div>
      <div style="margin-top:2px">هذه الفاتورة وثيقة رسمية معتمدة</div>
    </div>
  </div>

</div>
<script>window.onload=()=>{ setTimeout(()=>window.print(),500); }<\/script>
</body></html>`);
  w.document.close();
}
