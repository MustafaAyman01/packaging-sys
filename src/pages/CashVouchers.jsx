import { useState } from "react";
import { generateId, fc, fd, today } from "../utils/format";
import { VOUCHER_TYPE_LABELS, PAYMENT_METHODS } from "../constants/labels";

export function CashVouchers({ data, update, toast }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({});
  const openNew = (type) => {
    setForm({
      type,
      amount: "",
      voucher_date: today(),
      party_name: "",
      method: "cash",
      notes: "",
    });
    setShowModal(true);
  };
  const save = () => {
    if (!form.amount || !form.party_name) return;
    update("cash_vouchers", [
      ...data.cash_vouchers,
      {
        ...form,
        id: generateId(),
        amount: +form.amount,
        created_at: today(),
      },
    ]);
    setShowModal(false);
    toast(form.type === "receipt" ? "تم تسجيل سند القبض ✓" : "تم تسجيل سند الصرف ✓");
  };
  const del = (id) => {
    if (confirm("حذف السند؟")) {
      update(
        "cash_vouchers",
        data.cash_vouchers.filter((v) => v.id !== id)
      );
      toast("تم الحذف");
    }
  };
  const totalReceipts = data.cash_vouchers
    .filter((v) => v.type === "receipt")
    .reduce((s, v) => s + v.amount, 0);
  const totalPayments = data.cash_vouchers
    .filter((v) => v.type === "payment")
    .reduce((s, v) => s + v.amount, 0);
  const sorted = [...data.cash_vouchers].sort((a, b) => b.voucher_date.localeCompare(a.voucher_date));
  return (
    <div>
      <div
        className="stat-grid"
        style={{
          gridTemplateColumns: "repeat(3,1fr)",
          marginBottom: 16,
        }}
      >
        <div className="stat-card">
          <div className="stat-label">إجمالي سندات القبض</div>
          <div
            className="stat-value"
            style={{
              fontSize: 17,
              color: "var(--green)",
            }}
          >
            {fc(totalReceipts)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">إجمالي سندات الصرف</div>
          <div
            className="stat-value"
            style={{
              fontSize: 17,
              color: "var(--red)",
            }}
          >
            {fc(totalPayments)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">الصافي</div>
          <div
            className="stat-value"
            style={{
              fontSize: 17,
              color: totalReceipts - totalPayments >= 0 ? "var(--green)" : "var(--red)",
            }}
          >
            {fc(totalReceipts - totalPayments)}
          </div>
        </div>
      </div>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 10,
          justifyContent: "flex-start",
        }}
      >
        <button className="btn btn-success" onClick={() => openNew("receipt")}>
          + سند قبض
        </button>
        <button className="btn btn-danger" onClick={() => openNew("payment")}>
          + سند صرف
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>البيان / الجهة</th>
              <th>طريقة الدفع</th>
              <th>المبلغ</th>
              <th>ملاحظات</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => (
              <tr key={v.id}>
                <td>{fd(v.voucher_date)}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: v.type === "receipt" ? "var(--green-bg)" : "var(--red-bg)",
                      color: v.type === "receipt" ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {VOUCHER_TYPE_LABELS[v.type]}
                  </span>
                </td>
                <td
                  style={{
                    fontWeight: 500,
                  }}
                >
                  {v.party_name}
                </td>
                <td>
                  <span className="tag">{PAYMENT_METHODS[v.method]}</span>
                </td>
                <td
                  style={{
                    fontWeight: 600,
                    color: v.type === "receipt" ? "var(--green)" : "var(--red)",
                  }}
                >
                  {v.type === "receipt" ? "+ " : "- "}
                  {fc(v.amount)}
                </td>
                <td
                  style={{
                    color: "var(--text2)",
                    fontSize: 13,
                  }}
                >
                  {v.notes || "—"}
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => del(v.id)}>
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.cash_vouchers.length === 0 && (
          <div className="empty-state">
            <div className="icon">🧾</div>
            <p>لا توجد سندات نقدية</p>
          </div>
        )}
      </div>
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{form.type === "receipt" ? "سند قبض جديد" : "سند صرف جديد"}</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{form.type === "receipt" ? "البيان / المصدر *" : "البيان / الجهة *"}</label>
                <input
                  value={form.party_name || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      party_name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>المبلغ *</label>
                  <input
                    type="number"
                    value={form.amount || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>التاريخ</label>
                  <input
                    type="date"
                    value={form.voucher_date || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        voucher_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>طريقة الدفع</label>
                <select
                  value={form.method || "cash"}
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
                <label>ملاحظات</label>
                <textarea
                  value={form.notes || ""}
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
              <button className="btn btn-primary" onClick={save}>
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
