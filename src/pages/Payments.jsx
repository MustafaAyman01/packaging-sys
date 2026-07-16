import React, { useState, useEffect, useRef } from "react";
import { generateId, fc, fd, today } from "../utils/format";
import { PAYMENT_METHODS } from "../constants/labels";

export function Payments({ data, update, toast }) {
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState("invoice"); // "invoice" | "account"
  const [editingPayment, setEditingPayment] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const invoicePickerRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (invoicePickerRef.current && !invoicePickerRef.current.contains(e.target)) {
        setInvoicePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
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
  const filteredUnpaid = unpaid.filter((i) => {
    if (!invoiceSearch) return true;
    const q = invoiceSearch.toLowerCase();
    const client = data.clients.find((c) => c.id === i.client_id);
    return i.invoice_number.toLowerCase().includes(q) || (client?.name || "").toLowerCase().includes(q);
  });
  // نفس منطق حساب الرصيد في صفحة العملاء/الموردين: صافي الفواتير مطروح منه أي دفعة
  // زيادة "على الحساب" مش مربوطة بفاتورة معينة
  const partyBalance = (partyType, partyId) => {
    if (!partyId) return 0;
    const invField = partyType === "client" ? "client_id" : "supplier_id";
    const invType = partyType === "client" ? "sale" : "purchase";
    const invBalance = data.invoices
      .filter((i) => i[invField] === partyId && i.type === invType && i.status !== "cancelled")
      .reduce((s, i) => s + (i.total_amount - i.paid_amount), 0);
    const unapplied = data.payments
      .filter((p) => !p.invoice_id && p.party_type === partyType && p.party_id === partyId)
      .reduce((s, p) => s + p.amount, 0);
    return invBalance - unapplied;
  };
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
    setInvoiceSearch("");
    setInvoicePickerOpen(false);
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
                  <div
                    ref={invoicePickerRef}
                    style={{
                      position: "relative",
                    }}
                  >
                    <input
                      value={
                        invoicePickerOpen
                          ? invoiceSearch
                          : form.invoice_id
                          ? data.invoices.find((i) => i.id === form.invoice_id)?.invoice_number || ""
                          : ""
                      }
                      onFocus={() => {
                        setInvoicePickerOpen(true);
                        setInvoiceSearch("");
                      }}
                      onChange={(e) => {
                        setInvoiceSearch(e.target.value);
                        setInvoicePickerOpen(true);
                      }}
                      placeholder="اكتب أي رقم أو جزء من رقم الفاتورة أو اسم العميل..."
                      autoComplete="off"
                    />
                    {invoicePickerOpen && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          right: 0,
                          left: 0,
                          background: "var(--surface)",
                          border: "1.5px solid var(--border2)",
                          borderRadius: "var(--radius-sm)",
                          boxShadow: "var(--shadow-md)",
                          maxHeight: 260,
                          overflowY: "auto",
                          zIndex: 300,
                        }}
                      >
                        {filteredUnpaid.length === 0 && (
                          <div
                            style={{
                              padding: "12px 14px",
                              fontSize: 13,
                              color: "var(--text3)",
                            }}
                          >
                            لا توجد فواتير مطابقة
                          </div>
                        )}
                        {filteredUnpaid.map((i) => {
                          const client = data.clients.find((c) => c.id === i.client_id);
                          return (
                            <div
                              key={i.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setForm({
                                  ...form,
                                  invoice_id: i.id,
                                  amount: (i.total_amount - i.paid_amount).toFixed(2),
                                });
                                setInvoicePickerOpen(false);
                                setInvoiceSearch("");
                              }}
                              style={{
                                padding: "9px 14px",
                                cursor: "pointer",
                                fontSize: 13.5,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              <span>
                                <span
                                  style={{
                                    fontWeight: 500,
                                  }}
                                >
                                  {i.invoice_number}
                                </span>
                                {client && (
                                  <span
                                    style={{
                                      color: "var(--text3)",
                                      fontSize: 11.5,
                                      marginRight: 8,
                                    }}
                                  >
                                    {client.name}
                                  </span>
                                )}
                              </span>
                              <span
                                style={{
                                  fontSize: 11.5,
                                  color: "var(--amber)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                متبقي {fc(i.total_amount - i.paid_amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
                  {form.party_id &&
                    (() => {
                      const balance = partyBalance(form.party_type, form.party_id);
                      const isClient = form.party_type === "client";
                      // بنفس منطق كشف الحساب: موجب = مستحق منه/عليه، سالب = هو اللي له رصيد عندنا
                      const owesUs = balance > 0.01;
                      const weOwe = balance < -0.01;
                      return (
                        <div
                          className="alert alert-success"
                          style={{
                            marginBottom: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            {owesUs ? (
                              <React.Fragment>
                                <strong>{fc(balance)}</strong> {isClient ? "مستحق منه" : "مستحق له"}
                              </React.Fragment>
                            ) : weOwe ? (
                              <React.Fragment>
                                <strong>{fc(-balance)}</strong> {isClient ? "له رصيد عندنا" : "لنا رصيد عنده"}
                              </React.Fragment>
                            ) : (
                              "الحساب متصفّر بالفعل"
                            )}
                          </span>
                          {owesUs && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  amount: balance.toFixed(2),
                                })
                              }
                            >
                              💰 صفّر الحساب ({fc(balance)})
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  {form.party_id && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text3)",
                      }}
                    >
                      سيتم توزيع المبلغ تلقائيًا على أقدم الفواتير المستحقة، وأي مبلغ زيادة يُسجَّل كرصيد له.
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
