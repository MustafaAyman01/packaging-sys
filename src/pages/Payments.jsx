import React, { useState } from "react";
import { generateId, fc, fd, today } from "../utils/format";
import { PAYMENT_METHODS } from "../constants/labels";

export function Payments({ data, update, toast }) {
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState("invoice"); // "invoice" | "account"
  const [editingPayment, setEditingPayment] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [form, setForm] = useState({
    invoice_id: "",
    party_type: "client",
    party_id: "",
    amount: "",
    payment_date: today(),
    method: "cash",
    reference_number: "",
    notes: "",
  });
  const unpaid = data.invoices.filter(
    (i) =>
      i.type === "sale" && i.status !== "paid" && i.status !== "cancelled" && i.total_amount > i.paid_amount
  );
  const unpaidForParty = (partyType, partyId) => {
    const field = partyType === "client" ? "client_id" : "supplier_id";
    const invType = partyType === "client" ? "sale" : "purchase";
    return data.invoices
      .filter(
        (i) =>
          i.type === invType &&
          i[field] === partyId &&
          i.status !== "cancelled" &&
          i.total_amount > i.paid_amount
      )
      .sort((a, b) => (a.invoice_date || "").localeCompare(b.invoice_date || "")); // الأقدم أولًا
  };
  // توزيع دفعة عامة على أقدم فواتير العميل/المورد المستحقة تلقائيًا (FIFO)
  // تقليلًا للتدخل اليدوي — لا حاجة لتحديد كل فاتورة على حدة
  const distributePaymentAcrossInvoices = (partyType, partyId, totalAmount, paymentMeta) => {
    let remaining = totalAmount;
    const targets = unpaidForParty(partyType, partyId);
    const newPayments = [];
    const invoiceUpdates = {};
    for (const inv of targets) {
      if (remaining <= 0) break;
      const due = inv.total_amount - inv.paid_amount;
      const applied = Math.min(due, remaining);
      remaining -= applied;
      newPayments.push({
        ...paymentMeta,
        id: generateId(),
        invoice_id: inv.id,
        amount: applied,
        created_at: today(),
      });
      invoiceUpdates[inv.id] = inv.paid_amount + applied;
    }
    return {
      newPayments,
      invoiceUpdates,
      unappliedAmount: remaining,
    };
  };
  const savePayment = () => {
    if (mode === "invoice") {
      if (!form.invoice_id || !form.amount) {
        toast("لازم تحدد الفاتورة والمبلغ");
        return;
      }
      update("payments", [
        ...data.payments,
        {
          invoice_id: form.invoice_id,
          amount: +form.amount,
          payment_date: form.payment_date,
          method: form.method,
          reference_number: form.reference_number,
          notes: form.notes,
          id: generateId(),
          created_at: today(),
        },
      ]);
      update(
        "invoices",
        data.invoices.map((inv) => {
          if (inv.id !== form.invoice_id) return inv;
          const newPaid = inv.paid_amount + +form.amount;
          return {
            ...inv,
            paid_amount: newPaid,
            status: newPaid >= inv.total_amount ? "paid" : "partial",
          };
        })
      );
      toast("تم تسجيل الدفعة ✓");
    } else {
      // دفعة على حساب عميل/مورد — بدون فاتورة محددة
      if (!form.party_id || !form.amount || +form.amount <= 0) {
        toast("لازم تحدد العميل/المورد والمبلغ");
        return;
      }
      const { newPayments, invoiceUpdates, unappliedAmount } = distributePaymentAcrossInvoices(
        form.party_type,
        form.party_id,
        +form.amount,
        {
          payment_date: form.payment_date,
          method: form.method,
          reference_number: form.reference_number,
          notes: form.notes,
          party_type: form.party_type,
          party_id: form.party_id,
        }
      );
      const allNewPayments = [...newPayments];
      if (unappliedAmount > 0.01) {
        allNewPayments.push({
          id: generateId(),
          invoice_id: null,
          party_type: form.party_type,
          party_id: form.party_id,
          amount: unappliedAmount,
          payment_date: form.payment_date,
          method: form.method,
          reference_number: form.reference_number,
          notes: (form.notes || "") + " (مقدم غير مخصص لفاتورة)",
          created_at: today(),
        });
      }
      if (allNewPayments.length > 0) {
        update("payments", [...data.payments, ...allNewPayments]);
      }
      if (Object.keys(invoiceUpdates).length > 0) {
        update(
          "invoices",
          data.invoices.map((inv) =>
            invoiceUpdates[inv.id] !== undefined
              ? {
                  ...inv,
                  paid_amount: invoiceUpdates[inv.id],
                  status: invoiceUpdates[inv.id] >= inv.total_amount ? "paid" : "partial",
                }
              : inv
          )
        );
      }
      if (unappliedAmount > 0.01) {
        toast(
          `تم توزيع ${fc(+form.amount - unappliedAmount)} على الفواتير المستحقة، وتسجيل ${fc(unappliedAmount)} كمقدم غير مخصص`
        );
      } else {
        toast("تم تسجيل الدفعة وتوزيعها على الفواتير المستحقة تلقائيًا ✓");
      }
    }
    setShowModal(false);
    setForm({
      invoice_id: "",
      party_type: "client",
      party_id: "",
      amount: "",
      payment_date: today(),
      method: "cash",
      reference_number: "",
      notes: "",
    });
  };
  const partyName = (p) => {
    if (p.party_id) {
      const list = p.party_type === "client" ? data.clients : data.suppliers;
      return list.find((x) => x.id === p.party_id)?.name || "—";
    }
    const inv = data.invoices.find((i) => i.id === p.invoice_id);
    if (!inv) return "—";
    const list = inv.type === "sale" ? data.clients : data.suppliers;
    const id = inv.type === "sale" ? inv.client_id : inv.supplier_id;
    return list.find((x) => x.id === id)?.name || "—";
  };
  const openEditPayment = (p) => {
    setEditingPayment(p);
    setEditForm({
      amount: p.amount,
      payment_date: p.payment_date,
      method: p.method,
      reference_number: p.reference_number || "",
      notes: p.notes || "",
    });
  };
  const saveEditPayment = () => {
    const newAmount = +editForm.amount;
    if (!newAmount || newAmount <= 0) {
      toast("لازم تدخل مبلغ صحيح");
      return;
    }
    const p = editingPayment;
    const updatedPayment = {
      ...p,
      amount: newAmount,
      payment_date: editForm.payment_date,
      method: editForm.method,
      reference_number: editForm.reference_number,
      notes: editForm.notes,
    };
    update(
      "payments",
      data.payments.map((pp) => (pp.id === p.id ? updatedPayment : pp))
    );
    // لو الدفعة مربوطة بفاتورة معينة، نعدّل المبلغ المدفوع للفاتورة بالفرق فقط
    if (p.invoice_id) {
      const delta = newAmount - p.amount;
      if (delta !== 0) {
        update(
          "invoices",
          data.invoices.map((inv) => {
            if (inv.id !== p.invoice_id) return inv;
            const newPaid = Math.max(0, inv.paid_amount + delta);
            return {
              ...inv,
              paid_amount: newPaid,
              status:
                newPaid >= inv.total_amount
                  ? "paid"
                  : newPaid > 0.009
                  ? "partial"
                  : inv.status === "cancelled"
                  ? "cancelled"
                  : "confirmed",
            };
          })
        );
      }
    }
    setEditingPayment(null);
    toast("تم تعديل الدفعة ✓");
  };
  const salePayments = data.payments.filter((p) => {
    if (p.party_type === "client") return true;
    if (p.party_type === "supplier") return false;
    const inv = data.invoices.find((i) => i.id === p.invoice_id);
    return !inv || inv.type === "sale";
  });
  const totalCollected = salePayments.reduce((s, p) => s + p.amount, 0);
  return (
    <div>
      {unpaid.length > 0 && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: 16,
          }}
        >
          ⏳ <strong>{unpaid.length} فاتورة</strong> غير مسددة — إجمالي المتبقي:{" "}
          <strong>{fc(unpaid.reduce((s, i) => s + (i.total_amount - i.paid_amount), 0))}</strong>
        </div>
      )}
      <div
        className="stat-grid"
        style={{
          gridTemplateColumns: "repeat(3,1fr)",
          marginBottom: 16,
        }}
      >
        <div className="stat-card">
          <div className="stat-label">إجمالي المحصّل</div>
          <div
            className="stat-value"
            style={{
              fontSize: 17,
              color: "var(--green)",
            }}
          >
            {fc(totalCollected)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">عدد الدفعات</div>
          <div className="stat-value">{salePayments.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">فواتير معلقة</div>
          <div
            className="stat-value"
            style={{
              color: "var(--amber)",
            }}
          >
            {unpaid.length}
          </div>
        </div>
      </div>
      <div
        style={{
          marginBottom: 16,
          textAlign: "left",
        }}
      >
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + تسجيل دفعة
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الطرف</th>
              <th>الفاتورة</th>
              <th>المبلغ</th>
              <th>طريقة الدفع</th>
              <th>رقم المرجع</th>
              <th>ملاحظات</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...data.payments]
              .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
              .map((p) => {
                const inv = data.invoices.find((i) => i.id === p.invoice_id);
                return (
                  <tr key={p.id}>
                    <td>{fd(p.payment_date)}</td>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {partyName(p)}
                    </td>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {inv?.invoice_number || "—"}
                    </td>
                    <td
                      style={{
                        fontWeight: 600,
                        color: "var(--green)",
                      }}
                    >
                      {fc(p.amount)}
                    </td>
                    <td>
                      <span className="tag">{PAYMENT_METHODS[p.method]}</span>
                    </td>
                    <td>{p.reference_number || "—"}</td>
                    <td
                      style={{
                        color: "var(--text2)",
                        fontSize: 13,
                      }}
                    >
                      {p.notes || "—"}
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditPayment(p)}>
                        ✏️ تعديل
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {data.payments.length === 0 && (
          <div className="empty-state">
            <div className="icon">💰</div>
            <p>لا توجد مدفوعات</p>
          </div>
        )}
      </div>
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">تسجيل دفعة جديدة</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div
                className="tabs"
                style={{
                  marginBottom: 18,
                }}
              >
                <div
                  className={`tab${mode === "invoice" ? " active" : ""}`}
                  onClick={() => setMode("invoice")}
                >
                  دفعة لفاتورة محددة
                </div>
                <div
                  className={`tab${mode === "account" ? " active" : ""}`}
                  onClick={() => setMode("account")}
                >
                  دفعة على الحساب (عميل/مورد)
                </div>
              </div>
              {mode === "invoice" ? (
                <div className="form-group">
                  <label>الفاتورة *</label>
                  <select
                    value={form.invoice_id}
                    onChange={(e) => {
                      const inv = data.invoices.find((i) => i.id === e.target.value);
                      setForm({
                        ...form,
                        invoice_id: e.target.value,
                        amount: inv ? (inv.total_amount - inv.paid_amount).toFixed(2) : "",
                      });
                    }}
                  >
                    <option value="">اختر فاتورة</option>
                    {unpaid.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoice_number} — متبقي {fc(i.total_amount - i.paid_amount)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <React.Fragment>
                  <div className="form-row form-row-2">
                    <div className="form-group">
                      <label>النوع</label>
                      <select
                        value={form.party_type}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            party_type: e.target.value,
                            party_id: "",
                          })
                        }
                      >
                        <option value="client">عميل</option>
                        <option value="supplier">مورد</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{form.party_type === "client" ? "العميل *" : "المورد *"}</label>
                      <select
                        value={form.party_id}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            party_id: e.target.value,
                          })
                        }
                      >
                        <option value="">اختر</option>
                        {(form.party_type === "client" ? data.clients : data.suppliers)
                          .filter((p) => p.is_active)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  {form.party_id && (
                    <div
                      className="alert alert-success"
                      style={{
                        marginBottom: 0,
                      }}
                    >
                      سيتم توزيع المبلغ تلقائيًا على أقدم الفواتير المستحقة لهذا الطرف، وأي مبلغ متبقي سيستقر
                      كمقدم لحين وجود فاتورة جديدة.
                    </div>
                  )}
                </React.Fragment>
              )}
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>المبلغ *</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>تاريخ الدفع</label>
                  <input
                    type="date"
                    value={form.payment_date}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        payment_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>طريقة الدفع</label>
                  <select
                    value={form.method}
                    onChange={(e) =>
                      setForm({
                        ...form,
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
                <div className="form-group">
                  <label>رقم المرجع</label>
                  <input
                    value={form.reference_number}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        reference_number: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={savePayment}>
                تسجيل
              </button>
            </div>
          </div>
        </div>
      )}
      {editingPayment && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">تعديل دفعة — {partyName(editingPayment)}</span>
              <button className="close-btn" onClick={() => setEditingPayment(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>المبلغ *</label>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>تاريخ الدفع</label>
                  <input
                    type="date"
                    value={editForm.payment_date}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        payment_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>طريقة الدفع</label>
                  <select
                    value={editForm.method}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
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
                <div className="form-group">
                  <label>رقم المرجع</label>
                  <input
                    value={editForm.reference_number}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        reference_number: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
              {editingPayment.invoice_id && (
                <div className="alert alert-warning">
                  ⚠️ الدفعة دي مربوطة بفاتورة — تعديل المبلغ هيغيّر المبلغ المدفوع وحالة الفاتورة تلقائيًا.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingPayment(null)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={saveEditPayment}>
                حفظ التعديل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
