import { useState } from "react";
import { ProductPicker } from "../components/ProductPicker";
import { StatusBadge } from "../components/StatusBadge";
import { printInvoice } from "../features/print/printInvoice";
import { generateId, fc, fd, today } from "../utils/format";
import { STATUS_LABELS, TYPE_LABELS, PAYMENT_METHODS } from "../constants/labels";
import { fetchNextInvoiceNumber } from "../services/sync";

export function Invoices({ data, update, updateStock, toast, org }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewInv, setViewInv] = useState(null);
  const [form, setForm] = useState({});
  const [items, setItems] = useState([]);
  const [quickPay, setQuickPay] = useState({
    amount: "",
    method: "cash",
    reference_number: "",
    notes: "",
  });
  const filtered = data.invoices
    .filter(
      (i) =>
        (!search ||
          i.invoice_number.includes(search) ||
          (i.client_id && data.clients.find((c) => c.id === i.client_id)?.name.includes(search)) ||
          (i.supplier_id && data.suppliers.find((s) => s.id === i.supplier_id)?.name.includes(search))) &&
        (!typeFilter || i.type === typeFilter) &&
        (!statusFilter || i.status === statusFilter)
    )
    .sort(
      (a, b) =>
        b.invoice_date.localeCompare(a.invoice_date) || (b.created_at || "").localeCompare(a.created_at || "")
    );
  const newInvNum = (type) => {
    const prefix = type === "sale" ? "INV" : "PUR";
    const year = new Date().getFullYear();
    const yearPrefix = `${prefix}-${year}-`;
    const maxNum = data.invoices
      .filter((i) => i.type === type && i.invoice_number && i.invoice_number.startsWith(yearPrefix))
      .reduce((max, i) => {
        const n = parseInt(i.invoice_number.slice(yearPrefix.length), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 0);
    return `${yearPrefix}${String(maxNum + 1).padStart(3, "0")}`;
  };
  const openNew = (type = "sale") => {
    setForm({
      type,
      invoice_number: newInvNum(type),
      invoice_date: today(),
      due_date: today(),
      client_id: "",
      supplier_id: "",
      discount_amount: 0,
      tax_rate: 14,
      status: "confirmed",
      notes: "",
    });
    setItems([
      {
        id: generateId(),
        product_id: "",
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        total_price: 0,
      },
    ]);
    setShowModal(true);
    // تحديث الرقم بالقيمة الحقيقية من قاعدة البيانات (بيغطي أي بيانات مضافة يدوي/SQL
    // مش موجودة في الذاكرة المحلية للمتصفح)
    if (org?.id) {
      fetchNextInvoiceNumber(org.id, type).then((num) => {
        setForm((f) => (f.type === type && !f.id ? { ...f, invoice_number: num } : f));
      });
    }
  };
  const calcTotals = (items, discount, taxRate) => {
    const subtotal = items.reduce((s, i) => s + (i.total_price || 0), 0);
    const disc = +discount || 0;
    const taxable = subtotal - disc;
    const tax = taxable * (+taxRate / 100);
    return {
      subtotal,
      tax_amount: tax,
      total_amount: taxable + tax,
    };
  };
  const updateItem = (id, field, val) =>
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = {
          ...item,
          [field]: val,
        };
        if (field === "product_id") {
          const prod = data.products.find((p) => p.id === val);
          updated.unit_price = prod ? (form.type === "purchase" ? prod.cost_price : prod.sale_price) : 0;
        }
        updated.total_price =
          (updated.quantity || 0) * (updated.unit_price || 0) * (1 - (updated.discount_percent || 0) / 100);
        return updated;
      })
    );
  const saveInvoice = async () => {
    if (saving) return; // منع الضغط المتكرر على "حفظ" أثناء تنفيذ عملية سابقة
    if (!items.some((i) => i.product_id)) return;
    // Guard against duplicate invoice numbers (unique per type per org in the DB)
    const dupNumber = data.invoices.some(
      (i) => i.invoice_number === form.invoice_number && i.type === form.type && i.id !== form.id
    );
    if (dupNumber) {
      toast("⚠️ رقم الفاتورة ده مستخدم قبل كده، تم توليد رقم جديد");
      setForm((f) => ({
        ...f,
        invoice_number: newInvNum(form.type),
      }));
      return;
    }
    // Check stock for sale invoices
    if (form.type === "sale") {
      const shortItems = items
        .filter((i) => i.product_id)
        .filter((item) => {
          const prod = data.products.find((p) => p.id === item.product_id);
          const qty = data.stock_levels.find((s) => s.product_id === item.product_id)?.quantity || 0;
          return qty < item.quantity;
        });
      if (shortItems.length > 0) {
        const names = shortItems
          .map((i) => data.products.find((p) => p.id === i.product_id)?.name)
          .join("، ");
        if (
          !confirm(`⚠️ تحذير: المخزون غير كافٍ للمنتجات التالية:\n${names}\nهل تريد الاستمرار وتسجيل العجز؟`)
        )
          return;
      }
    }
    setSaving(true);
    try {
      const totals = calcTotals(items, form.discount_amount, form.tax_rate);
      const invoiceItems = items
        .filter((i) => i.product_id)
        .map((i) => {
          const prod = data.products.find((p) => p.id === i.product_id);
          return {
            ...i,
            product_name: prod?.name || "",
            product_sku: prod?.sku || "",
          };
        });
      let invoiceNumber = form.invoice_number;
      let errors = [];
      let attempt = 0;
      const previousInvoices = data.invoices;
      // نجيب الرقم الحقيقي من السيرفر مباشرة قبل أول محاولة حفظ، بدل ما نعتمد
      // على الرقم المعروض في الشاشة اللي ممكن يكون لسه قديم/مؤقت
      if (org?.id) {
        invoiceNumber = await fetchNextInvoiceNumber(org.id, form.type);
      }
      while (attempt < 3) {
        const inv = {
          ...form,
          ...totals,
          invoice_number: invoiceNumber,
          id: generateId(),
          paid_amount: form.status === "paid" ? totals.total_amount : 0,
          items: invoiceItems,
          created_at: new Date().toISOString(),
        };
        errors = await update("invoices", [...previousInvoices, inv]);
        if (!errors || !errors.length) {
          invoiceItems.forEach((item) => {
            updateStock(item.product_id, form.type === "sale" ? -item.quantity : item.quantity);
          });
          setShowModal(false);
          toast("تم حفظ الفاتورة ✓");
          return;
        }
        // فشل الحفظ فعليًا — نرجّع القائمة زي ما كانت ومنلمسش المخزون
        // (بننتظر الرجوع يخلص قبل أي محاولة تانية عشان منسبقش بعض)
        await update("invoices", previousInvoices);
        const isDupNumber = /invoice_number|duplicate key/i.test(errors[0].message || "");
        if (isDupNumber && org?.id) {
          // رقم الفاتورة اتعارض مع حاجة موجودة فعليًا في قاعدة البيانات (زي بيانات
          // اتضافت من SQL مباشرة) — نجيب رقم حقيقي من السيرفر ونجرب تاني تلقائي
          invoiceNumber = await fetchNextInvoiceNumber(org.id, form.type);
          attempt++;
          continue;
        }
        break;
      }
      toast(`⚠️ فشل حفظ الفاتورة ولم يتم تعديل المخزون: ${errors[0]?.message || "خطأ غير معروف"}`);
      setForm((f) => ({ ...f, invoice_number: invoiceNumber }));
    } finally {
      setSaving(false);
    }
  };

  // Change invoice status
  const changeStatus = async (inv, newStatus) => {
    if (newStatus === "cancelled" && !confirm("هتلغي الفاتورة؟ ده هيرجع المخزون.")) return;
    const errors = await update(
      "invoices",
      data.invoices.map((i) => {
        if (i.id !== inv.id) return i;
        return {
          ...i,
          status: newStatus,
        };
      })
    );
    if (errors && errors.length) {
      toast(`⚠️ فشل تغيير الحالة، لم يتم تعديل المخزون: ${errors[0].message}`);
      return;
    }
    if (newStatus === "cancelled") {
      (inv.items || []).forEach((item) => {
        updateStock(item.product_id, inv.type === "sale" ? item.quantity : -item.quantity);
      });
    }
    setViewInv((v) =>
      v
        ? {
            ...v,
            status: newStatus,
          }
        : null
    );
    toast("تم تغيير الحالة ✓");
  };

  // Quick payment from invoice view
  const submitQuickPay = (inv) => {
    if (!quickPay.amount || +quickPay.amount <= 0) return;
    const amount = Math.min(+quickPay.amount, inv.total_amount - inv.paid_amount);
    const payment = {
      ...quickPay,
      id: generateId(),
      invoice_id: inv.id,
      amount,
      created_at: today(),
    };
    update("payments", [...data.payments, payment]);
    const newPaid = inv.paid_amount + amount;
    const newStatus = newPaid >= inv.total_amount ? "paid" : "partial";
    update(
      "invoices",
      data.invoices.map((i) =>
        i.id === inv.id
          ? {
              ...i,
              paid_amount: newPaid,
              status: newStatus,
            }
          : i
      )
    );
    setViewInv((v) =>
      v
        ? {
            ...v,
            paid_amount: newPaid,
            status: newStatus,
          }
        : null
    );
    setQuickPay({
      amount: "",
      method: "cash",
      reference_number: "",
      notes: "",
    });
    toast("تم تسجيل الدفعة ✓");
  };
  const totals = calcTotals(items, form.discount_amount, form.tax_rate);
  const viewRemaining = viewInv ? viewInv.total_amount - viewInv.paid_amount : 0;
  const clientTotalDue =
    viewInv && viewInv.type === "sale" && viewInv.client_id
      ? data.invoices
          .filter(
            (i) => i.type === "sale" && i.client_id === viewInv.client_id && i.status !== "cancelled"
          )
          .reduce((s, i) => s + Math.max(0, i.total_amount - i.paid_amount), 0)
      : 0;
  return (
    <div>
      <div
        className="filter-row"
        style={{
          marginBottom: 16,
        }}
      >
        <div
          className="search-bar"
          style={{
            flex: 1,
          }}
        >
          <span className="search-icon">🔍</span>
          <input
            placeholder="بحث برقم الفاتورة أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            width: 140,
          }}
        >
          <option value="">كل الأنواع</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            width: 140,
          }}
        >
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => openNew("sale")}>
          + فاتورة مبيعات
        </button>
        <button className="btn btn-secondary" onClick={() => openNew("purchase")}>
          + فاتورة مشتريات
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>النوع</th>
              <th>العميل/المورد</th>
              <th>التاريخ</th>
              <th>الاستحقاق</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => {
              const party =
                inv.type === "sale"
                  ? data.clients.find((c) => c.id === inv.client_id)?.name
                  : data.suppliers.find((s) => s.id === inv.supplier_id)?.name;
              const overdue = inv.due_date < today() && !["paid", "cancelled"].includes(inv.status);
              const rowRemaining = Math.max(0, inv.total_amount - inv.paid_amount);
              return (
                <tr
                  key={inv.id}
                  style={
                    overdue
                      ? {
                          background: "var(--red-bg)",
                        }
                      : {}
                  }
                >
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {inv.invoice_number}
                    {overdue && (
                      <span
                        style={{
                          color: "var(--red)",
                          fontSize: 11,
                          marginRight: 6,
                        }}
                      >
                        متأخر
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="tag">{TYPE_LABELS[inv.type]}</span>
                  </td>
                  <td>{party || "—"}</td>
                  <td>{fd(inv.invoice_date)}</td>
                  <td
                    style={{
                      color: overdue ? "var(--red)" : "inherit",
                    }}
                  >
                    {fd(inv.due_date)}
                  </td>
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {fc(inv.total_amount)}
                  </td>
                  <td>{fc(inv.paid_amount)}</td>
                  <td
                    style={{
                      fontWeight: rowRemaining > 0.01 ? 600 : 400,
                      color: rowRemaining > 0.01 ? "var(--red)" : "var(--text3)",
                    }}
                  >
                    {rowRemaining > 0.01 ? fc(rowRemaining) : "—"}
                  </td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setViewInv(inv);
                          setQuickPay({
                            amount: (inv.total_amount - inv.paid_amount).toFixed(2),
                            method: "cash",
                            reference_number: "",
                            notes: "",
                          });
                        }}
                      >
                        عرض
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => printInvoice(inv, data, org)}
                      >
                        🖨️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="icon">📄</div>
            <p>لا توجد فواتير</p>
          </div>
        )}
      </div>
      {showModal && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">
                {form.type === "sale" ? "🛒 فاتورة مبيعات جديدة" : "📦 فاتورة مشتريات جديدة"}
              </span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label>رقم الفاتورة</label>
                  <input
                    value={form.invoice_number || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        invoice_number: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>تاريخ الفاتورة</label>
                  <input
                    type="date"
                    value={form.invoice_date || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        invoice_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={form.due_date || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        due_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              {form.type === "sale" ? (
                <div className="form-group">
                  <label>العميل</label>
                  <select
                    value={form.client_id || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        client_id: e.target.value,
                      })
                    }
                  >
                    <option value="">اختر عميل</option>
                    {data.clients
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label>المورد</label>
                  <select
                    value={form.supplier_id || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        supplier_id: e.target.value,
                      })
                    }
                  >
                    <option value="">اختر مورد</option>
                    {data.suppliers
                      .filter((s) => s.is_active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div
                style={{
                  height: 1,
                  background: "var(--border)",
                  margin: "16px 0",
                }}
              />
              <div className="section-title">📋 بنود الفاتورة</div>
              <table
                className="inv-table"
                style={{
                  marginBottom: 10,
                }}
              >
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>خصم%</th>
                    <th>الإجمالي</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td
                        style={{
                          width: "35%",
                        }}
                      >
                        <ProductPicker
                          products={data.products}
                          units={data.units}
                          value={item.product_id}
                          onSelect={(pid) => updateItem(item.id, "product_id", pid)}
                          data={data}
                          update={update}
                          toast={toast}
                        />
                      </td>
                      <td
                        style={{
                          width: "12%",
                        }}
                      >
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, "quantity", +e.target.value)}
                        />
                      </td>
                      <td
                        style={{
                          width: "16%",
                        }}
                      >
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(item.id, "unit_price", +e.target.value)}
                        />
                      </td>
                      <td
                        style={{
                          width: "10%",
                        }}
                      >
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discount_percent}
                          onChange={(e) => updateItem(item.id, "discount_percent", +e.target.value)}
                        />
                      </td>
                      <td
                        style={{
                          width: "15%",
                          fontWeight: 500,
                        }}
                      >
                        {fc(item.total_price)}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="btn btn-secondary btn-sm"
                style={{
                  marginBottom: 16,
                }}
                onClick={() =>
                  setItems([
                    ...items,
                    {
                      id: generateId(),
                      product_id: "",
                      quantity: 1,
                      unit_price: 0,
                      discount_percent: 0,
                      total_price: 0,
                    },
                  ])
                }
              >
                + إضافة بند
              </button>
              <div className="totals-box">
                <div
                  className="form-row form-row-2"
                  style={{
                    marginBottom: 12,
                  }}
                >
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label>خصم إجمالي (ج.م)</label>
                    <input
                      type="number"
                      value={form.discount_amount || 0}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discount_amount: +e.target.value,
                        })
                      }
                    />
                  </div>
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label>نسبة الضريبة %</label>
                    <input
                      type="number"
                      value={form.tax_rate || 0}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          tax_rate: +e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="totals-row">
                  <span>المجموع الفرعي</span>
                  <span>{fc(totals.subtotal)}</span>
                </div>
                <div className="totals-row">
                  <span>الخصم</span>
                  <span
                    style={{
                      color: "var(--green)",
                    }}
                  >
                    - {fc(form.discount_amount || 0)}
                  </span>
                </div>
                <div className="totals-row">
                  <span>الضريبة ({form.tax_rate || 0}%)</span>
                  <span>{fc(totals.tax_amount)}</span>
                </div>
                <div className="totals-row total">
                  <span>الإجمالي النهائي</span>
                  <span
                    style={{
                      color: "var(--accent)",
                      fontSize: 17,
                    }}
                  >
                    {fc(totals.total_amount)}
                  </span>
                </div>
              </div>
              <div
                className="form-row form-row-2"
                style={{
                  marginTop: 14,
                }}
              >
                <div className="form-group">
                  <label>حالة الفاتورة</label>
                  <select
                    value={form.status || "confirmed"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value,
                      })
                    }
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>ملاحظات</label>
                  <textarea
                    value={form.notes || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        notes: e.target.value,
                      })
                    }
                    style={{
                      minHeight: 40,
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={saveInvoice}>
                💾 {saving ? "جاري الحفظ..." : "حفظ الفاتورة"}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewInv && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">فاتورة رقم: {viewInv.invoice_number}</span>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <button className="btn btn-secondary btn-sm" onClick={() => printInvoice(viewInv, data, org)}>
                  🖨️ طباعة
                </button>
                <button className="close-btn" onClick={() => setViewInv(null)}>
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text3)",
                      marginBottom: 3,
                    }}
                  >
                    التاريخ
                  </div>
                  <div
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {fd(viewInv.invoice_date)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text3)",
                      marginBottom: 3,
                    }}
                  >
                    الاستحقاق
                  </div>
                  <div
                    style={{
                      fontWeight: 500,
                      color:
                        viewInv.due_date < today() && !["paid", "cancelled"].includes(viewInv.status)
                          ? "var(--red)"
                          : "inherit",
                    }}
                  >
                    {fd(viewInv.due_date)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text3)",
                      marginBottom: 3,
                    }}
                  >
                    الحالة
                  </div>
                  <StatusBadge status={viewInv.status} />
                </div>
              </div>
              <div
                style={{
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text3)",
                    marginBottom: 3,
                  }}
                >
                  {viewInv.type === "sale" ? "العميل" : "المورد"}
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                  }}
                >
                  {viewInv.type === "sale"
                    ? data.clients.find((c) => c.id === viewInv.client_id)?.name
                    : data.suppliers.find((s) => s.id === viewInv.supplier_id)?.name || "—"}
                </div>
              </div>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>خصم%</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewInv.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.product_name ||
                          data.products.find((p) => p.id === item.product_id)?.name ||
                          "—"}
                      </td>
                      <td>{item.quantity.toLocaleString()}</td>
                      <td>{fc(item.unit_price)}</td>
                      <td>{item.discount_percent}%</td>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {fc(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="totals-box">
                <div className="totals-row">
                  <span>المجموع الفرعي</span>
                  <span>{fc(viewInv.subtotal)}</span>
                </div>
                {viewInv.discount_amount > 0 && (
                  <div className="totals-row">
                    <span>الخصم</span>
                    <span
                      style={{
                        color: "var(--green)",
                      }}
                    >
                      - {fc(viewInv.discount_amount)}
                    </span>
                  </div>
                )}
                <div className="totals-row">
                  <span>الضريبة ({viewInv.tax_rate}%)</span>
                  <span>{fc(viewInv.tax_amount)}</span>
                </div>
                <div className="totals-row total">
                  <span>الإجمالي النهائي</span>
                  <span
                    style={{
                      color: "var(--accent)",
                    }}
                  >
                    {fc(viewInv.total_amount)}
                  </span>
                </div>
                <div
                  className="totals-row"
                  style={{
                    color: "var(--green)",
                  }}
                >
                  <span>✓ المدفوع</span>
                  <span>{fc(viewInv.paid_amount)}</span>
                </div>
                {viewRemaining > 0.01 && (
                  <div
                    className="totals-row"
                    style={{
                      color: "var(--red)",
                      fontWeight: 600,
                    }}
                  >
                    <span>⏳ المتبقي من الفاتورة دي</span>
                    <span>{fc(viewRemaining)}</span>
                  </div>
                )}
                {viewInv.type === "sale" && viewInv.client_id && clientTotalDue > 0.01 && (
                  <div
                    className="totals-row"
                    style={{
                      color: "var(--amber)",
                      fontWeight: 700,
                      borderTop: "1px dashed var(--border2)",
                      marginTop: 4,
                      paddingTop: 8,
                    }}
                  >
                    <span>📌 إجمالي المستحق على العميل (كل الفواتير)</span>
                    <span>{fc(clientTotalDue)}</span>
                  </div>
                )}
              </div>
              {viewInv.notes && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "var(--surface2)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--text2)",
                  }}
                >
                  📝 {viewInv.notes}
                </div>
              )}
              {viewRemaining > 0.01 && viewInv.status !== "cancelled" && (
                <div className="payment-quick">
                  <div className="title">💳 تسجيل دفعة</div>
                  <div className="form-row form-row-3">
                    <div
                      className="form-group"
                      style={{
                        marginBottom: 0,
                      }}
                    >
                      <label>المبلغ (ج.م) *</label>
                      <input
                        type="number"
                        value={quickPay.amount}
                        onChange={(e) =>
                          setQuickPay({
                            ...quickPay,
                            amount: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div
                      className="form-group"
                      style={{
                        marginBottom: 0,
                      }}
                    >
                      <label>طريقة الدفع</label>
                      <select
                        value={quickPay.method}
                        onChange={(e) =>
                          setQuickPay({
                            ...quickPay,
                            method: e.target.value,
                          })
                        }
                      >
                        {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div
                      className="form-group"
                      style={{
                        marginBottom: 0,
                      }}
                    >
                      <label>رقم المرجع</label>
                      <input
                        value={quickPay.reference_number}
                        onChange={(e) =>
                          setQuickPay({
                            ...quickPay,
                            reference_number: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      textAlign: "left",
                    }}
                  >
                    <button className="btn btn-success" onClick={() => submitQuickPay(viewInv)}>
                      ✓ تسجيل الدفعة
                    </button>
                  </div>
                </div>
              )}
              <div
                style={{
                  marginTop: 16,
                }}
              >
                <div className="section-title">تغيير الحالة</div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {viewInv.status !== "confirmed" &&
                    viewInv.status !== "cancelled" &&
                    viewInv.status !== "paid" && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => changeStatus(viewInv, "confirmed")}
                      >
                        تأكيد الفاتورة
                      </button>
                    )}
                  {viewInv.status !== "paid" && viewInv.status !== "cancelled" && (
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => {
                        changeStatus(viewInv, "paid");
                        update(
                          "invoices",
                          data.invoices.map((i) =>
                            i.id === viewInv.id
                              ? {
                                  ...i,
                                  paid_amount: viewInv.total_amount,
                                  status: "paid",
                                }
                              : i
                          )
                        );
                        setViewInv((v) =>
                          v
                            ? {
                                ...v,
                                paid_amount: viewInv.total_amount,
                                status: "paid",
                              }
                            : null
                        );
                      }}
                    >
                      ✓ تحديد كمدفوعة بالكامل
                    </button>
                  )}
                  {!["cancelled"].includes(viewInv.status) && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => changeStatus(viewInv, "cancelled")}
                    >
                      إلغاء الفاتورة
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewInv(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
