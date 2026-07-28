import { useState, useEffect, useRef } from "react";
import { StatementModal } from "../components/StatementModal";
import { generateId, fc, today } from "../utils/format";
import { CLIENT_TYPE_LABELS } from "../constants/labels";
import { findDuplicateGroups } from "../utils/duplicates";
import { getPartyBalance } from "../utils/balance";
import { t } from "../i18n";

export function Clients({ data, update, toast, org, lang }) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [statementParty, setStatementParty] = useState(null);
  const autoMergedRef = useRef(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const filtered = data.clients
    .filter((c) => showInactive || c.is_active)
    .filter((c) => !search || c.name.includes(search) || c.phone.includes(search));
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
    if (dup) {
      toast(`⚠️ فيه عميل مسجل بالفعل بنفس الاسم ("${dup.name}") — استخدم السجل الموجود بدل ما تضيف واحد جديد`);
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
    const client = data.clients.find((c) => c.id === id);
    const relatedInvoices = data.invoices.filter((i) => i.client_id === id).length;
    const relatedPayments = data.payments.filter((p) => p.party_type === "client" && p.party_id === id).length;

    if (relatedInvoices > 0 || relatedPayments > 0) {
      toast(
        `⚠️ لا يمكن حذف "${client?.name}" — عنده ${relatedInvoices} فاتورة و${relatedPayments} دفعة مسجّلة. حذفه هيسيب العمليات دي من غير اسم عميل مرتبط بيها، وده هيبوّظ كشف الحساب والتقارير المالية. لو مش محتاج العميل يظهر في القوائم تاني، استخدم زرار "إيقاف" بدل الحذف — بياناته وسجله المالي هيفضلوا محفوظين بالكامل.`
      );
      return;
    }
    if (confirm(`حذف العميل "${client?.name}"؟ العميل ده مفيهوش أي فواتير أو دفعات مسجّلة.`)) {
      update(
        "clients",
        data.clients.filter((c) => c.id !== id)
      );
      toast("تم الحذف");
    }
  };
  const toggleActive = (c) => {
    if (
      !confirm(
        c.is_active
          ? `إيقاف "${c.name}"؟ هيختفي من قوائم الاختيار في الفواتير الجديدة، لكن كل سجله وفواتيره القديمة هتفضل محفوظة زي ما هي.`
          : `تفعيل "${c.name}" تاني؟`
      )
    )
      return;
    update(
      "clients",
      data.clients.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x))
    );
    toast(c.is_active ? "تم إيقاف العميل" : "تم تفعيل العميل");
  };
  const getBalance = (id) => getPartyBalance(data, "client", id);
  // عدد الفواتير المرتبطة بالعميل — بنستخدمه كمعيار لاختيار "الأساسي" تلقائي
  // (اللي عليه فواتير أكتر غالباً هو السجل الأصلي، مش المكرر بالغلط)
  const invoiceCount = (id) => data.invoices.filter((i) => i.client_id === id).length;
  const duplicateGroups = findDuplicateGroups(data.clients).map((ids) =>
    ids.map((id) => data.clients.find((c) => c.id === id)).filter(Boolean)
  );
  // دمج مجموعة تكرار تلقائياً من غير تدخل — بيختار "الأساسي" هو اللي عليه فواتير
  // أكتر (الأقدم في الاستخدام)، وينقل كل حاجة من الباقيين ليه ويوقفهم
  const mergeGroup = (members) => {
    const primary_id = [...members].sort(
      (a, b) => invoiceCount(b.id) - invoiceCount(a.id) || (a.created_at || "").localeCompare(b.created_at || "")
    )[0].id;
    const duplicateIds = members.map((c) => c.id).filter((id) => id !== primary_id);
    if (duplicateIds.length === 0) return;
    const primary = data.clients.find((c) => c.id === primary_id);
    update(
      "invoices",
      data.invoices.map((i) => (duplicateIds.includes(i.client_id) ? { ...i, client_id: primary_id } : i))
    );
    update(
      "payments",
      data.payments.map((p) =>
        p.party_type === "client" && duplicateIds.includes(p.party_id) ? { ...p, party_id: primary_id } : p
      )
    );
    update(
      "clients",
      data.clients.map((c) =>
        duplicateIds.includes(c.id)
          ? {
              ...c,
              is_active: false,
              name: `${c.name} (مدموج مع ${primary.name})`,
            }
          : c
      )
    );
    toast(`⚡ تم اكتشاف ودمج عميل مكرر تلقائيًا في "${primary.name}"`);
  };
  const duplicateGroupsKey = duplicateGroups
    .map((g) =>
      g
        .map((c) => c.id)
        .sort()
        .join("+")
    )
    .join("|");
  useEffect(() => {
    duplicateGroups.forEach((members) => {
      const sig = members
        .map((c) => c.id)
        .sort()
        .join(",");
      if (autoMergedRef.current.has(sig)) return;
      autoMergedRef.current.add(sig);
      mergeGroup(members);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateGroupsKey]);
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
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text2)",
            whiteSpace: "nowrap",
          }}
        >
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          عرض الموقوفة/المدموجة
        </label>
        <button className="btn btn-primary" onClick={openNew}>
          + عميل جديد
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t("common", "name", lang)}</th>
              <th>{t("common", "type", lang)}</th>
              <th>{t("common", "phone", lang)}</th>
              <th>{t("common", "tax_number", lang)}</th>
              <th>{t("common", "balance_due", lang)}</th>
              <th>{t("common", "status", lang)}</th>
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
                      {t("actions", "edit", lang)}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(c)}>
                      {c.is_active ? "إيقاف" : "تفعيل"}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>
                      {t("actions", "delete", lang)}
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
            lang={lang}
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
                {t("actions", "cancel", lang)}
              </button>
              <button className="btn btn-primary" onClick={save}>
                {t("actions", "save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
