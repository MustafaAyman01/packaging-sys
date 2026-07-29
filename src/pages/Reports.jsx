import React, { useState } from "react";
import { printDebtsSheet } from "../features/print/printDebtsSheet";
import { fc, fd } from "../utils/format";
import { getPartyBalance, getUnappliedMap } from "../utils/balance";
import { t } from "../i18n";

export function Reports({ data, getStockQty, org, lang }) {
  const [tab, setTab] = useState("kpi");
  const [period, setPeriod] = useState("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ── Date range helpers ──────────────────────────────────────────────────────
  const getRange = (p) => {
    const now = new Date();
    const y = now.getFullYear(),
      m = now.getMonth(),
      d = now.getDate();
    if (p === "today")
      return {
        from: new Date(y, m, d),
        to: new Date(y, m, d, 23, 59, 59),
      };
    if (p === "week")
      return {
        from: new Date(y, m, d - now.getDay()),
        to: new Date(y, m, d, 23, 59, 59),
      };
    if (p === "month")
      return {
        from: new Date(y, m, 1),
        to: new Date(y, m + 1, 0, 23, 59, 59),
      };
    if (p === "quarter")
      return {
        from: new Date(y, Math.floor(m / 3) * 3, 1),
        to: new Date(y, Math.floor(m / 3) * 3 + 3, 0, 23, 59, 59),
      };
    if (p === "year")
      return {
        from: new Date(y, 0, 1),
        to: new Date(y, 11, 31, 23, 59, 59),
      };
    if (p === "custom" && customFrom && customTo)
      return {
        from: new Date(customFrom),
        to: new Date(customTo + "T23:59:59"),
      };
    return {
      from: new Date(y, m, 1),
      to: new Date(y, m + 1, 0, 23, 59, 59),
    };
  };
  const getPrevRange = (p) => {
    const now = new Date();
    const y = now.getFullYear(),
      m = now.getMonth(),
      d = now.getDate();
    if (p === "today")
      return {
        from: new Date(y, m, d - 1),
        to: new Date(y, m, d - 1, 23, 59, 59),
      };
    if (p === "week")
      return {
        from: new Date(y, m, d - now.getDay() - 7),
        to: new Date(y, m, d - now.getDay() - 1, 23, 59, 59),
      };
    if (p === "month")
      return {
        from: new Date(y, m - 1, 1),
        to: new Date(y, m, 0, 23, 59, 59),
      };
    if (p === "quarter")
      return {
        from: new Date(y, Math.floor(m / 3) * 3 - 3, 1),
        to: new Date(y, Math.floor(m / 3) * 3, 0, 23, 59, 59),
      };
    if (p === "year")
      return {
        from: new Date(y - 1, 0, 1),
        to: new Date(y - 1, 11, 31, 23, 59, 59),
      };
    return {
      from: new Date(y, m - 1, 1),
      to: new Date(y, m, 0, 23, 59, 59),
    };
  };
  const inRange = (dateStr, range) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= range.from && d <= range.to;
  };
  const range = getRange(period);
  const prevRange = getPrevRange(period);

  // ── Filtered data for current and previous period ──────────────────────────
  const filterInvs = (r, type) =>
    data.invoices.filter((i) => i.type === type && i.status !== "cancelled" && inRange(i.invoice_date, r));
  const salesCur = filterInvs(range, "sale");
  const salesPrev = filterInvs(prevRange, "sale");
  const purchCur = filterInvs(range, "purchase");
  const expCur = data.expenses.filter((e) => inRange(e.expense_date, range));
  const expPrev = data.expenses.filter((e) => inRange(e.expense_date, prevRange));
  const vouchCur = (data.cash_vouchers || []).filter((v) => inRange(v.voucher_date, range));
  const vouchPrev = (data.cash_vouchers || []).filter((v) => inRange(v.voucher_date, prevRange));
  const sum = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);
  // مصاريف التصنيع (مغسلة، قص، خياطة...) — مصروف نقدي حقيقي لازم يتخصم من صافي الربح
  // برضو، مش بس يزوّد تكلفة تقييم المخزون. متجمعوش مع تكلفة الخامة لأنها اتخصمت
  // أصلاً مرة واحدة ضمن المشتريات وقت شرائها. وبرضو مستبعدين الأوامر اللي ليها
  // فاتورة مشتريات لجهة مصنّعة، لأن تكلفتها بقت متحسوبة أصلاً من خلال المشتريات.
  const mfgCur = (data.manufacturing_orders || [])
    .filter((o) => inRange(o.order_date, range))
    .filter((o) => !o.contractor_invoice_id);
  const mfgPrev = (data.manufacturing_orders || [])
    .filter((o) => inRange(o.order_date, prevRange))
    .filter((o) => !o.contractor_invoice_id);
  const totalMfgCostsCur = sum(mfgCur, "expenses_total");
  const totalMfgCostsPrev = sum(mfgPrev, "expenses_total");
  const pct = (cur, prev) => {
    if (prev === 0 || prev === null || prev === undefined) return null;
    if (Math.abs(prev) < 0.01) return null; // تجنب القسمة على أرقام قريبة من الصفر
    const result = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    if (Math.abs(result) > 999) return null; // لو النسبة غير منطقية، اخفيها
    return result;
  };
  const arrow = (n) => (n === null ? "" : n > 0 ? "↑" : n < 0 ? "↓" : "=");
  const arrowColor = (n, invert = false) => {
    if (n === null) return "var(--text3)";
    const up = n > 0;
    return up !== invert ? "var(--green)" : "var(--red)";
  };
  const totalSalesCur = sum(salesCur, "total_amount");
  const totalSalesPrev = sum(salesPrev, "total_amount");
  const totalPurchCur = sum(purchCur, "total_amount");
  const totalExpCur = sum(expCur, "amount");
  const totalExpPrev = sum(expPrev, "amount");
  const vReceiptsCur = vouchCur.filter((v) => v.type === "receipt").reduce((s, v) => s + v.amount, 0);
  const vPaymentsCur = vouchCur.filter((v) => v.type === "payment").reduce((s, v) => s + v.amount, 0);
  const vReceiptsPrev = vouchPrev.filter((v) => v.type === "receipt").reduce((s, v) => s + v.amount, 0);
  const vPaymentsPrev = vouchPrev.filter((v) => v.type === "payment").reduce((s, v) => s + v.amount, 0);
  const grossCur = totalSalesCur - totalPurchCur;
  const netCur = grossCur - totalExpCur - totalMfgCostsCur + vReceiptsCur - vPaymentsCur;
  const grossPrev = sum(salesPrev, "total_amount") - sum(filterInvs(prevRange, "purchase"), "total_amount");
  const netPrev = grossPrev - totalExpPrev - totalMfgCostsPrev + vReceiptsPrev - vPaymentsPrev;
  const collectedCur = salesCur.reduce((s, i) => s + i.paid_amount, 0);
  const collectedPrev = salesPrev.reduce((s, i) => s + i.paid_amount, 0);

  // ── All-time (unfiltered) data — used for receivables/payables which must NOT depend on the period filter ──
  const allTimeSales = data.invoices.filter((i) => i.type === "sale" && i.status !== "cancelled");
  const allTimePurch = data.invoices.filter((i) => i.type === "purchase" && i.status !== "cancelled");
  // دفعات "على الحساب" غير مربوطة بفاتورة معينة (فرق/مقدم مستحق للعميل أو المورد) — لازم تتخصم من رصيده
  const unappliedByClient = getUnappliedMap(data, "client");
  const unappliedBySupplier = getUnappliedMap(data, "supplier");
  const totalUnappliedClient = Object.values(unappliedByClient).reduce((s, v) => s + v, 0);
  const totalUnappliedSupplier = Object.values(unappliedBySupplier).reduce((s, v) => s + v, 0);
  const totalReceivablesAllTime =
    allTimeSales.reduce((s, i) => s + (i.total_amount - i.paid_amount), 0) - totalUnappliedClient;
  const totalPayablesAllTime =
    allTimePurch.reduce((s, i) => s + (i.total_amount - i.paid_amount), 0) - totalUnappliedSupplier;
  // كشف مديونيات: مديونية كل عميل/مورد على حدة (لكل الأوقات)، للطباعة
  const clientDebtsList = data.clients
    .map((c) => ({ ...c, balance: getPartyBalance(data, "client", c.id) }))
    .filter((c) => c.balance > 0.01)
    .sort((a, b) => b.balance - a.balance);
  const supplierDebtsList = data.suppliers
    .map((s) => ({ ...s, balance: getPartyBalance(data, "supplier", s.id) }))
    .filter((s) => s.balance > 0.01)
    .sort((a, b) => b.balance - a.balance);
  // كشف أرصدة دائنة: عملاء دفعوا زيادة عن المستحق عليهم (رصيد ليهم عندنا)،
  // وموردين دفعنالهم زيادة عن المستحق عليهم (رصيد لينا عندهم)
  const clientCreditsList = data.clients
    .map((c) => ({ ...c, balance: getPartyBalance(data, "client", c.id) }))
    .filter((c) => c.balance < -0.01)
    .map((c) => ({ ...c, balance: -c.balance }))
    .sort((a, b) => b.balance - a.balance);
  const supplierCreditsList = data.suppliers
    .map((s) => ({ ...s, balance: getPartyBalance(data, "supplier", s.id) }))
    .filter((s) => s.balance < -0.01)
    .map((s) => ({ ...s, balance: -s.balance }))
    .sort((a, b) => b.balance - a.balance);

  // Period-bound totals (used by "financial" tab cards — these intentionally follow the selected period)
  const periodSales = salesCur;
  const periodPurch = purchCur;
  const periodExp = expCur;
  const expByCat = expCur.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
  const totalSalariesExp = expByCat["رواتب"] || 0;
  const productSales = (() => {
    const byProduct = {};
    salesCur
      .flatMap((i) => i.items || [])
      .forEach((it) => {
        const key = it.product_id || it.product_name; // احتياطًا لو فُقد الـ id بالكامل
        const prod = data.products.find((p) => p.id === it.product_id);
        if (!byProduct[key]) {
          byProduct[key] = {
            id: it.product_id,
            name: it.product_name || prod?.name || "منتج محذوف",
            sku: it.product_sku || prod?.sku || "",
            cost_price: prod?.cost_price ?? 0,
            soldQty: 0,
            revenue: 0,
          };
        }
        byProduct[key].soldQty += it.quantity;
        byProduct[key].revenue += it.total_price;
      });
    return Object.values(byProduct)
      .map((p) => ({
        ...p,
        profit: p.revenue - p.soldQty * p.cost_price,
      }))
      .filter((p) => p.soldQty > 0)
      .sort((a, b) => b.revenue - a.revenue);
  })();
  const clientSales = data.clients
    .map((c) => {
      const invs = salesCur.filter((i) => i.client_id === c.id);
      return {
        ...c,
        total: sum(invs, "total_amount"),
        count: invs.length,
        balance: getPartyBalance(data, "client", c.id),
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const PERIOD_LABELS = {
    today: "اليوم",
    week: "هذا الأسبوع",
    month: "هذا الشهر",
    quarter: "هذا الربع",
    year: "هذه السنة",
    custom: "مخصص",
  };

  // KPI card component (inline)
  const KpiCard = ({
    label,
    value,
    prev,
    prevVal,
    icon,
    bg,
    border,
    invert = false,
    prefix = "",
    suffix = "",
    isCount = false,
  }) => {
    const p = prev; // prev is already the computed percentage from pct()
    const fmt = (v) => (isCount ? (+v || 0).toLocaleString("en-EG") : fc(v));
    return (
      <div
        className="stat-card"
        style={{
          borderRightColor: border,
        }}
      >
        <div
          className="stat-icon"
          style={{
            background: bg,
          }}
        >
          {icon}
        </div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">
          {prefix}
          {fmt(value)}
          {suffix}
        </div>
        {prevVal !== undefined && (
          <div
            style={{
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <span
              style={{
                color: arrowColor(p, invert),
                fontWeight: 700,
              }}
            >
              {arrow(p)} {p !== null ? Math.abs(p) + "%" : ""}
            </span>
            <span
              style={{
                color: "var(--text3)",
              }}
            >
              مقارنة بـ {prefix}
              {fmt(prevVal)}
            </span>
          </div>
        )}
      </div>
    );
  };
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
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text3)",
            }}
          >
            الفترة:
          </span>
          {Object.entries(PERIOD_LABELS).map(([k, v]) => (
            <button
              key={k}
              className={`btn btn-sm ${period === k ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setPeriod(k)}
            >
              {v}
            </button>
          ))}
          {period === "custom" && (
            <React.Fragment>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1.5px solid var(--border)",
                }}
              />
              <span
                style={{
                  color: "var(--text3)",
                }}
              >
                →
              </span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1.5px solid var(--border)",
                }}
              />
            </React.Fragment>
          )}
        </div>
      </div>
      <div className="tabs">
        {[
          ["kpi", "📊 KPIs"],
          ["financial", "الملخص المالي"],
          ["products", "المنتجات"],
          ["clients", "العملاء"],
          ["expenses", "المصروفات"],
        ].map(([k, v]) => (
          <div key={k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
            {v}
          </div>
        ))}
      </div>
      {tab === "kpi" && (
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text3)",
              marginBottom: 12,
            }}
          >
            مقارنة بالفترة السابقة المماثلة ({PERIOD_LABELS[period]})
          </div>
          <div className="stat-grid">
            <KpiCard
              label={t("cards", "total_sales", lang)}
              value={totalSalesCur}
              prev={pct(totalSalesCur, totalSalesPrev)}
              prevVal={totalSalesPrev}
              icon="📈"
              bg="var(--green-bg)"
              border="var(--green)"
            />
            <KpiCard
              label={t("cards", "collected", lang)}
              value={collectedCur}
              prev={pct(collectedCur, collectedPrev)}
              prevVal={collectedPrev}
              icon="💵"
              bg="var(--green-bg)"
              border="var(--green)"
            />
            <KpiCard
              label={t("cards", "total_expenses", lang)}
              value={totalExpCur}
              prev={pct(totalExpCur, totalExpPrev)}
              prevVal={totalExpPrev}
              icon="💸"
              bg="var(--red-bg)"
              border="var(--red)"
              invert={true}
            />
            <KpiCard
              label={t("cards", "net_profit", lang)}
              value={netCur}
              prev={pct(netCur, netPrev)}
              prevVal={netPrev}
              icon="💹"
              bg={netCur >= 0 ? "var(--green-bg)" : "var(--red-bg)"}
              border={netCur >= 0 ? "var(--green)" : "var(--red)"}
            />
            <KpiCard
              label={t("common", "invoice_count", lang)}
              value={salesCur.length}
              prev={pct(salesCur.length, salesPrev.length)}
              prevVal={salesPrev.length}
              icon="📄"
              bg="var(--blue-bg)"
              border="var(--blue)"
              prefix=""
              isCount={true}
            />
            <KpiCard
              label={t("cards", "avg_invoice", lang)}
              value={salesCur.length ? totalSalesCur / salesCur.length : 0}
              prev={pct(
                salesCur.length ? totalSalesCur / salesCur.length : 0,
                salesPrev.length ? totalSalesPrev / salesPrev.length : 0
              )}
              prevVal={salesPrev.length ? totalSalesPrev / salesPrev.length : 0}
              icon="🧾"
              bg="var(--blue-bg)"
              border="var(--blue)"
            />
            <KpiCard
              label={t("cards", "receivables_alltime", lang)}
              value={totalReceivablesAllTime}
              prev={null}
              prevVal={undefined}
              icon="⏳"
              bg="var(--amber-bg)"
              border="var(--amber)"
            />
            <KpiCard
              label={t("cards", "salaries_expensed", lang)}
              value={totalSalariesExp}
              prev={null}
              prevVal={undefined}
              icon="🪪"
              bg="var(--blue-bg)"
              border="var(--blue)"
            />
          </div>
          <div
            className="card"
            style={{
              marginTop: 8,
            }}
          >
            <div className="card-header">
              <span className="card-title">قائمة الدخل — {PERIOD_LABELS[period]}</span>
            </div>
            <div className="card-body">
              {[
                {
                  label: t("cards", "sales_revenue", lang),
                  value: totalSalesCur,
                  color: "var(--green)",
                },
                {
                  label: t("cards", "cost_of_sales", lang),
                  value: -totalPurchCur,
                  color: "var(--red)",
                },
                {
                  label: t("cards", "gross_profit", lang),
                  value: grossCur,
                  color: grossCur >= 0 ? "var(--green)" : "var(--red)",
                  bold: true,
                },
                {
                  label: t("cards", "manufacturing_costs", lang),
                  value: -totalMfgCostsCur,
                  color: "var(--red)",
                },
                {
                  label: t("cards", "salaries_wages", lang),
                  value: -totalSalariesExp,
                  color: "var(--red)",
                },
                {
                  label: t("cards", "other_expenses", lang),
                  value: -(totalExpCur - totalSalariesExp),
                  color: "var(--red)",
                },
                {
                  label: t("cards", "net_profit", lang),
                  value: netCur,
                  color: netCur >= 0 ? "var(--green)" : "var(--red)",
                  bold: true,
                  large: true,
                },
              ].map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: i < 6 ? "1px solid var(--border)" : "none",
                    fontWeight: r.bold ? 700 : 400,
                  }}
                >
                  <span
                    style={{
                      color: "var(--text2)",
                      fontSize: r.large ? 15 : 13,
                    }}
                  >
                    {r.label}
                  </span>
                  <span
                    style={{
                      color: r.color,
                      fontSize: r.large ? 17 : 13,
                      fontWeight: r.bold ? 700 : 500,
                    }}
                  >
                    {fc(Math.abs(r.value))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab === "financial" && (
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text3)",
              marginBottom: 12,
            }}
          >
            المبيعات والمشتريات والمصروفات خاصّة بـ ({PERIOD_LABELS[period]}) أما المستحقات فهي رصيد كلي حالي
            بالكامل ولا تتأثر بالفلتر
          </div>
          <div className="stat-grid">
            {[
              {
                label: t("cards", "total_sales", lang),
                value: sum(periodSales, "total_amount"),
                color: "var(--green)",
                bg: "var(--green-bg)",
                icon: "📈",
              },
              {
                label: t("cards", "total_purchases", lang),
                value: sum(periodPurch, "total_amount"),
                color: "var(--blue)",
                bg: "var(--blue-bg)",
                icon: "🛒",
              },
              {
                label: t("cards", "total_expenses", lang),
                value: sum(periodExp, "amount"),
                color: "var(--red)",
                bg: "var(--red-bg)",
                icon: "💸",
              },
              {
                label: t("cards", "net_profit_total", lang),
                value:
                  sum(periodSales, "total_amount") -
                  sum(periodPurch, "total_amount") -
                  sum(periodExp, "amount") -
                  totalMfgCostsCur,
                color:
                  sum(periodSales, "total_amount") -
                    sum(periodPurch, "total_amount") -
                    sum(periodExp, "amount") -
                    totalMfgCostsCur >=
                  0
                    ? "var(--green)"
                    : "var(--red)",
                bg:
                  sum(periodSales, "total_amount") -
                    sum(periodPurch, "total_amount") -
                    sum(periodExp, "amount") -
                    totalMfgCostsCur >=
                  0
                    ? "var(--green-bg)"
                    : "var(--red-bg)",
                icon: "💹",
              },
              {
                label: t("cards", "receivables_alltime", lang),
                value: totalReceivablesAllTime,
                color: "var(--amber)",
                bg: "var(--amber-bg)",
                icon: "⏳",
              },
              {
                label: t("cards", "payables_alltime", lang),
                value: totalPayablesAllTime,
                color: "var(--red)",
                bg: "var(--red-bg)",
                icon: "🔴",
              },
            ].map((s, i) => (
              <div
                className="stat-card"
                key={i}
                style={{
                  borderRightColor: s.color,
                }}
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
                <div
                  className="stat-value"
                  style={{
                    color: s.color,
                  }}
                >
                  {fc(s.value)}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 16,
              textAlign: "left",
            }}
          >
            <button
              className="btn btn-secondary"
              onClick={() =>
                printDebtsSheet(clientDebtsList, supplierDebtsList, clientCreditsList, supplierCreditsList, org)
              }
            >
              🖨️ طباعة كشف المديونيات
            </button>
          </div>
        </div>
      )}
      {tab === "products" && (
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text3)",
              marginBottom: 12,
            }}
          >
            يعرض المنتجات المباعة في الفترة المختارة
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{t("common", "row_no", lang)}</th>
                  <th>{t("common", "product", lang)}</th>
                  <th>{t("common", "qty_sold", lang)}</th>
                  <th>{t("common", "revenue", lang)}</th>
                  <th>{t("common", "profit", lang)}</th>
                  <th>{t("common", "current_stock", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {productSales.slice(0, 20).map((p, i) => (
                  <tr key={p.id}>
                    <td
                      style={{
                        color: "var(--text3)",
                        fontSize: 12,
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {p.name}
                    </td>
                    <td>{p.soldQty}</td>
                    <td
                      style={{
                        color: "var(--green)",
                        fontWeight: 600,
                      }}
                    >
                      {fc(p.revenue)}
                    </td>
                    <td
                      style={{
                        color: p.profit >= 0 ? "var(--green)" : "var(--red)",
                        fontWeight: 600,
                      }}
                    >
                      {fc(p.profit)}
                    </td>
                    <td>
                      <span
                        className={`badge`}
                        style={{
                          background:
                            getStockQty(p.id) <= p.min_stock_level ? "var(--red-bg)" : "var(--green-bg)",
                          color: getStockQty(p.id) <= p.min_stock_level ? "var(--red)" : "var(--green)",
                        }}
                      >
                        {getStockQty(p.id)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {productSales.length === 0 && (
              <div className="empty-state">
                <div className="icon">👕</div>
                <p>لا توجد مبيعات في هذه الفترة</p>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "clients" && (
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text3)",
              marginBottom: 12,
            }}
          >
            يعرض العملاء الذين اشتروا في الفترة المختارة
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{t("common", "row_no", lang)}</th>
                  <th>{t("common", "client", lang)}</th>
                  <th>{t("common", "invoice_count", lang)}</th>
                  <th>{t("common", "total_purchases", lang)}</th>
                  <th>{t("common", "settled", lang)}</th>
                  <th>{t("common", "remaining", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {clientSales.slice(0, 20).map((c, i) => (
                  <tr key={c.id}>
                    <td
                      style={{
                        color: "var(--text3)",
                        fontSize: 12,
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {c.name}
                    </td>
                    <td>
                      <span className="tag">{c.count} فاتورة</span>
                    </td>
                    <td
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      {fc(c.total)}
                    </td>
                    <td
                      style={{
                        color: "var(--green)",
                      }}
                    >
                      {fc(c.total - c.balance)}
                    </td>
                    <td
                      style={{
                        color: c.balance > 0 ? "var(--red)" : "var(--text3)",
                        fontWeight: c.balance > 0 ? 600 : 400,
                      }}
                    >
                      {fc(c.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clientSales.length === 0 && (
              <div className="empty-state">
                <div className="icon">👥</div>
                <p>لا توجد مبيعات لعملاء في هذه الفترة</p>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "expenses" && (
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text3)",
              marginBottom: 12,
            }}
          >
            المصروفات في الفترة المختارة
          </div>
          <div
            className="stat-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
            }}
          >
            {Object.entries(expByCat)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt]) => (
                <div
                  className="stat-card"
                  key={cat}
                  style={{
                    borderRightColor: "var(--red)",
                  }}
                >
                  <div className="stat-label">{cat}</div>
                  <div
                    className="stat-value"
                    style={{
                      color: "var(--red)",
                    }}
                  >
                    {fc(amt)}
                  </div>
                  <div className="stat-sub">
                    {Math.round(totalExpCur > 0 ? (amt / totalExpCur) * 100 : 0)}% من الإجمالي
                  </div>
                </div>
              ))}
          </div>
          <div
            className="card"
            style={{
              marginTop: 16,
            }}
          >
            <table>
              <thead>
                <tr>
                  <th>{t("common", "date", lang)}</th>
                  <th>{t("common", "description", lang)}</th>
                  <th>{t("common", "category", lang)}</th>
                  <th>{t("common", "amount", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {expCur
                  .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
                  .map((e) => (
                    <tr key={e.id}>
                      <td
                        style={{
                          fontSize: 12.5,
                          color: "var(--text2)",
                        }}
                      >
                        {fd(e.expense_date)}
                      </td>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {e.title}
                      </td>
                      <td>
                        <span className="tag">{e.category}</span>
                      </td>
                      <td
                        style={{
                          color: "var(--red)",
                          fontWeight: 600,
                        }}
                      >
                        {fc(e.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {expCur.length === 0 && (
              <div className="empty-state">
                <div className="icon">💸</div>
                <p>لا توجد مصروفات في هذه الفترة</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
