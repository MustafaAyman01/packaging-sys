export const IMPORT_TARGETS = {
  products: {
    label: "المنتجات",
    fields: [
      {
        key: "sku",
        label: "كود المنتج (SKU)",
        required: true,
      },
      {
        key: "name",
        label: "اسم المنتج",
        required: true,
      },
      {
        key: "category_name",
        label: "اسم الفئة",
        required: false,
      },
      {
        key: "unit_name",
        label: "اسم الوحدة",
        required: false,
      },
      {
        key: "cost_price",
        label: "سعر التكلفة",
        required: false,
      },
      {
        key: "sale_price",
        label: "سعر البيع",
        required: true,
      },
      {
        key: "min_stock_level",
        label: "حد إعادة الطلب",
        required: false,
      },
      {
        key: "quantity",
        label: "الكمية الافتتاحية بالمخزون",
        required: false,
      },
    ],
  },
  clients: {
    label: "العملاء",
    fields: [
      {
        key: "name",
        label: "الاسم",
        required: true,
      },
      {
        key: "phone",
        label: "الهاتف",
        required: false,
      },
      {
        key: "email",
        label: "البريد الإلكتروني",
        required: false,
      },
      {
        key: "address",
        label: "العنوان",
        required: false,
      },
      {
        key: "tax_number",
        label: "الرقم الضريبي",
        required: false,
      },
    ],
  },
  suppliers: {
    label: "الموردون",
    fields: [
      {
        key: "name",
        label: "الاسم",
        required: true,
      },
      {
        key: "phone",
        label: "الهاتف",
        required: false,
      },
      {
        key: "email",
        label: "البريد الإلكتروني",
        required: false,
      },
      {
        key: "address",
        label: "العنوان",
        required: false,
      },
      {
        key: "tax_number",
        label: "الرقم الضريبي",
        required: false,
      },
    ],
  },
  employees: {
    label: "الموظفون",
    fields: [
      {
        key: "name",
        label: "الاسم",
        required: true,
      },
      {
        key: "job_title",
        label: "الوظيفة",
        required: false,
      },
      {
        key: "department",
        label: "القسم",
        required: false,
      },
      {
        key: "phone",
        label: "الهاتف",
        required: false,
      },
      {
        key: "email",
        label: "البريد الإلكتروني",
        required: false,
      },
      {
        key: "hire_date",
        label: "تاريخ التعيين (YYYY-MM-DD)",
        required: false,
      },
      {
        key: "salary",
        label: "الراتب",
        required: true,
      },
    ],
  },
};
