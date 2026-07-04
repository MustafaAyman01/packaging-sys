import { useState, useEffect } from "react";
import { sb, SUPABASE_URL, SUPABASE_ANON_KEY } from "../services/supabaseClient";
import { ROLE_LABELS } from "../constants/labels";

export function Settings({ profile, toast }) {
  const [tab, setTab] = useState("org");
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // org form
  const [orgName, setOrgName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  // new user form
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("staff");
  const [addingUser, setAddingUser] = useState(false);
  // my profile form
  const [myName, setMyName] = useState(profile?.full_name || "");
  const canManage = profile && (profile.role === "owner" || profile.role === "admin");
  const loadAll = async () => {
    setLoading(true);
    const [orgRes, profsRes] = await Promise.all([
      sb.from("organizations").select("*").eq("id", profile.org_id).single(),
      sb.from("profiles").select("*").eq("org_id", profile.org_id).order("created_at"),
    ]);
    setOrg(orgRes.data);
    setOrgName(orgRes.data?.name || "");
    setLogoUrl(orgRes.data?.logo_url || "");
    setLogoPreview(orgRes.data?.logo_url || "");
    setMembers(profsRes.data || []);
    setLoading(false);
  };
  useEffect(() => {
    if (profile) loadAll();
  }, [profile]);

  // Logo upload -> base64 data URL (stored directly, no Storage bucket needed)
  const handleLogoFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast("الصورة كبيرة جدًا، الحد الأقصى 500 كيلوبايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(reader.result);
      setLogoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const [saving, setSaving] = useState(false);
  const saveOrg = async () => {
    if (!orgName.trim()) {
      toast("اسم الشركة مطلوب");
      return;
    }
    setSaving(true);
    try {
      const { error } = await sb.rpc("update_organization", {
        p_name: orgName.trim(),
        p_logo_url: logoUrl || null,
      });
      if (error) {
        console.error("update_organization error:", error);
        toast("خطأ: " + error.message);
        setSaving(false);
        return;
      }
      toast("تم حفظ بيانات الشركة ✓ — حدّث الصفحة لتظهر في كل النظام");
      await loadAll();
    } catch (e) {
      console.error("saveOrg exception:", e);
      toast("حدث خطأ غير متوقع: " + (e.message || String(e)));
    }
    setSaving(false);
  };
  const createUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      toast("من فضلك اكمل كل الحقول");
      return;
    }
    if (newUserPassword.length < 6) {
      toast("كلمة المرور لازم تكون 6 أحرف على الأقل");
      return;
    }
    setAddingUser(true);
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          full_name: newUserName.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        toast("خطأ: " + (result.error || "فشل إنشاء الحساب"));
        setAddingUser(false);
        return;
      }
      toast(`تم إضافة ${newUserName} بنجاح ✓`);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("staff");
      await loadAll();
    } catch (e) {
      toast("خطأ غير متوقع: " + (e.message || String(e)));
    }
    setAddingUser(false);
  };
  const changeRole = async (memberId, role) => {
    const { error } = await sb.rpc("update_member_role", {
      p_profile_id: memberId,
      p_role: role,
    });
    if (error) {
      toast("خطأ: " + error.message);
      return;
    }
    toast("تم تحديث الدور ✓");
    loadAll();
  };
  const deactivate = async (memberId) => {
    if (!confirm("تعطيل هذا المستخدم؟ لن يستطيع تسجيل الدخول مجددًا.")) return;
    const { error } = await sb.rpc("deactivate_member", {
      p_profile_id: memberId,
    });
    if (error) {
      toast("خطأ: " + error.message);
      return;
    }
    toast("تم تعطيل المستخدم");
    loadAll();
  };
  const saveMyProfile = async () => {
    if (!myName.trim()) {
      toast("الاسم مطلوب");
      return;
    }
    const { error } = await sb
      .from("profiles")
      .update({
        full_name: myName.trim(),
      })
      .eq("id", profile.id);
    if (error) {
      toast("خطأ: " + error.message);
      return;
    }
    toast("تم حفظ بياناتك ✓ — حدّث الصفحة");
  };
  if (loading)
    return (
      <div className="card">
        <div className="card-body">...جاري التحميل</div>
      </div>
    );
  return (
    <div>
      <div className="tabs">
        <div className={`tab${tab === "org" ? " active" : ""}`} onClick={() => setTab("org")}>
          بيانات الشركة
        </div>
        {canManage && (
          <div className={`tab${tab === "team" ? " active" : ""}`} onClick={() => setTab("team")}>
            المستخدمون والصلاحيات
          </div>
        )}
        <div className={`tab${tab === "profile" ? " active" : ""}`} onClick={() => setTab("profile")}>
          حسابي
        </div>
      </div>
      {tab === "org" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">بيانات الشركة / المصنع</span>
          </div>
          <div className="card-body">
            {!canManage && (
              <div
                className="alert"
                style={{
                  background: "var(--amber-bg)",
                  color: "var(--amber)",
                  marginBottom: 14,
                }}
              >
                هذه البيانات للعرض فقط — التعديل متاح للمالك أو المدير.
              </div>
            )}
            <div className="form-row form-row-2">
              <div className="form-group">
                <label>اسم الشركة / المصنع</label>
                <input value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!canManage} />
              </div>
              <div className="form-group">
                <label>الشعار (لوجو)</label>
                {canManage && <input type="file" accept="image/*" onChange={handleLogoFile} />}
                {logoPreview && (
                  <div
                    style={{
                      marginTop: 8,
                    }}
                  >
                    <img
                      src={logoPreview}
                      alt="logo"
                      style={{
                        height: 60,
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {canManage && (
              <div
                style={{
                  textAlign: "left",
                  marginTop: 8,
                }}
              >
                <button className="btn btn-primary" onClick={saveOrg} disabled={saving}>
                  {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
              </div>
            )}
            <div
              className="alert alert-success"
              style={{
                marginTop: 16,
              }}
            >
              بعد الحفظ، اسم الشركة والشعار يظهران تلقائيًا في الشريط الجانبي وفي رأس النظام بعد تحديث الصفحة.
            </div>
          </div>
        </div>
      )}
      {tab === "team" && canManage && (
        <div>
          <div
            className="card"
            style={{
              marginBottom: 20,
            }}
          >
            <div className="card-header">
              <span className="card-title">إضافة مستخدم جديد</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الاسم الكامل *</label>
                  <input
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="اسم الموظف"
                  />
                </div>
                <div className="form-group">
                  <label>البريد الإلكتروني *</label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>كلمة المرور *</label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="على الأقل 6 أحرف"
                  />
                </div>
                <div className="form-group">
                  <label>الدور / الصلاحية</label>
                  <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                    <option value="admin">مدير</option>
                    <option value="accountant">محاسب</option>
                    <option value="sales">مبيعات</option>
                    <option value="warehouse">مخزن</option>
                    <option value="staff">موظف</option>
                  </select>
                </div>
              </div>
              <div
                style={{
                  textAlign: "left",
                  marginTop: 8,
                }}
              >
                <button className="btn btn-primary" onClick={createUser} disabled={addingUser}>
                  {addingUser
                    ? "\u062C\u0627\u0631\u064A \u0627\u0644\u0625\u0646\u0634\u0627\u0621..."
                    : "\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645"}
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">أعضاء الفريق ({members.length})</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>البريد الإلكتروني</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {m.full_name}
                      {m.id === profile.id && " (أنت)"}
                    </td>
                    <td>{m.email}</td>
                    <td>
                      {m.id === profile.id || m.role === "owner" ? (
                        <span className="tag">{ROLE_LABELS[m.role]}</span>
                      ) : (
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m.id, e.target.value)}
                          style={{
                            width: 120,
                          }}
                        >
                          <option value="admin">مدير</option>
                          <option value="accountant">محاسب</option>
                          <option value="sales">مبيعات</option>
                          <option value="warehouse">مخزن</option>
                          <option value="staff">موظف</option>
                        </select>
                      )}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: m.is_active ? "var(--green-bg)" : "var(--surface3)",
                          color: m.is_active ? "var(--green)" : "var(--text3)",
                        }}
                      >
                        {m.is_active ? "نشط" : "معطل"}
                      </span>
                    </td>
                    <td>
                      {m.id !== profile.id && m.role !== "owner" && m.is_active && (
                        <button className="btn btn-danger btn-sm" onClick={() => deactivate(m.id)}>
                          تعطيل
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "profile" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">بياناتي الشخصية</span>
          </div>
          <div className="card-body">
            <div className="form-row form-row-2">
              <div className="form-group">
                <label>الاسم الكامل</label>
                <input value={myName} onChange={(e) => setMyName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>البريد الإلكتروني</label>
                <input value={profile.email} disabled={true} />
              </div>
            </div>
            <div
              className="form-group"
              style={{
                maxWidth: 200,
              }}
            >
              <label>الدور الحالي</label>
              <input value={ROLE_LABELS[profile.role] || profile.role} disabled={true} />
            </div>
            <div
              style={{
                textAlign: "left",
              }}
            >
              <button className="btn btn-primary" onClick={saveMyProfile}>
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
