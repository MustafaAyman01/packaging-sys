import { useState } from "react";
import { StatementModal } from "../components/StatementModal";
import { generateId, fc, today } from "../utils/format";
import { CLIENT_TYPE_LABELS } from "../constants/labels";

export function Clients({ data, update, toast, org }) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [statementParty, setStatementParty] = useState(null);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeForm, setMergeForm] = useState({
    primary_id: "",
    duplicate_id: "",
  });
  const filtered = data.clients.filter((c) => !search || c.name.includes(search) || c.phone.includes(search));
  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      tax_number: "",
      type: "retail",
      is_active: true,
    });
    setShowModal(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      ...c,
    });
    setShowModal(true);
  };
  const save = () => {
    if (!form.name) return;
    const normalized = form.name.trim().toLowerCase();
    const dup = data.clients.find(
      (c) => c.id !== editing?.id && c.is_active && c.name.trim().toLowerCase() === normalized
    );
    if (dup && !confirm(`⚠️ فيه عميل موجود بنفس الاسم بالظبط ("${dup.name}"). متأكد إنه مش نفس العميل؟`)) {
      return;
    }
    if (editing)
      update(
        "clients",
        data.clients.map((c) =>
          c.id === editing.id
            ? {
                ...form,
                id: editing.id,
              }
            : c
        )
      );
    else
      update("clients", [
        ...data.clients,
        {
          ...form,
          id: generateId(),
          created_at: today(),
        },
      ]);
    setShowModal(false);
    toast(editing ? "تم تعديل العميل ✓" : "تم إضافة العميل ✓");
  };
  const del = (id) => {
    if (confirm("حذف العميل؟")) {
      update(
        "clients",
        data.clients.filter((c) => c.id !== id)
      );
      toast("تم الحذف");
    }
  };
  const getBalance = (id) => {
    const invBalance = data.invoices
      .filter((i) => i.client_id === id && i.type === "sale" && i.status !== "cancelled")
      .reduce((s, i) => s + (i.total_amount - i.paid_amount), 0);
    // دفعات "على الحساب" غير مربوطة بفاتورة معينة (مقدم/فرق مستحق للعميل) بتقلل من رصيده
    const unapplied = data.payments
      .filter((p) => !p.invoice_id && p.party_type === "client" && p.party_id === id)
      .reduce((s, p) => s + p.amount, 0);
    return invBalance - unapplied;
  };
  const mergeClients = () => {
    const { primary_id, duplicate_id } = mergeForm;
    if (!primary_id || !duplicate_id || primary_id === duplicate_id) {
      toast("⚠️ اختار العميل الأساسي والمكرر (لازم يكونوا مختلفين)");
      return;
    }
    const primary = data.clients.find((c) => c.id === primary_id);
    const duplicate = data.clients.find((c) => c.id === duplicate_id);
    if (
      !confirm(
        `هيتم نقل كل فواتير ودفعات "${duplicate.name}" لـ "${primary.name}"، وإيقاف السجل المكرر نهائيًا. الإجراء ده مينفعش يتراجع فيه بسهولة. متأكد؟`
      )
    )
      return;
    update(
      "invoices",
      data.invoices.map((i) => (i.client_id === duplicate_id ? { ...i, client_id: primary_id } : i))
    );
    update(
      "payments",
      data.payments.map((p) =>
        p.party_type === "client" && p.party_id === duplicate_id ? { ...p, party_id: primary_id } : p
      )
    );
    update(
      "clients",
      data.clients.map((c) =>
        c.id === duplicate_id
          ? {
              ...c,
              is_active: false,
              name: `${c.name} (مدموج مع ${primary.name})`,
            }
          : c
      )
    );
    setShowMerge(false);
    setMergeForm({
      primary_id: "",
      duplicate_id: "",
    });
    toast("تم دمج العميلين ✓");
  };
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
            placeholder="بحث بالاسم أو التليفون..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn btn-secondary" onClick={() => setShowMerge(true)}>
          🔗 دمج عملاء مكررين
        </button>
        <button className="btn btn-primary" onClick={openNew}>
          + عميل جديد
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>النوع</th>
              <th>التليفون</th>
              <th>الرقم الضريبي</th>
              <th>رصيد مستحق</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td
                  style={{
                    fontWeight: 500,
                  }}
                >
                  {c.name}
                </td>
                <td>
                  <span className="tag">{CLIENT_TYPE_LABELS[c.type]}</span>
                </td>
                <td
                  style={{
                    direction: "ltr",
                  }}
                >
                  {c.phone}
                </td>
                <td>{c.tax_number || "—"}</td>
                <td
                  style={{
                    fontWeight: 500,
                    color: getBalance(c.id) > 0 ? "var(--red)" : "var(--text)",
                  }}
                >
                  {fc(getBalance(c.id))}
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: c.is_active ? "var(--green-bg)" : "var(--surface3)",
                      color: c.is_active ? "var(--green)" : "var(--text3)",
                    }}
                  >
                    {c.is_active ? "نشط" : "موقوف"}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setStatementParty(c)}>
                      كشف حساب
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>
                      تعديل
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="icon">👥</div>
            <p>لا توجد عملاء</p>
          </div>
        )}
        {statementParty && (
          <StatementModal
            party={statementParty}
            partyType="client"
            data={data}
            org={org}
            onClose={() => setStatementParty(null)}
          />
        )}
      </div>
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? "تعديل عميل" : "عميل جديد"}</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الاسم *</label>
                  <input
                    value={form.name || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>النوع</label>
                  <select
                    value={form.type || "retail"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value,
                      })
                    }
                  >
                    {Object.entries(CLIENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>التليفون</label>
                  <input
                    value={form.phone || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>الإيميل</label>
                  <input
                    value={form.email || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        email: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الرقم الضريبي</label>
                  <input
                    value={form.tax_number || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tax_number: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>الحالة</label>
                  <select
                    value={form.is_active ? "1" : "0"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        is_active: e.target.value === "1",
                      })
                    }
                  >
                    <option value="1">نشط</option>
                    <option value="0">موقوف</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>العنوان</label>
                <textarea
                  value={form.address || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      address: e.target.value,
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
      {showMerge && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">🔗 دمج عملاء مكررين</span>
              <button className="close-btn" onClick={() => setShowMerge(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div
                className="alert alert-warning"
                style={{
                  marginBottom: 16,
                }}
              >
                لو نفس العميل مسجل مرتين بالغلط (حسابين منفصلين)، اختار السجل اللي عايز تحتفظ بيه (الأساسي)
                والسجل المكرر — هيتم نقل كل فواتير ودفعات المكرر للأساسي، وإيقاف السجل المكرر.
              </div>
              <div className="form-group">
                <label>العميل الأساسي (اللي هيفضل شغال)</label>
                <select
                  value={mergeForm.primary_id}
                  onChange={(e) =>
                    setMergeForm({
                      ...mergeForm,
                      primary_id: e.target.value,
                    })
                  }
                >
                  <option value="">اختر</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — رصيده {fc(getBalance(c.id))}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>العميل المكرر (هيتم دمجه ووقفه)</label>
                <select
                  value={mergeForm.duplicate_id}
                  onChange={(e) =>
                    setMergeForm({
                      ...mergeForm,
                      duplicate_id: e.target.value,
                    })
                  }
                >
                  <option value="">اختر</option>
                  {data.clients
                    .filter((c) => c.id !== mergeForm.primary_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — رصيده {fc(getBalance(c.id))}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMerge(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={mergeClients}>
                دمج الحسابين
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
