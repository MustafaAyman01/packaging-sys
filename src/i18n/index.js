// نواة نظام الترجمة: قاموس واحد لكل نص، بمفتاح إنجليزي ثابت (زي "invoices")
// وتحته النسخة العربية والإنجليزية. الهدف إن أي مكان في الكود يستخدم t(category, key)
// بدل ما يكتب النص جوه الـ JSX مباشرة، فلما نحتاج فعلياً نفعّل الإنجليزي، الشغل
// يبقى إضافة ترجمة في المكان ده بس، مش إعادة كتابة الصفحات.
//
// دلوقتي مطبّق على تسميات القايمة الجانبية بس (أكتر حاجة "هيكلية" وأقلها بيانات
// مستخدم) كمثال شغال فعلياً. باقي الصفحات لسه بتستخدم نصوص عربية مباشرة، ولما
// يبقى فيه سبب حقيقي للترجمة الكاملة، نفس النمط ده يتمد لباقي الملفات تدريجياً.

export const LANG_STORAGE_KEY = "lang";

export const STRINGS = {
  nav: {
    dashboard: { ar: "لوحة التحكم", en: "Dashboard" },
    invoices: { ar: "الفواتير", en: "Invoices" },
    clients: { ar: "العملاء", en: "Clients" },
    products: { ar: "المنتجات", en: "Products" },
    stock: { ar: "حركة المخزون", en: "Stock Movements" },
    manufacturing_orders: { ar: "أوامر التصنيع", en: "Manufacturing Orders" },
    suppliers: { ar: "الموردون", en: "Suppliers" },
    payments: { ar: "المدفوعات", en: "Payments" },
    cash_vouchers: { ar: "سندات القبض والصرف", en: "Cash Vouchers" },
    expenses: { ar: "المصروفات", en: "Expenses" },
    hr: { ar: "الموارد البشرية", en: "HR" },
    csv_import: { ar: "استيراد CSV", en: "CSV Import" },
    reports: { ar: "التقارير", en: "Reports" },
    activity_log: { ar: "سجل الأنشطة", en: "Activity Log" },
    settings: { ar: "الإعدادات", en: "Settings" },
  },
  group: {
    main: { ar: "رئيسي", en: "Main" },
    sales: { ar: "المبيعات", en: "Sales" },
    inventory: { ar: "المخزون", en: "Inventory" },
    purchasing: { ar: "المشتريات", en: "Purchasing" },
    accounts: { ar: "الحسابات", en: "Accounts" },
    hr: { ar: "الموارد البشرية", en: "HR" },
    data: { ar: "البيانات", en: "Data" },
    reports: { ar: "التقارير", en: "Reports" },
    settings: { ar: "الإعدادات", en: "Settings" },
  },
};

export function t(category, key, lang) {
  return STRINGS[category]?.[key]?.[lang] || STRINGS[category]?.[key]?.ar || key;
}
