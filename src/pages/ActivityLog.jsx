import { useState, useEffect } from "react";
import { sb } from "../services/supabaseClient";
import { ACTIVITY_TABLE_LABELS, ACTIVITY_ACTION_LABELS } from "../constants/labels";

export function ActivityLog({ profile, toast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const load = async () => {
    setLoading(true);
    let query = sb
      .from("activity_log")
      .select("*, profiles(full_name)")
      .eq("org_id", profile.org_id)
      .order("created_at", {
        ascending: false,
      })
      .limit(200);
    if (filterTable) query = query.eq("table_name", filterTable);
    if (filterAction) query = query.eq("action", filterAction);
    const { data, error } = await query;
    if (error) {
      toast("خطأ في تحميل السجل: " + error.message);
      setLoading(false);
      return;
    }
    setLogs(data || []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [filterTable, filterAction]);
  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: 16,
        }}
      >
        <div
          className="card-body"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div
            className="form-group"
            style={{
              minWidth: 160,
              marginBottom: 0,
            }}
          >
            <label>نوع البيانات</label>
            <select value={filterTable} onChange={(e) => setFilterTable(e.target.value)}>
              <option value="">الكل</option>
              {Object.entries(ACTIVITY_TABLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div
            className="form-group"
            style={{
              minWidth: 140,
              marginBottom: 0,
            }}
          >
            <label>نوع العملية</label>
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
              <option value="">الكل</option>
              <option value="create">إضافة</option>
              <option value="update">تعديل</option>
              <option value="delete">حذف</option>
            </select>
          </div>
          <button className="btn btn-secondary" onClick={load}>
            تحديث
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">سجل الأنشطة (آخر 200 عملية)</span>
        </div>
        {loading ? (
          <div className="card-body">...جاري التحميل</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>المستخدم</th>
                <th>العملية</th>
                <th>القسم</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const actionColors = {
                  create: {
                    bg: "var(--green-bg)",
                    color: "var(--green)",
                  },
                  update: {
                    bg: "var(--blue-bg)",
                    color: "var(--blue)",
                  },
                  delete: {
                    bg: "var(--red-bg)",
                    color: "var(--red)",
                  },
                };
                const c = actionColors[log.action] || {
                  bg: "var(--surface3)",
                  color: "var(--text2)",
                };
                return (
                  <tr key={log.id}>
                    <td
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: 12.5,
                        color: "var(--text2)",
                      }}
                    >
                      {new Date(log.created_at).toLocaleString("ar-EG", {
                        numberingSystem: "latn",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {log.profiles?.full_name || "—"}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: c.bg,
                          color: c.color,
                        }}
                      >
                        {ACTIVITY_ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td>
                      <span className="tag">{ACTIVITY_TABLE_LABELS[log.table_name] || log.table_name}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && logs.length === 0 && (
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>لا توجد أنشطة مسجلة</p>
          </div>
        )}
      </div>
    </div>
  );
}
