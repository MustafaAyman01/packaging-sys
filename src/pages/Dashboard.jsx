import { useState } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { ProductPicker } from "../components/ProductPicker";
import { fc, fd, today } from "../utils/format";
import { TYPE_LABELS } from "../constants/labels";

export function Dashboard({ data, setPage, getStockQty }) {
  const [lookupId, setLookupId] = useState("");

  const salesInvs = data.invoices.filter((i) => i.type === "sale" && i.status !== "cancelled");
  const totalSales = salesInvs.reduce((s, i) => s + i.total_amount, 0);
  const totalReceived = salesInvs.reduce((s, i) => s + i.paid_amount, 0);
  const totalReceivable = totalSales - totalReceived;

  const purchaseInvs = data.invoices.filter((i) => i.type === "purchase" && i.status !== "cancelled");
  const totalPurchases = purchaseInvs.reduce((s, i) => s + i.total_amount, 0);
  const totalPurchasePaid = purchaseInvs.reduce((s, i) => s + i.paid_amount, 0);
  const totalPayable = totalPurchases - totalPurchasePaid;

  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  const totalSalariesPaid = data.expenses
    .filter((e) => e.category === "رواتب")
    .reduce((s, e) => s + e.amount, 0);

  const netProfit = totalSales - totalPurchases - totalExpenses;

  const activeProducts = data.products.filter((p) => p.is_active);
  const lowStock = activeProducts.filter((p) => getStockQty(p.id) < p.min_stock_level);

  // ── فواتير مستحقة قريبًا (خلال 7 أيام) أو متأخرة بالفعل ─────────────────
  const DUE_SOON_DAYS = 7;
  const todayStr = today();
  const dueSoonLimit = new Date();
  dueSoonLimit.setDate(dueSoonLimit.getDate() + DUE_SOON_DAYS);
  const dueSoonLimitStr = dueSoonLimit.toISOString().slice(0, 10);
  const dueInvoices = data.invoices
    .filter(
      (i) =>
        i.status !== "cancelled" &&
        i.status !== "paid" &&
        i.total_amount - i.paid_amount > 0.01 &&
        i.due_date &&
        i.due_date <= dueSoonLimitStr
    )
    .map((i) => ({
      ...i,
      remaining: i.total_amount - i.paid_amount,
      partyName:
        i.type === "sale"
          ? data.clients.find((c) => c.id === i.client_id)?.name || "—"
          : data.suppliers.find((s) => s.id === i.supplier_id)?.name || "—",
      isOverdue: i.due_date < todayStr,
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const dueReceivables = dueInvoices.filter((i) => i.type === "sale");
  const duePayables = dueInvoices.filter((i) => i.type === "purchase");

  const thisMonth = today().slice(0, 7);
  const mfgOrders = data.manufacturing_orders || [];
  const mfgThisMonth = mfgOrders.filter((o) => (o.order_date || "").startsWith(thisMonth));

  const recentInvs = [...data.invoices]
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
    .slice(0, 6);

  // أكثر المنتجات احتياجًا لإعادة الطلب (الأقل توفرًا نسبةً لحدها الأدنى) — بدل عرض كل المنتجات
  const stockOverview = [...activeProducts]
    .map((p) => ({
      ...p,
      qty: getStockQty(p.id),
      ratio: getStockQty(p.id) / (p.min_stock_level > 0 ? p.min_stock_level : 1),
    }))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 8);

  const lookupProduct = data.products.find((p) => p.id === lookupId);
  const lookupUnit = lookupProduct ? data.units.find((u) => u.id === lookupProduct.unit_id) : null;
  const lookupCategory = lookupProduct ? data.categories.find((c) => c.id === lookupProduct.category_id) : null;
  const lookupQty = lookupProduct ? getStockQty(lookupProduct.id) : 0;
  const lookupLow = lookupProduct ? lookupQty < lookupProduct.min_stock_level : false;

  const stats = [
    {
      label: "إجمالي المبيعات",
      value: fc(totalSales),
      sub: `${salesInvs.length} فاتورة`,
      icon: "📈",
      bg: "var(--green-bg)",
      border: "var(--green)",
      onClick: () => setPage("invoices"),
    },
    {
      label: "المبالغ المحصلة",
      value: fc(totalReceived),
      sub: "نقدي + تحويل",
      icon: "💵",
      bg: "var(--green-bg)",
      border: "var(--green)",
      onClick: () => setPage("payments"),
    },
    {
      label: "مستحقات التحصيل",
      value: fc(totalReceivable),
      sub: "من العملاء",
      icon: "⏳",
      bg: "var(--amber-bg)",
      border: "var(--amber)",
      onClick: () => setPage("invoices"),
    },
    {
      label: "مستحقات للموردين",
      value: fc(totalPayable),
      sub: "مشتريات لم تُسدد",
      icon: "📤",
      bg: "var(--amber-bg)",
      border: "var(--amber)",
      onClick: () => setPage("suppliers"),
    },
    {
      label: "إجمالي المشتريات",
      value: fc(totalPurchases),
      sub: `${purchaseInvs.length} فاتورة`,
      icon: "🛒",
      bg: "var(--blue-bg)",
      border: "var(--blue)",
      onClick: () => setPage("invoices"),
    },
    {
      label: "إجمالي المصروفات",
      value: fc(totalExpenses),
      sub: "كل المصروفات",
      icon: "🧾",
      bg: "var(--blue-bg)",
      border: "var(--blue)",
      onClick: () => setPage("expenses"),
    },
    {
      label: "رواتب مدفوعة",
      value: fc(totalSalariesPaid),
      sub: "إجمالي ما تم صرفه",
      icon: "🧑‍💼",
      bg: "var(--blue-bg)",
      border: "var(--blue)",
      onClick: () => setPage("hr"),
    },
    {
      label: "صافي الربح",
      value: fc(netProfit),
      sub: "بعد المشتريات والمصروفات",
      icon: "💹",
      bg: netProfit >= 0 ? "var(--green-bg)" : "var(--red-bg)",
      border: netProfit >= 0 ? "var(--green)" : "var(--red)",
    },
    {
      label: "أوامر تصنيع هذا الشهر",
      value: mfgThisMonth.length + " أمر",
      sub: `${mfgOrders.length} إجمالي منذ البداية`,
      icon: "🏗️",
      bg: "var(--blue-bg)",
      border: "var(--blue)",
      onClick: () => setPage("manufacturing_orders"),
    },
    {
      label: "مخزون منخفض",
      value: lowStock.length + " منتج",
      sub: "تحتاج إعادة طلب",
      icon: "⚠️",
      bg: "var(--amber-bg)",
      border: "var(--amber)",
      onClick: () => setPage("stock"),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <button className="btn btn-primary btn-sm" onClick={() => setPage("invoices")}>
          + فاتورة مبيعات
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage("manufacturing_orders")}>
          + أمر تصنيع
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage("stock")}>
          + حركة مخزون
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage("cash_vouchers")}>
          + سند قبض/صرف
        </button>
      </div>

      <div className="stat-grid">
        {stats.map((s, i) => (
          <div
            className="stat-card"
            key={i}
            style={{
              borderRightColor: s.border || "var(--accent-teal)",
              cursor: s.onClick ? "pointer" : "default",
            }}
            onClick={s.onClick}
          >
            <div
              className="stat-icon"
              style={{
                background: s.bg,
              }}
            >
              {s.icon}
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" title={s.value}>
              {s.value}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: 20,
          }}
        >
          ⚠️ <strong>{lowStock.length} منتجات وصلت للحد الأدنى:</strong>{" "}
          {lowStock.map((p) => p.name).join("، ")}
        </div>
      )}

      {(dueReceivables.length > 0 || duePayables.length > 0) && (
        <div
          className="card"
          style={{
            marginBottom: 20,
          }}
        >
          <div className="card-header">
            <span className="card-title">
              🔔 فواتير مستحقة قريبًا (خلال {DUE_SOON_DAYS} أيام) أو متأخرة
            </span>
          </div>
          <div className="card-body">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 22,
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 10,
                    fontSize: 13.5,
                  }}
                >
                  💰 مستحق من عملاء ({dueReceivables.length})
                </div>
                {dueReceivables.length === 0 ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text3)",
                    }}
                  >
                    لا يوجد
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {dueReceivables.slice(0, 8).map((i) => (
                      <div
                        key={i.id}
                        onClick={() => setPage && setPage("invoices")}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          padding: "9px 12px",
                          borderRadius: "var(--radius-sm)",
                          background: i.isOverdue ? "var(--red-bg)" : "var(--surface2)",
                          cursor: "pointer",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13.5,
                            }}
                          >
                            {i.partyName}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: i.isOverdue ? "var(--red)" : "var(--text3)",
                            }}
                          >
                            {i.invoice_number} — {i.isOverdue ? "⚠️ متأخرة، الاستحقاق كان" : "الاستحقاق"}{" "}
                            {fd(i.due_date)}
                          </div>
                        </div>
                        <div
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            color: i.isOverdue ? "var(--red)" : "var(--amber)",
                          }}
                        >
                          {fc(i.remaining)}
                        </div>
                      </div>
                    ))}
                    {dueReceivables.length > 8 && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text3)",
                          textAlign: "center",
                        }}
                      >
                        +{dueReceivables.length - 8} فاتورة تانية
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 10,
                    fontSize: 13.5,
                  }}
                >
                  📤 مستحق لموردين ({duePayables.length})
                </div>
                {duePayables.length === 0 ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text3)",
                    }}
                  >
                    لا يوجد
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {duePayables.slice(0, 8).map((i) => (
                      <div
                        key={i.id}
                        onClick={() => setPage && setPage("invoices")}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          padding: "9px 12px",
                          borderRadius: "var(--radius-sm)",
                          background: i.isOverdue ? "var(--red-bg)" : "var(--surface2)",
                          cursor: "pointer",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13.5,
                            }}
                          >
                            {i.partyName}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: i.isOverdue ? "var(--red)" : "var(--text3)",
                            }}
                          >
                            {i.invoice_number} — {i.isOverdue ? "⚠️ متأخرة، الاستحقاق كان" : "الاستحقاق"}{" "}
                            {fd(i.due_date)}
                          </div>
                        </div>
                        <div
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            color: i.isOverdue ? "var(--red)" : "var(--amber)",
                          }}
                        >
                          {fc(i.remaining)}
                        </div>
                      </div>
                    ))}
                    {duePayables.length > 8 && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text3)",
                          textAlign: "center",
                        }}
                      >
                        +{duePayables.length - 8} فاتورة تانية
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="card"
        style={{
          marginBottom: 20,
          overflow: "visible",
        }}
      >
        <div className="card-header">
          <span className="card-title">🔍 استعلام سريع عن سعر ورصيد منتج</span>
        </div>
        <div
          className="card-body"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 260,
              flexShrink: 0,
            }}
          >
            <ProductPicker
              products={data.products}
              units={data.units}
              value={lookupId}
              onSelect={setLookupId}
              placeholder="اكتب اسم المنتج أو الكود..."
            />
          </div>
          {lookupProduct ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "6px 26px",
              }}
            >
              {[
                ["الفئة", lookupCategory?.name || "—"],
                ["سعر التكلفة", fc(lookupProduct.cost_price)],
                ["سعر البيع", fc(lookupProduct.sale_price), "var(--accent)"],
                [
                  "الرصيد الحالي",
                  `${lookupQty.toLocaleString()} ${lookupUnit?.abbreviation || ""}${lookupLow ? " ⚠️" : ""}`,
                  lookupLow ? "var(--red)" : "var(--green)",
                ],
                ["الحد الأدنى", `${(lookupProduct.min_stock_level || 0).toLocaleString()} ${lookupUnit?.abbreviation || ""}`],
              ].map(([label, value, color], i) => (
                <div key={i}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text3)",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: color || "var(--text)",
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span
              style={{
                fontSize: 13,
                color: "var(--text3)",
              }}
            >
              اختر منتج لعرض سعره ورصيده الحالي
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <div className="card">
          <div className="card-header">
            <span className="card-title">آخر الفواتير</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage("invoices")}>
              عرض الكل
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>النوع</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {recentInvs.map((inv) => (
                <tr key={inv.id}>
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {inv.invoice_number}
                  </td>
                  <td>
                    <span className="tag">{TYPE_LABELS[inv.type]}</span>
                  </td>
                  <td>{fd(inv.invoice_date)}</td>
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {fc(inv.total_amount)}
                  </td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                </tr>
              ))}
              {recentInvs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      color: "var(--text3)",
                      padding: 20,
                    }}
                  >
                    لا توجد فواتير بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">الأقرب لإعادة الطلب</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage("stock")}>
              إدارة المخزون
            </button>
          </div>
          <div
            className="card-body"
            style={{
              padding: "12px 20px",
            }}
          >
            {stockOverview.map((p) => {
              const pct = Math.min(100, (p.qty / (p.min_stock_level * 3 || 1)) * 100);
              const low = p.qty < p.min_stock_level;
              return (
                <div
                  key={p.id}
                  style={{
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 5,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                      }}
                    >
                      {p.name}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: low ? "var(--red)" : "var(--green)",
                      }}
                    >
                      {p.qty.toLocaleString()} {data.units.find((u) => u.id === p.unit_id)?.abbreviation}
                      {low ? " ⚠️" : ""}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${pct}%`,
                        background: low ? "var(--red)" : "var(--green)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {stockOverview.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text3)",
                  padding: 20,
                  fontSize: 13,
                }}
              >
                لا توجد منتجات بعد
              </div>
            )}
            {activeProducts.length > stockOverview.length && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--text3)",
                  marginTop: 4,
                }}
              >
                و {activeProducts.length - stockOverview.length} منتج آخر —{" "}
                <span
                  style={{
                    color: "var(--accent)",
                    cursor: "pointer",
                  }}
                  onClick={() => setPage("products")}
                >
                  عرض كل المنتجات
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
