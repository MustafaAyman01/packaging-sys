import { useState } from "react";
import { StatementModal } from "../components/StatementModal";
import { generateId, fc, today } from "../utils/format";

export function Suppliers({ data, update, toast, org }) {
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
  const filtered = data.suppliers.filter((s) => !search || s.name.includes(search));
  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      tax_number: "",
      is_active: true,
    });
    setShowModal(true);
  };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      ...s,
    });
    setShowModal(true);
  };
  const save = () => {
    if (!form.name) return;
    const normalized = form.name.trim().toLowerCase();
    const dup = data.suppliers.find(
      (s) => s.id !== editing?.id && s.is_active && s.name.trim().toLowerCase() === normalized
    );
    if (dup && !confirm(`⚠️ فيه مورد موجود بنفس الاسم بالظبط ("${dup.name}"). متأكد إنه مش نفس المورد؟`)) {
      return;
    }
    if (editing)
      update(
        "suppliers",
        data.suppliers.map((s) =>
          s.id === editing.id
            ? {
                ...form,
                id: editing.id,
              }
            : s
        )
      );
    else
      update("suppliers", [
        ...data.suppliers,
        {
          ...form,
          id: generateId(),
          created_at: today(),
        },
      ]);
    setShowModal(false);
    toast(editing ? "تم تعديل المورد ✓" : "تم إضافة المورد ✓");
  };
  const del = (id) => {
    if (confirm("حذف المورد؟")) {
      update(
        "suppliers",
        data.suppliers.filter((s) => s.id !== id)
      );
      toast("تم الحذف");
    }
  };
  const getBalance = (id) => {
    const invBalance = data.invoices
      .filter((i) => i.supplier_id === id && i.type === "purchase" && i.status !== "cancelled")
      .reduce((s, i) => s + (i.total_amount - i.paid_amount), 0);
    // دفعات "على الحساب" غير مربوطة بفاتورة معينة (مقدم/فرق مستحق للمورد) بتقلل من رصيده
    const unapplied = data.payments
      .filter((p) => !p.invoice_id && p.party_type === "supplier" && p.party_id === id)
      .reduce((s, p) => s + p.amount, 0);
    return invBalance - unapplied;
  };
  const mergeSuppliers = () => {
    const { primary_id, duplicate_id } = mergeForm;
    if (!primary_id || !duplicate_id || primary_id === duplicate_id) {
      toast("⚠️ اختار المورد الأساسي والمكرر (لازم يكونوا مختلفين)");
      return;
    }
    const primary = data.suppliers.find((s) => s.id === primary_id);
    const duplicate = data.suppliers.find((s) => s.id === duplicate_id);
    if (
      !confirm(
        `هيتم نقل كل فواتير ودفعات "${duplicate.name}" لـ "${primary.name}"، وإيقاف السجل المكرر نهائيًا. الإجراء ده مينفعش يتراجع فيه بسهولة. متأكد؟`
      )
    )
      return;
    update(
      "invoices",
      data.invoices.map((i) => (i.supplier_id === duplicate_id ? { ...i, supplier_id: primary_id } : i))
    );
    update(
      "payments",
      data.payments.map((p) =>
        p.party_type === "supplier" && p.party_id === duplicate_id ? { ...p, party_id: primary_id } : p
      )
    );
    update(
      "suppliers",
      data.suppliers.map((s) =>
        s.id === duplicate_id
          ? {
              ...s,
              is_active: false,
              name: `${s.name} (مدموج مع ${primary.name})`,
            }
          : s
      )
    );
    setShowMerge(false);
    setMergeForm({
      primary_id: "",
      duplicate_id: "",
    });
    toast("تم دمج الموردين ✓");
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
            placeholder="بحث بالاسم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn btn-secondary" onClick={() => setShowMerge(true)}>
          🔗 دمج موردين مكررين
        </button>
        <button className="btn btn-primary" onClick={openNew}>
          + مورد جديد
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>التليفون</th>
              <th>الرقم الضريبي</th>
              <th>مستحقات عليك</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td
                  style={{
                    fontWeight: 500,
                  }}
                >
                  {s.name}
                </td>
                <td
                  style={{
                    direction: "ltr",
                  }}
                >
                  {s.phone}
                </td>
                <td>{s.tax_number || "—"}</td>
                <td
                  style={{
                    fontWeight: 500,
                    color: getBalance(s.id) > 0 ? "var(--amber)" : "var(--text)",
                  }}
                >
                  {fc(getBalance(s.id))}
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: s.is_active ? "var(--green-bg)" : "var(--surface3)",
                      color: s.is_active ? "var(--green)" : "var(--text3)",
                    }}
                  >
                    {s.is_active ? "نشط" : "موقوف"}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setStatementParty(s)}>
                      كشف حساب
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>
                      تعديل
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}>
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
            <div className="icon">🏭</div>
            <p>لا توجد موردون</p>
          </div>
        )}
        {statementParty && (
          <StatementModal
            party={statementParty}
            partyType="supplier"
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
              <span className="modal-title">{editing ? "تعديل مورد" : "مورد جديد"}</span>
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
              </div>
              <div className="form-row form-row-2">
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
              <span className="modal-title">🔗 دمج موردين مكررين</span>
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
                لو نفس المورد مسجل مرتين بالغلط (حسابين منفصلين)، اختار السجل اللي عايز تحتفظ بيه (الأساسي)
                والسجل المكرر — هيتم نقل كل فواتير ودفعات المكرر للأساسي، وإيقاف السجل المكرر.
              </div>
              <div className="form-group">
                <label>المورد الأساسي (اللي هيفضل شغال)</label>
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
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — رصيده {fc(getBalance(s.id))}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>المورد المكرر (هيتم دمجه ووقفه)</label>
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
                  {data.suppliers
                    .filter((s) => s.id !== mergeForm.primary_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — رصيده {fc(getBalance(s.id))}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMerge(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={mergeSuppliers}>
                دمج الحسابين
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
