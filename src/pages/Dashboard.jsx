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
            overflow: "visible",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              marginBottom: lookupProduct ? 16 : 0,
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
          {lookupProduct && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text3)",
                    marginBottom: 3,
                  }}
                >
                  الفئة
                </div>
                <div
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {lookupCategory?.name || "—"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text3)",
                    marginBottom: 3,
                  }}
                >
                  سعر التكلفة
                </div>
                <div
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {fc(lookupProduct.cost_price)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text3)",
                    marginBottom: 3,
                  }}
                >
                  سعر البيع
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--accent)",
                  }}
                >
                  {fc(lookupProduct.sale_price)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text3)",
                    marginBottom: 3,
                  }}
                >
                  الرصيد الحالي
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    color: lookupLow ? "var(--red)" : "var(--green)",
                  }}
                >
                  {lookupQty.toLocaleString()} {lookupUnit?.abbreviation}
                  {lookupLow ? " ⚠️" : ""}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text3)",
                    marginBottom: 3,
                  }}
                >
                  الحد الأدنى
                </div>
                <div
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {lookupProduct.min_stock_level?.toLocaleString() || 0} {lookupUnit?.abbreviation}
                </div>
              </div>
            </div>
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
