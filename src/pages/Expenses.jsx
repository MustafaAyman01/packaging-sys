import { useState } from "react";
import { generateId, fc, fd, today } from "../utils/format";

export function Expenses({ data, update, toast }) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const cats = ["رواتب", "إيجار", "مرافق", "صيانة", "نقليات", "مستلزمات", "أخرى"];
  const openNew = () => {
    setEditing(null);
    setForm({
      title: "",
      amount: "",
      expense_date: today(),
      category: "إيجار",
      notes: "",
    });
    setShowModal(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    setForm({
      ...e,
    });
    setShowModal(true);
  };
  const save = () => {
    if (!form.title || !form.amount) return;
    if (editing)
      update(
        "expenses",
        data.expenses.map((e) =>
          e.id === editing.id
            ? {
                ...form,
                id: editing.id,
              }
            : e
        )
      );
    else
      update("expenses", [
        ...data.expenses,
        {
          ...form,
          id: generateId(),
          amount: +form.amount,
          created_at: today(),
        },
      ]);
    setShowModal(false);
    toast(editing ? "تم التعديل ✓" : "تم إضافة المصروف ✓");
  };
  const del = (id) => {
    if (confirm("حذف المصروف؟")) {
      update(
        "expenses",
        data.expenses.filter((e) => e.id !== id)
      );
      toast("تم الحذف");
    }
  };
  const total = data.expenses.reduce((s, e) => s + e.amount, 0);
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
          <div className="stat-label">إجمالي المصروفات</div>
          <div
            className="stat-value"
            style={{
              fontSize: 17,
              color: "var(--red)",
            }}
          >
            {fc(total)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">عدد البنود</div>
          <div className="stat-value">{data.expenses.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">متوسط المصروف</div>
          <div
            className="stat-value"
            style={{
              fontSize: 15,
            }}
          >
            {fc(total / (data.expenses.length || 1))}
          </div>
        </div>
      </div>
      <div
        style={{
          marginBottom: 16,
          textAlign: "left",
        }}
      >
        <button className="btn btn-primary" onClick={openNew}>
          + مصروف جديد
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>البيان</th>
              <th>الفئة</th>
              <th>المبلغ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...data.expenses]
              .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
              .map((e) => (
                <tr key={e.id}>
                  <td>{fd(e.expense_date)}</td>
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {e.title}
                  </td>
                  <td>
                    <span className="tag">{e.category}</span>
                  </td>
                  <td
                    style={{
                      fontWeight: 600,
                      color: "var(--red)",
                    }}
                  >
                    {fc(e.amount)}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(e)}>
                        تعديل
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(e.id)}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {data.expenses.length === 0 && (
          <div className="empty-state">
            <div className="icon">💸</div>
            <p>لا توجد مصروفات</p>
          </div>
        )}
      </div>
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? "تعديل مصروف" : "مصروف جديد"}</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>البيان *</label>
                <input
                  value={form.title || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
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
                    value={form.expense_date || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        expense_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>الفئة</label>
                <select
                  value={form.category || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      category: e.target.value,
                    })
                  }
                >
                  {cats.map((c) => (
                    <option key={c} value={c}>
                      {c}
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
