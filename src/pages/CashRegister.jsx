import { useState, useEffect } from "react";
import { sb } from "../services/supabaseClient";
import { fc, fd } from "../utils/format";

export function CashRegister({ toast }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null); // الجلسة المفتوحة حاليًا (لو موجودة)
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [actualBalance, setActualBalance] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const loadState = async () => {
    setLoading(true);
    try {
      const { data: openSessions, error } = await sb
        .from("cash_sessions")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1);
      if (error) throw error;

      const current = openSessions?.[0] || null;
      setSession(current);

      if (current) {
        const { data: summaryData, error: summaryErr } = await sb.rpc("get_cash_session_summary", {
          p_session_id: current.id,
        });
        if (summaryErr) throw summaryErr;
        setSummary(summaryData);
      } else {
        setSummary(null);
      }

      const { data: historyData } = await sb
        .from("cash_sessions")
        .select("*")
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(15);
      setHistory(historyData || []);
    } catch (e) {
      toast(`⚠️ خطأ في تحميل بيانات الخزنة: ${e.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadState();
  }, []);

  const openOpenModal = () => {
    setOpeningBalance(
      history[0]?.actual_closing_balance != null ? String(history[0].actual_closing_balance) : ""
    );
    setOpenNotes("");
    setShowOpen(true);
  };

  const submitOpen = async () => {
    if (openingBalance === "" || isNaN(+openingBalance)) {
      toast("⚠️ أدخل رصيد افتتاحي صحيح");
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.rpc("open_cash_session", {
        p_opening_balance: +openingBalance,
        p_notes: openNotes || null,
      });
      if (error) throw error;
      setShowOpen(false);
      toast("تم فتح يوم جديد ✓");
      await loadState();
    } catch (e) {
      toast(`⚠️ ${e.message}`);
    }
    setBusy(false);
  };

  const openCloseModal = () => {
    setActualBalance("");
    setCloseNotes("");
    setShowClose(true);
  };

  const submitClose = async () => {
    if (actualBalance === "" || isNaN(+actualBalance)) {
      toast("⚠️ أدخل الرصيد الفعلي اللي عددته");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("close_cash_session", {
        p_session_id: session.id,
        p_actual_closing_balance: +actualBalance,
        p_notes: closeNotes || null,
      });
      if (error) throw error;
      setShowClose(false);
      const diff = data?.session?.difference ?? 0;
      if (Math.abs(diff) < 0.01) {
        toast("تم قفل اليوم ✓ الرصيد مطابق تمامًا");
      } else if (diff > 0) {
        toast(`تم قفل اليوم — فيه زيادة ${fc(diff)} عن المتوقع`);
      } else {
        toast(`تم قفل اليوم — فيه عجز ${fc(Math.abs(diff))} عن المتوقع`);
      }
      await loadState();
    } catch (e) {
      toast(`⚠️ ${e.message}`);
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--text3)",
        }}
      >
        جاري التحميل...
      </div>
    );
  }

  return (
    <div>
      {!session ? (
        <div className="card">
          <div className="card-body">
            <div
              className="empty-state"
              style={{
                padding: 30,
              }}
            >
              <div className="icon">🗄️</div>
              <p>مفيش يوم مفتوح دلوقتي</p>
              <button
                className="btn btn-primary"
                style={{
                  marginTop: 10,
                }}
                onClick={openOpenModal}
              >
                + فتح يوم جديد
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            marginBottom: 20,
          }}
        >
          <div className="card-header">
            <span className="card-title">🗄️ الخزنة — يوم مفتوح</span>
            <button className="btn btn-primary btn-sm" onClick={openCloseModal}>
              قفل اليوم
            </button>
          </div>
          <div className="card-body">
            <div
              style={{
                fontSize: 13,
                color: "var(--text3)",
                marginBottom: 14,
              }}
            >
              اتفتح بتاريخ {fd(session.opened_at)}
              {session.notes ? ` — ${session.notes}` : ""}
            </div>
            {summary && (
              <div className="totals-box">
                <div className="totals-row">
                  <span>الرصيد الافتتاحي</span>
                  <span>{fc(summary.opening_balance)}</span>
                </div>
                <div className="totals-row">
                  <span>وارد نقدي (فواتير)</span>
                  <span
                    style={{
                      color: "var(--green)",
                    }}
                  >
                    + {fc(summary.cash_in_payments)}
                  </span>
                </div>
                <div className="totals-row">
                  <span>صادر نقدي (فواتير)</span>
                  <span
                    style={{
                      color: "var(--red)",
                    }}
                  >
                    − {fc(summary.cash_out_payments)}
                  </span>
                </div>
                <div className="totals-row">
                  <span>سندات قبض</span>
                  <span
                    style={{
                      color: "var(--green)",
                    }}
                  >
                    + {fc(summary.cash_in_vouchers)}
                  </span>
                </div>
                <div className="totals-row">
                  <span>سندات صرف</span>
                  <span
                    style={{
                      color: "var(--red)",
                    }}
                  >
                    − {fc(summary.cash_out_vouchers)}
                  </span>
                </div>
                <div className="totals-row">
                  <span>مصروفات نقدية</span>
                  <span
                    style={{
                      color: "var(--red)",
                    }}
                  >
                    − {fc(summary.cash_expenses)}
                  </span>
                </div>
                <div className="totals-row">
                  <span>رواتب نقدية</span>
                  <span
                    style={{
                      color: "var(--red)",
                    }}
                  >
                    − {fc(summary.cash_salaries)}
                  </span>
                </div>
                <div className="totals-row total">
                  <span>الرصيد المتوقع دلوقتي</span>
                  <span
                    style={{
                      color: "var(--accent)",
                      fontSize: 17,
                    }}
                  >
                    {fc(summary.expected_balance)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">سجل الأيام السابقة</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>تاريخ الفتح</th>
              <th>تاريخ القفل</th>
              <th>افتتاحي</th>
              <th>متوقع</th>
              <th>فعلي</th>
              <th>الفرق</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{fd(h.opened_at)}</td>
                <td>{fd(h.closed_at)}</td>
                <td>{fc(h.opening_balance)}</td>
                <td>{fc(h.expected_closing_balance)}</td>
                <td>{fc(h.actual_closing_balance)}</td>
                <td>
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        Math.abs(h.difference || 0) < 0.01
                          ? "var(--text3)"
                          : h.difference > 0
                            ? "var(--green)"
                            : "var(--red)",
                    }}
                  >
                    {Math.abs(h.difference || 0) < 0.01 ? "مطابق" : fc(h.difference)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && (
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>لا توجد أيام مقفولة بعد</p>
          </div>
        )}
      </div>

      {showOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">فتح يوم جديد</span>
              <button className="close-btn" onClick={() => setShowOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>الرصيد الافتتاحي (ج.م) *</label>
                <input
                  type="number"
                  autoFocus
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
                {history[0] && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text3)",
                      marginTop: 4,
                    }}
                  >
                    آخر رصيد إقفال كان {fc(history[0].actual_closing_balance)} — تم ملؤه تلقائيًا
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowOpen(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={submitOpen}>
                {busy ? "جاري الفتح..." : "فتح اليوم"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClose && session && summary && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">قفل اليوم</span>
              <button className="close-btn" onClick={() => setShowClose(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text3)",
                  marginBottom: 12,
                }}
              >
                الرصيد المتوقع حسب حركة اليوم: <strong>{fc(summary.expected_balance)}</strong>
              </div>
              <div className="form-group">
                <label>الرصيد الفعلي اللي عددته في الدرج (ج.م) *</label>
                <input
                  type="number"
                  autoFocus
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                />
              </div>
              {actualBalance !== "" && !isNaN(+actualBalance) && (
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color:
                      Math.abs(+actualBalance - summary.expected_balance) < 0.01
                        ? "var(--text3)"
                        : +actualBalance > summary.expected_balance
                          ? "var(--green)"
                          : "var(--red)",
                    marginBottom: 12,
                  }}
                >
                  {Math.abs(+actualBalance - summary.expected_balance) < 0.01
                    ? "✓ مطابق تمامًا"
                    : +actualBalance > summary.expected_balance
                      ? `زيادة ${fc(+actualBalance - summary.expected_balance)}`
                      : `عجز ${fc(summary.expected_balance - +actualBalance)}`}
                </div>
              )}
              <div className="form-group">
                <label>ملاحظات (سبب الفرق لو موجود)</label>
                <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClose(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={submitClose}>
                {busy ? "جاري القفل..." : "تأكيد قفل اليوم"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
