import { sb } from "./supabaseClient";
import { generateId } from "../utils/format";

// يجيب أعلى رقم فاتورة مستخدم فعليًا من قاعدة البيانات مباشرة (مش من الذاكرة المحلية)
// عشان يتفادى تعارض الأرقام لو حد ضاف بيانات تجريبية من SQL أو من جهاز تاني
export async function fetchNextInvoiceNumber(orgId, type) {
  const prefix = type === "sale" ? "INV" : "PUR";
  const year = new Date().getFullYear();
  const yearPrefix = `${prefix}-${year}-`;
  try {
    const { data, error } = await sb
      .from("invoices")
      .select("invoice_number")
      .eq("org_id", orgId)
      .eq("type", type)
      .like("invoice_number", `${yearPrefix}%`);
    if (error || !data) return `${yearPrefix}001`;
    let max = 0;
    data.forEach((row) => {
      const n = parseInt((row.invoice_number || "").slice(yearPrefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return `${yearPrefix}${String(max + 1).padStart(3, "0")}`;
  } catch {
    return `${yearPrefix}001`;
  }
}

export const SYNC_TABLES = {
  categories: {
    table: "categories",
    fields: ["name"],
  },
  units: {
    table: "units",
    fields: ["name", "abbreviation"],
  },
  products: {
    table: "products",
    fields: [
      "sku",
      "name",
      "category_id",
      "unit_id",
      "cost_price",
      "sale_price",
      "min_stock_level",
      "is_active",
    ],
  },
  clients: {
    table: "clients",
    fields: ["name", "phone", "email", "address", "tax_number", "type", "is_active"],
  },
  suppliers: {
    table: "suppliers",
    fields: ["name", "phone", "email", "address", "tax_number", "is_active"],
  },
  stock_levels: {
    table: "stock_levels",
    fields: ["product_id", "quantity"],
  },
  stock_movements: {
    table: "stock_movements",
    fields: ["product_id", "movement_type", "quantity", "unit_cost", "notes", "reference_type", "created_at"],
  },
  manufacturing_orders: {
    table: "manufacturing_orders",
    fields: [
      "order_number",
      "order_date",
      "material_product_id",
      "material_quantity_used",
      "material_unit_cost",
      "material_cost_total",
      "expense_items",
      "expenses_total",
      "total_cost",
      "output_product_id",
      "output_quantity",
      "cost_per_unit",
      "notes",
      "created_at",
    ],
  },
  invoices: {
    table: "invoices",
    fields: [
      "invoice_number",
      "type",
      "client_id",
      "supplier_id",
      "invoice_date",
      "due_date",
      "subtotal",
      "discount_amount",
      "tax_rate",
      "tax_amount",
      "total_amount",
      "paid_amount",
      "status",
      "notes",
      "created_at",
    ],
    hasItems: true,
  },
  payments: {
    table: "payments",
    fields: [
      "invoice_id",
      "amount",
      "payment_date",
      "method",
      "reference_number",
      "notes",
      "party_type",
      "party_id",
    ],
  },
  expenses: {
    table: "expenses",
    fields: ["title", "amount", "expense_date", "category", "notes"],
  },
  employees: {
    table: "employees",
    fields: [
      "name",
      "job_title",
      "department",
      "phone",
      "email",
      "hire_date",
      "salary",
      "is_active",
      "notes",
      "daily_rate",
      "overtime_hourly_rate",
    ],
  },
  salary_payments: {
    table: "salary_payments",
    fields: [
      "employee_id",
      "amount",
      "period_month",
      "payment_date",
      "notes",
      "expense_id",
      "advance_deduction",
      "net_amount",
      "advance_deduction_breakdown",
      "base_salary",
      "deduction_amount",
      "overtime_amount",
      "penalties_amount",
    ],
  },
  attendance: {
    table: "attendance",
    fields: ["employee_id", "date", "status", "notes", "deduction_type", "overtime_hours"],
  },
  advances: {
    table: "advances",
    fields: ["employee_id", "amount", "remaining_amount", "advance_date", "reason", "notes"],
  },
  penalties: {
    table: "penalties",
    fields: ["employee_id", "amount", "penalty_date", "reason", "notes"],
  },
  cash_vouchers: {
    table: "cash_vouchers",
    fields: ["type", "amount", "voucher_date", "party_name", "method", "notes", "created_at"],
  },
};
const SYNC_ORDER = [
  "categories",
  "units",
  "products",
  "clients",
  "suppliers",
  "stock_levels",
  "employees",
  "stock_movements",
  "manufacturing_orders",
  "invoices",
  "payments",
  "expenses",
  "salary_payments",
  "attendance",
  "advances",
  "penalties",
  "cash_vouchers",
];
function pickFields(obj, fields) {
  const out = {};
  fields.forEach((f) => {
    if (obj[f] !== undefined) out[f] = obj[f] === "" && f.endsWith("_id") ? null : obj[f];
  });
  return out;
}
// يجيب كل صفوف الجدول من غير ما يقف عند الحد الافتراضي (1000 صف) اللي بترجعه
// Supabase/PostgREST تلقائيًا لأي سؤال عادي - بيقسم الطلب لدفعات (1000 كل مرة)
// لحد ما يجيب كل البيانات فعليًا
async function fetchAllRows(table, orgId) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const { data: rows, error } = await sb
      .from(table)
      .select("*")
      .eq("org_id", orgId)
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all = all.concat(rows || []);
    if (!rows || rows.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

export async function fetchCloudData(orgId) {
  const result = {};
  const keys = Object.keys(SYNC_TABLES);
  const responses = await Promise.all(keys.map((key) => fetchAllRows(SYNC_TABLES[key].table, orgId)));
  keys.forEach((key, i) => {
    const { data: rows, error } = responses[i];
    if (error) {
      console.error("fetchCloudData error on", SYNC_TABLES[key].table, error);
      result[key] = [];
      return;
    }
    result[key] = rows || [];
  });
  if (result.invoices && result.invoices.length) {
    // ملحوظة: تعمّدنا عدم استخدام .in("invoice_id", invIds) هنا لأنه مع وجود
    // آلاف الفواتير، الرابط بيبقى طويل جدًا ويفشل بصمت (من غير أي رسالة خطأ).
    // بدل كده، بنعتمد على RLS policy بتاعة invoice_items نفسها (اللي أصلاً
    // بتقصر النتيجة على فواتير نفس المنظمة فقط) من غير أي فلتر إضافي هنا،
    // مع pagination عشان منقفش عند حد الـ 1000 صف الافتراضي هنا كمان
    let items = [];
    let itemsFrom = 0;
    const itemsPageSize = 1000;
    while (true) {
      const { data: pageRows, error: itemsError } = await sb
        .from("invoice_items")
        .select("*")
        .range(itemsFrom, itemsFrom + itemsPageSize - 1);
      if (itemsError) {
        console.error("fetchCloudData error on invoice_items", itemsError);
        break;
      }
      items = items.concat(pageRows || []);
      if (!pageRows || pageRows.length < itemsPageSize) break;
      itemsFrom += itemsPageSize;
    }
    const itemsByInvoice = new Map();
    (items || []).forEach((it) => {
      if (!itemsByInvoice.has(it.invoice_id)) itemsByInvoice.set(it.invoice_id, []);
      itemsByInvoice.get(it.invoice_id).push({
        id: it.id,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent,
        total_price: it.total_price,
      });
    });
    result.invoices = result.invoices.map((inv) => ({
      ...inv,
      items: itemsByInvoice.get(inv.id) || [],
    }));
  }
  return result;
}
export async function pushInitialData(orgId, localData) {
  const idMap = {};
  const mapId = (oldId) => {
    if (!oldId) return null;
    if (!idMap[oldId]) idMap[oldId] = generateId();
    return idMap[oldId];
  };
  for (const key of SYNC_ORDER) {
    const cfg = SYNC_TABLES[key];
    const items = localData[key] || [];
    if (!items.length) continue;
    if (key === "invoices") {
      const invRows = items.map((inv) => {
        const row = pickFields(inv, cfg.fields);
        row.id = mapId(inv.id);
        row.org_id = orgId;
        if (row.client_id) row.client_id = mapId(row.client_id);
        if (row.supplier_id) row.supplier_id = mapId(row.supplier_id);
        return row;
      });
      const { error } = await sb.from(cfg.table).insert(invRows);
      if (error) console.error("pushInitialData invoices error", error);
      const itemRows = [];
      items.forEach((inv) =>
        (inv.items || []).forEach((it) => {
          itemRows.push({
            id: generateId(),
            invoice_id: idMap[inv.id],
            product_id: mapId(it.product_id),
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount_percent: it.discount_percent || 0,
            total_price: it.total_price,
          });
        })
      );
      if (itemRows.length) {
        const { error: ie } = await sb.from("invoice_items").insert(itemRows);
        if (ie) console.error("pushInitialData invoice_items error", ie);
      }
      continue;
    }
    const rows = items.map((item) => {
      const row = pickFields(item, cfg.fields);
      row.id = mapId(item.id);
      row.org_id = orgId;
      [
        "product_id",
        "client_id",
        "supplier_id",
        "category_id",
        "unit_id",
        "employee_id",
        "invoice_id",
        "expense_id",
        "material_product_id",
        "output_product_id",
      ].forEach((fk) => {
        if (row[fk]) row[fk] = mapId(row[fk]);
      });
      return row;
    });
    const { error } = await sb.from(cfg.table).insert(rows);
    if (error) console.error("pushInitialData error on", cfg.table, error);
  }
}
function itemLabel(item) {
  return (
    item?.name ||
    item?.title ||
    item?.invoice_number ||
    item?.party_name ||
    item?.full_name ||
    (item?.amount != null ? `دفعة بمبلغ ${item.amount}` : null) ||
    (item?.id ? `#${String(item.id).slice(0, 8)}` : "—")
  );
}
export async function syncTableChange(orgId, key, oldItems, newItems, userId) {
  const cfg = SYNC_TABLES[key];
  if (!cfg) return [];
  const errors = [];
  const oldMap = new Map(oldItems.map((i) => [i.id, i]));
  const newMap = new Map(newItems.map((i) => [i.id, i]));
  const toUpsert = [];
  const logRows = [];
  newMap.forEach((item, id) => {
    const old = oldMap.get(id);
    if (!old || JSON.stringify(old) !== JSON.stringify(item)) {
      const row = pickFields(item, cfg.fields);
      row.id = id;
      row.org_id = orgId;
      toUpsert.push(row);
      logRows.push({
        org_id: orgId,
        user_id: userId || null,
        action: old ? "update" : "create",
        table_name: cfg.table,
        record_id: id,
        details: {
          label: itemLabel(item),
          old: old ? pickFields(old, cfg.fields) : null,
          new: row,
        },
      });
    }
  });
  const toDelete = [];
  oldMap.forEach((item, id) => {
    if (!newMap.has(id)) {
      toDelete.push(id);
      logRows.push({
        org_id: orgId,
        user_id: userId || null,
        action: "delete",
        table_name: cfg.table,
        record_id: id,
        details: {
          label: itemLabel(item),
          old: pickFields(item, cfg.fields),
        },
      });
    }
  });
  const failedIds = new Set();
  if (toUpsert.length) {
    const { error } = await sb.from(cfg.table).upsert(toUpsert);
    if (error) {
      console.error("syncTableChange upsert error on", cfg.table, error, toUpsert);
      errors.push({
        table: cfg.table,
        op: "upsert",
        message: error.message,
      });
      // مهم: لو فشل حفظ الصف الأساسي، لازم نستبعده من أي معالجة تالية (زي بنود
      // الفاتورة) عشان منحاولش نربط بيانات بصف مش موجود فعليًا في قاعدة البيانات
      toUpsert.forEach((r) => failedIds.add(r.id));
    }
  }
  if (toDelete.length) {
    const { error } = await sb.from(cfg.table).delete().in("id", toDelete);
    if (error) {
      console.error("syncTableChange delete error on", cfg.table, error);
      errors.push({
        table: cfg.table,
        op: "delete",
        message: error.message,
      });
    }
  }
  if (logRows.length && errors.length === 0) {
    sb.from("activity_log")
      .insert(logRows)
      .then(({ error }) => {
        if (error) console.error("activity_log insert error", error);
      });
  }
  if (cfg.hasItems) {
    for (const [id, item] of newMap) {
      if (failedIds.has(id)) continue; // الفاتورة نفسها فشلت، منحاولش نسجل بنودها
      const old = oldMap.get(id);
      const oldItemsArr = old?.items || [];
      const newItemsArr = item.items || [];
      if (JSON.stringify(oldItemsArr) === JSON.stringify(newItemsArr)) continue;
      const rows = newItemsArr.map((it) => ({
        id: it.id && it.id.length === 36 ? it.id : generateId(),
        invoice_id: id,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent || 0,
        total_price: it.total_price,
      }));
      const newIds = new Set(rows.map((r) => r.id));
      // نحذف بس البنود القديمة اللي فعلاً اتشالت من الفاتورة (مش موجودة في القائمة
      // الجديدة)، وسايبين الباقي عشان الـ upsert التالي يحدّثه بدل حذفه وإعادة إضافته
      const idsToDelete = oldItemsArr.map((it) => it.id).filter((oid) => oid && !newIds.has(oid));
      if (idsToDelete.length) {
        const { error: delErr } = await sb.from("invoice_items").delete().in("id", idsToDelete);
        if (delErr) console.error("syncTableChange invoice_items delete error", delErr);
      }
      if (rows.length) {
        // upsert بدل insert: لو الـ id موجود بالفعل (تعديل فاتورة) يتحدّث بدل ما يدّي
        // duplicate key error زي ما كان بيحصل مع delete+insert المنفصلين
        const { error } = await sb.from("invoice_items").upsert(rows);
        if (error) {
          console.error("syncTableChange invoice_items error", error);
          errors.push({
            table: "invoice_items",
            op: "upsert",
            message: error.message,
          });
        }
      }
    }
    for (const id of toDelete) {
      await sb.from("invoice_items").delete().eq("invoice_id", id);
    }
  }
  return errors;
}
