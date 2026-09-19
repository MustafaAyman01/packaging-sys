import { useState, useEffect } from "react";
import { sb } from "../services/supabaseClient";
import { fc, fd } from "../utils/format";

// Batch 2 — POS Foundation: هيكل الشاشة + بوابة الخزنة بس.
// البيع الفعلي (Barcode/Cart/Complete Sale) جايين في الـ Batches اللي بعد كده.
export function POS({ org, profile, toast }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showOpen, setShowOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastClosedBalance, setLastClosedBalance] = useState(null);

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
      setSession(openSessions?.[0] || null);

      if (!openSessions?.[0]) {
        const { data: lastClosed } = await sb
          .from("cash_sessions")
          .select("actual_closing_balance")
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(1);
        setLastClosedBalance(lastClosed?.[0]?.actual_closing_balance ?? null);
      }
    } catch (e) {
      toast(`⚠️ خطأ في تحميل حالة الخزنة: ${e.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadState();
  }, []);

  const openOpenModal = () => {
    setOpeningBalance(lastClosedBalance != null ? String(lastClosedBalance) : "");
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
      toast("تم فتح الخزنة ✓ يقدر تبدأ البيع دلوقتي");
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
          padding: 60,
          textAlign: "center",
          color: "var(--text3)",
        }}
      >
        جاري التحميل...
      </div>
    );
  }

  // ========== بوابة الخزنة: مفيش جلسة مفتوحة ==========
  if (!session) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: 420,
            width: "100%",
          }}
        >
          <div className="card-body">
            <div
              className="empty-state"
              style={{
                padding: 20,
              }}
            >
              <div className="icon">🗄️</div>
              <p style={{ fontWeight: 600, fontSize: 16 }}>لازم تفتح الخزنة الأول</p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text3)",
                  marginTop: 4,
                }}
              >
                شاشة البيع محتاجة جلسة خزنة مفتوحة عشان تقدر تسجّل أي بيع نقدي
              </p>
              <button
                className="btn btn-primary"
                style={{
                  marginTop: 16,
                }}
                onClick={openOpenModal}
              >
                + فتح الخزنة وبدء البيع
              </button>
            </div>
          </div>
        </div>

        {showOpen && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-header">
                <span className="modal-title">فتح الخزنة</span>
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
                  {lastClosedBalance != null && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text3)",
                        marginTop: 4,
                      }}
                    >
                      آخر رصيد إقفال كان {fc(lastClosedBalance)} — تم ملؤه تلقائيًا
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
                  {busy ? "جاري الفتح..." : "فتح الخزنة"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========== جلسة مفتوحة: هيكل شاشة الـ POS ==========
  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              🧾 {org?.name_ar || org?.name || "نقطة البيع"}
            </div>
            <span className="tag">
              🟢 الخزنة مفتوحة — من {fd(session.opened_at)}
            </span>
            <span
              style={{
                fontSize: 13,
                color: "var(--text3)",
              }}
            >
              الكاشير: {profile?.full_name || "—"}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text3)",
              }}
            >
              جلسة #{session.id.slice(0, 8)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
            }}
          >
            <button className="btn btn-secondary btn-sm" disabled title="جاي في الباتش الجاية">
              ⏸️ تعليق البيع
            </button>
            <button className="btn btn-secondary btn-sm" disabled title="جاي في الباتش الجاية">
              📋 فواتير سابقة
            </button>
            <button className="btn btn-secondary btn-sm" disabled title="جاي في الباتش الجاية">
              🔒 قفل الخزنة
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div
          className="empty-state"
          style={{
            padding: 60,
          }}
        >
          <div className="icon">🛒</div>
          <p style={{ fontWeight: 600 }}>شاشة البيع (Barcode + Cart)</p>
          <p
            style={{
              fontSize: 13,
              color: "var(--text3)",
              marginTop: 4,
            }}
          >
            جاية في الباتش الجاية — الخزنة اتفتحت وجاهزة، الأساس اتبنى صح
          </p>
        </div>
      </div>
    </div>
  );
}
