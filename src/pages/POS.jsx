import { useState, useEffect, useRef } from "react";
import { sb } from "../services/supabaseClient";
import { fc, fd } from "../utils/format";
import { ProductPicker } from "../components/ProductPicker";

// Batch 2/3 — POS Foundation + Barcode/Cart.
// البيع الفعلي (Complete Sale) جاي في الباتش الجاية.
export function POS({ org, profile, data, update, toast, myRole }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showOpen, setShowOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastClosedBalance, setLastClosedBalance] = useState(null);

  // ---------- Cart ----------
  const [cart, setCart] = useState([]); // [{product_id, sku, name, quantity, unit_price, discount_percent}]
  const [barcodeValue, setBarcodeValue] = useState("");
  const barcodeRef = useRef(null);

  const canEditPrice = ["owner", "admin", "accountant", "sales"].includes(myRole);

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

  // الفوكس يفضل على حقل الباركود دايمًا — عشان أي سكانر (USB/Bluetooth بيشتغل
  // كـ keyboard) يضيف المنتج من غير ما الكاشير يدوس بالماوس خالص
  useEffect(() => {
    if (session) barcodeRef.current?.focus();
  }, [session, cart]);

  const addProductToCart = (product) => {
    if (!product || !product.is_active) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.product_id === product.id);
      if (existing) {
        return prev.map((l) => (l.product_id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          quantity: 1,
          unit_price: product.sale_price || 0,
          discount_percent: 0,
        },
      ];
    });
  };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = barcodeValue.trim();
    if (!code) return;
    const product = data.products.find((p) => p.is_active && p.sku?.toLowerCase() === code.toLowerCase());
    if (product) {
      addProductToCart(product);
      setBarcodeValue("");
    } else {
      toast(`⚠️ مفيش منتج بالكود "${code}"`);
      setBarcodeValue("");
    }
  };

  const updateCartLine = (productId, patch) => {
    setCart((prev) => prev.map((l) => (l.product_id === productId ? { ...l, ...patch } : l)));
  };

  const removeCartLine = (productId) => {
    setCart((prev) => prev.filter((l) => l.product_id !== productId));
  };

  const clearCart = () => {
    if (cart.length && !confirm("تفريغ السلة بالكامل؟")) return;
    setCart([]);
  };

  const lineTotal = (l) => l.quantity * l.unit_price * (1 - (l.discount_percent || 0) / 100);
  const cartSubtotal = cart.reduce((s, l) => s + lineTotal(l), 0);

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 16,
        }}
      >
        <div className="card">
          <div className="card-body">
            <form onSubmit={handleBarcodeSubmit} style={{ marginBottom: 14 }}>
              <input
                ref={barcodeRef}
                autoFocus
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder="📷 امسح الباركود أو اكتب الكود واضغط Enter"
                style={{
                  fontSize: 20,
                  padding: "14px 16px",
                  fontWeight: 600,
                }}
              />
            </form>

            <div style={{ marginBottom: 14 }}>
              <ProductPicker
                products={data.products}
                units={data.units}
                value=""
                onSelect={(pid) => {
                  const p = data.products.find((x) => x.id === pid);
                  if (p) addProductToCart(p);
                }}
                placeholder="أو دوّر بالاسم يدويًا..."
                data={data}
                update={update}
                toast={toast}
              />
            </div>

            <table>
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكود</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>خصم %</th>
                  <th>الإجمالي</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr key={l.product_id}>
                    <td style={{ fontWeight: 500 }}>{l.name}</td>
                    <td>
                      <code style={{ fontSize: 12 }}>{l.sku}</code>
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        type="number"
                        min="1"
                        value={l.quantity}
                        onChange={(e) => updateCartLine(l.product_id, { quantity: +e.target.value || 1 })}
                      />
                    </td>
                    <td style={{ width: 100 }}>
                      <input
                        type="number"
                        min="0"
                        disabled={!canEditPrice}
                        value={l.unit_price}
                        onChange={(e) => updateCartLine(l.product_id, { unit_price: +e.target.value || 0 })}
                      />
                    </td>
                    <td style={{ width: 80 }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={!canEditPrice}
                        value={l.discount_percent}
                        onChange={(e) =>
                          updateCartLine(l.product_id, { discount_percent: +e.target.value || 0 })
                        }
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{fc(lineTotal(l))}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeCartLine(l.product_id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cart.length === 0 && (
              <div className="empty-state">
                <div className="icon">🛒</div>
                <p>السلة فاضية — امسح باركود أو دوّر على منتج</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">الإجمالي</span>
            {cart.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={clearCart}>
                تفريغ السلة
              </button>
            )}
          </div>
          <div className="card-body">
            <div className="totals-box">
              <div className="totals-row total">
                <span>الإجمالي (قبل الضريبة)</span>
                <span style={{ color: "var(--accent)", fontSize: 20 }}>{fc(cartSubtotal)}</span>
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={cart.length === 0}
              style={{ width: "100%", marginTop: 14, padding: "12px", fontSize: 15 }}
              title="جاي في الباتش الجاية"
            >
              💳 الدفع وإتمام البيع
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
