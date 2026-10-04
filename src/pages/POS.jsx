import { useState, useEffect, useRef } from "react";
import { sb } from "../services/supabaseClient";
import { fc, fd, generateId, today } from "../utils/format";
import { ProductPicker } from "../components/ProductPicker";
import { PartyPicker } from "../components/PartyPicker";
import { PAYMENT_METHODS } from "../constants/labels";

const DEFAULT_CASH_CLIENT_NAME = "عميل نقدي (بيع سريع)";
const DEFAULT_TAX_RATE = 14;

// Batch 2/3/4 — POS Foundation + Barcode/Cart + Complete Sale.
export function POS({ org, profile, data, update, toast, myRole, refreshData }) {
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
  const cartTax = cartSubtotal * (DEFAULT_TAX_RATE / 100);
  const cartTotal = cartSubtotal + cartTax;

  // ---------- الدفع وإتمام البيع ----------
  const [showPay, setShowPay] = useState(false);
  const [clientId, setClientId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [saleBusy, setSaleBusy] = useState(false);
  const [pendingInvoiceId, setPendingInvoiceId] = useState(null); // ثابت طول محاولات نفس البيعة (idempotency)
  const [receipt, setReceipt] = useState(null); // نتيجة RPC بعد نجاح البيع

  const ensureDefaultCashClient = async () => {
    const existing = data.clients.find((c) => c.name === DEFAULT_CASH_CLIENT_NAME && c.is_active);
    if (existing) return existing.id;
    const newClient = { id: generateId(), name: DEFAULT_CASH_CLIENT_NAME, is_active: true, type: "retail" };
    await update("clients", [...data.clients, newClient]);
    return newClient.id;
  };

  const openPayModal = async () => {
    if (cart.length === 0) return;
    const defaultClientId = await ensureDefaultCashClient();
    setClientId(defaultClientId);
    setPaidAmount(String(Math.round(cartTotal * 100) / 100));
    setPayMethod("cash");
    setPendingInvoiceId(generateId()); // بيتولّد مرة واحدة بس لكل محاولة بيع
    setShowPay(true);
  };

  const completeSale = async () => {
    if (saleBusy) return;
    if (!clientId) {
      toast("⚠️ اختار عميل أو خلي العميل النقدي الافتراضي");
      return;
    }
    const paid = +paidAmount || 0;
    setSaleBusy(true);
    try {
      const { data: result, error } = await sb.rpc("create_invoice_with_effects", {
        p_invoice_id: pendingInvoiceId,
        p_type: "sale",
        p_client_id: clientId,
        p_supplier_id: null,
        p_invoice_date: today(),
        p_due_date: null,
        p_discount_amount: 0,
        p_tax_rate: DEFAULT_TAX_RATE,
        p_notes: "بيع من نقطة البيع (POS)",
        p_items: cart.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_percent: l.discount_percent || 0,
        })),
        p_payment: paid > 0 ? { amount: paid, method: payMethod } : null,
      });
      if (error) throw error;

      setReceipt({ ...result, change: payMethod === "cash" ? Math.max(0, paid - cartTotal) : 0 });
      setShowPay(false);
      setCart([]);
      toast(result.status === "already_applied" ? "تم رصد هذه العملية مسبقًا ✓" : "تمت عملية البيع ✓");
      refreshData && refreshData();
    } catch (e) {
      toast(`⚠️ ${e.message}`);
    }
    setSaleBusy(false);
  };

  const startNewSale = () => {
    setReceipt(null);
    setPendingInvoiceId(null);
  };

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
              <div className="totals-row">
                <span>الإجمالي قبل الضريبة</span>
                <span>{fc(cartSubtotal)}</span>
              </div>
              <div className="totals-row">
                <span>الضريبة ({DEFAULT_TAX_RATE}%)</span>
                <span>{fc(cartTax)}</span>
              </div>
              <div className="totals-row total">
                <span>الإجمالي</span>
                <span style={{ color: "var(--accent)", fontSize: 20 }}>{fc(cartTotal)}</span>
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={cart.length === 0}
              style={{ width: "100%", marginTop: 14, padding: "12px", fontSize: 15 }}
              onClick={openPayModal}
            >
              💳 الدفع وإتمام البيع
            </button>
          </div>
        </div>
      </div>

      {showPay && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">الدفع وإتمام البيع</span>
              <button className="close-btn" onClick={() => setShowPay(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>العميل</label>
                <PartyPicker
                  parties={data.clients}
                  value={clientId}
                  onSelect={setClientId}
                  placeholder="دوّر على عميل أو سيب العميل النقدي الافتراضي..."
                />
              </div>
              <div className="totals-box" style={{ marginBottom: 14 }}>
                <div className="totals-row">
                  <span>الإجمالي قبل الضريبة</span>
                  <span>{fc(cartSubtotal)}</span>
                </div>
                <div className="totals-row">
                  <span>الضريبة ({DEFAULT_TAX_RATE}%)</span>
                  <span>{fc(cartTax)}</span>
                </div>
                <div className="totals-row total">
                  <span>الإجمالي المطلوب</span>
                  <span style={{ color: "var(--accent)" }}>{fc(cartTotal)}</span>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>طريقة الدفع</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>المبلغ المدفوع</label>
                  <input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
                </div>
              </div>
              {payMethod === "cash" && +paidAmount > cartTotal && (
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--green)",
                  }}
                >
                  الباقي للعميل (Change): {fc(+paidAmount - cartTotal)}
                </div>
              )}
              {+paidAmount < cartTotal && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text3)",
                  }}
                >
                  متبقي على العميل: {fc(cartTotal - (+paidAmount || 0))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPay(false)}>
                رجوع
              </button>
              <button className="btn btn-primary" disabled={saleBusy} onClick={completeSale}>
                {saleBusy ? "جاري إتمام البيع..." : "✅ إتمام البيع"}
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">تمت عملية البيع ✓</span>
            </div>
            <div className="modal-body">
              <div
                style={{
                  textAlign: "center",
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 40 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  فاتورة {receipt.invoice?.invoice_number}
                </div>
              </div>
              <div className="totals-box">
                <div className="totals-row">
                  <span>الإجمالي</span>
                  <span>{fc(receipt.invoice?.total_amount)}</span>
                </div>
                <div className="totals-row">
                  <span>المدفوع</span>
                  <span>{fc(receipt.invoice?.paid_amount)}</span>
                </div>
                {receipt.change > 0 && (
                  <div className="totals-row total">
                    <span>الباقي للعميل</span>
                    <span style={{ color: "var(--green)" }}>{fc(receipt.change)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => toast("طباعة الإيصال الحراري جاية في باتش لاحقة")}
              >
                🖨️ طباعة إيصال
              </button>
              <button className="btn btn-primary" onClick={startNewSale}>
                بيعة جديدة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
