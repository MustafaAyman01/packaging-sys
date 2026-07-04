import { StatusBadge } from "../components/StatusBadge";
import { fc, fd } from "../utils/format";
import { TYPE_LABELS } from "../constants/labels";

export function Dashboard({ data, setPage, getStockQty }) {
  const salesInvs = data.invoices.filter((i) => i.type === "sale" && i.status !== "cancelled");
  const totalSales = salesInvs.reduce((s, i) => s + i.total_amount, 0);
  const totalReceived = salesInvs.reduce((s, i) => s + i.paid_amount, 0);
  const totalPending = totalSales - totalReceived;
  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  const totalSalariesPaid = data.expenses
    .filter((e) => e.category === "رواتب")
    .reduce((s, e) => s + e.amount, 0);
  const purchaseInvs = data.invoices.filter((i) => i.type === "purchase" && i.status !== "cancelled");
  const totalPurchases = purchaseInvs.reduce((s, i) => s + i.total_amount, 0);
  const lowStock = data.products.filter((p) => getStockQty(p.id) < p.min_stock_level && p.is_active);
  const recentInvs = [...data.invoices]
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
    .slice(0, 6);
  const netProfit = totalSales - totalPurchases - totalExpenses;

  const stats = [
    {
      label: "إجمالي المبيعات",
      value: fc(totalSales),
      sub: `${salesInvs.length} فاتورة`,
      icon: "📈",
      bg: "var(--green-bg)",
      border: "var(--green)",
    },
    {
      label: "المبالغ المحصلة",
      value: fc(totalReceived),
      sub: "نقدي + تحويل",
      icon: "💵",
      bg: "var(--green-bg)",
      border: "var(--green)",
    },
    {
      label: "مستحقات التحصيل",
      value: fc(totalPending),
      sub: "قيد التحصيل",
      icon: "⏳",
      bg: "var(--amber-bg)",
      border: "var(--amber)",
    },
    {
      label: "صافي الربح",
      value: fc(netProfit),
      sub: "بعد المصروفات",
      icon: "💹",
      bg: netProfit >= 0 ? "var(--green-bg)" : "var(--red-bg)",
      border: netProfit >= 0 ? "var(--green)" : "var(--red)",
    },
    {
      label: "إجمالي المشتريات",
      value: fc(totalPurchases),
      sub: `${purchaseInvs.length} فاتورة`,
      icon: "🛒",
      bg: "var(--blue-bg)",
      border: "var(--blue)",
    },
    {
      label: "مخزون منخفض",
      value: lowStock.length + " منتج",
      sub: "تحتاج إعادة طلب",
      icon: "⚠️",
      bg: "var(--amber-bg)",
      border: "var(--amber)",
    },
    {
      label: "رواتب مدفوعة",
      value: fc(totalSalariesPaid),
      sub: "إجمالي ما تم صرفه",
      icon: "🧑‍💼",
      bg: "var(--blue-bg)",
      border: "var(--blue)",
    },
  ];

  return (
    <div>
      <div className="stat-grid">
        {stats.map((s, i) => (
          <div className="stat-card" key={i} style={{ borderRightColor: s.border || "var(--accent-teal)" }}>
            <div className="stat-icon" style={{ background: s.bg }}>
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
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          ⚠️ <strong>{lowStock.length} منتجات وصلت للحد الأدنى:</strong>{" "}
          {lowStock.map((p) => p.name).join("، ")}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
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
                  <td style={{ fontWeight: 500 }}>{inv.invoice_number}</td>
                  <td>
                    <span className="tag">{TYPE_LABELS[inv.type]}</span>
                  </td>
                  <td>{fd(inv.invoice_date)}</td>
                  <td style={{ fontWeight: 500 }}>{fc(inv.total_amount)}</td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">المخزون الحالي</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage("stock")}>
              إدارة المخزون
            </button>
          </div>
          <div className="card-body" style={{ padding: "12px 20px" }}>
            {data.products
              .filter((p) => p.is_active)
              .map((p) => {
                const qty = getStockQty(p.id);
                const pct = Math.min(100, (qty / (p.min_stock_level * 3)) * 100);
                const low = qty < p.min_stock_level;
                return (
                  <div key={p.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 13 }}>{p.name}</span>
                      <span
                        style={{ fontSize: 13, fontWeight: 500, color: low ? "var(--red)" : "var(--green)" }}
                      >
                        {qty.toLocaleString()} {data.units.find((u) => u.id === p.unit_id)?.abbreviation}
                        {low ? " ⚠️" : ""}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${pct}%`, background: low ? "var(--red)" : "var(--green)" }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
