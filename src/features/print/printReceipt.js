import { fc, fd } from "../../utils/format";

// قالب طباعة إيصال مخصوص لطابعات الريسيت الحرارية (80mm) — منفصل تمامًا عن
// قالب A4 الموجود في printInvoice.js، لأن التصميمين مختلفين جذريًا (عمود واحد
// ضيق، خط أكبر نسبيًا، بدون توقيعات، مقاس ورقة فعلي 80mm مش A4).
//
// invoice: { invoice_number, invoice_date, subtotal, tax_amount, total_amount, paid_amount }
// items: [{ name, quantity, unit_price, total_price }]
// org: { name, name_ar, phone, address }
export function printReceipt(invoice, items, org) {
  const companyName = org?.name_ar || org?.name || "مصنع الملابس";
  const w = window.open("", "_blank", "width=400,height=700");
  if (!w) return;

  const rows = (items || [])
    .map(
      (it) => `
    <div class="line">
      <div class="name">${it.name || ""}</div>
      <div class="qty-price">
        <span>${(it.quantity || 0).toLocaleString("en-EG")} × ${fc(it.unit_price)}</span>
        <span class="line-total">${fc(it.total_price)}</span>
      </div>
    </div>`
    )
    .join("");

  const remaining = (invoice.total_amount || 0) - (invoice.paid_amount || 0);

  w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>إيصال ${invoice.invoice_number || ""}</title>
<style>
  @page { size: 80mm auto; margin: 3mm 4mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Tahoma', 'Arial', sans-serif;
    width: 72mm;
    margin: 0 auto;
    font-size: 12px;
    color: #000;
  }
  .center { text-align: center; }
  .company-name { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  .company-sub { font-size: 11px; color: #444; margin-bottom: 8px; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .meta-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; }
  .line { margin-bottom: 6px; }
  .name { font-weight: 600; font-size: 12px; }
  .qty-price { display: flex; justify-content: space-between; font-size: 11px; color: #333; }
  .line-total { font-weight: 600; color: #000; }
  .totals-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
  .grand-total { font-size: 17px; font-weight: 800; display: flex; justify-content: space-between; margin-top: 6px; }
  .footer { text-align: center; font-size: 11px; color: #444; margin-top: 10px; }
  .print-btn { display: block; width: 100%; margin-top: 14px; padding: 10px; font-size: 14px; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
  <div class="center">
    <div class="company-name">${companyName}</div>
    ${org?.phone ? `<div class="company-sub">${org.phone}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="meta-row"><span>رقم الفاتورة</span><span>${invoice.invoice_number || ""}</span></div>
  <div class="meta-row"><span>التاريخ</span><span>${fd(invoice.invoice_date || new Date())}</span></div>
  <div class="divider"></div>

  ${rows}

  <div class="divider"></div>
  <div class="totals-row"><span>الإجمالي قبل الضريبة</span><span>${fc(invoice.subtotal)}</span></div>
  <div class="totals-row"><span>الضريبة</span><span>${fc(invoice.tax_amount)}</span></div>
  <div class="grand-total"><span>الإجمالي</span><span>${fc(invoice.total_amount)}</span></div>
  <div class="totals-row"><span>المدفوع</span><span>${fc(invoice.paid_amount)}</span></div>
  ${remaining > 0.01 ? `<div class="totals-row"><span>المتبقي</span><span>${fc(remaining)}</span></div>` : ""}

  <div class="divider"></div>
  <div class="footer">شكرًا لتعاملكم معنا 🙏</div>

  <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
  <script>window.onload=()=>{ setTimeout(()=>window.print(),400); }<\/script>
</body>
</html>`);
  w.document.close();
}
