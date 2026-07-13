import React, { useState } from "react";
import { ProductPicker } from "../components/ProductPicker";
import { generateId, fc, fd, today } from "../utils/format";
import { printStocktakeSheet } from "../features/print/printStocktakeSheet";

export function Stock({ data, update, getStockQty, updateStock, toast, org }) {
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("movements");
  const [counts, setCounts] = useState({});
  const [stocktakeSearch, setStocktakeSearch] = useState("");
  const [form, setForm] = useState({
    product_id: "",
    movement_type: "in",
    quantity: "",
    unit_cost: "",
    notes: "",
  });
  const addMovement = () => {
    if (!form.product_id || !form.quantity) return;
    const qty = +form.quantity;
    const currentQty = getStockQty(form.product_id);
    const isAdjustment = form.movement_type === "adjustment_in" || form.movement_type === "adjustment_out";
    // التسوية بتتسجل في قاعدة البيانات بنوع in/out فعلي (عشان قيد قاعدة البيانات)
    // وبنميّزها عن الوارد/الصادر العادي عن طريق reference_type
    const actualMovementType = isAdjustment
      ? form.movement_type === "adjustment_in"
        ? "in"
        : "out"
      : form.movement_type;
    const isAddition = actualMovementType === "in" || actualMovementType === "return_in";
    const isDeduction = actualMovementType === "out" || actualMovementType === "return_out";
    if (isDeduction && currentQty < qty) {
      if (
        !confirm(
          `⚠️ تحذير: المخزون الحالي (${currentQty}) أقل من الكمية المطلوبة (${qty}).\nهل تريد الاستمرار وتسجيل العجز؟`
        )
      )
        return;
    }
    update("stock_movements", [
      ...data.stock_movements,
      {
        ...form,
        id: generateId(),
        movement_type: actualMovementType,
        quantity: qty,
        unit_cost: +form.unit_cost,
        reference_type: isAdjustment ? "adjustment" : actualMovementType,
        created_at: today(),
      },
    ]);
    updateStock(form.product_id, isAddition ? qty : -qty);
    setShowModal(false);
    setForm({
      product_id: "",
      movement_type: "in",
      quantity: "",
      unit_cost: "",
      notes: "",
    });
    toast("تم تسجيل حركة المخزون ✓");
  };
  const movements = [...data.stock_movements].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const stocktakeRows = data.products
    .filter((p) => p.is_active)
    .filter(
      (p) =>
        !stocktakeSearch ||
        p.name.toLowerCase().includes(stocktakeSearch.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(stocktakeSearch.toLowerCase())
    )
    .map((p) => {
      const unit = data.units.find((u) => u.id === p.unit_id);
      const system = getStockQty(p.id);
      const countedRaw = counts[p.id];
      const counted = countedRaw === undefined || countedRaw === "" ? "" : countedRaw;
      const diff = counted === "" ? 0 : +counted - system;
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: unit?.abbreviation || "",
        system,
        counted,
        diff,
        diffValue: diff * (p.cost_price || 0),
        cost_price: p.cost_price || 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const stocktakeDiffCount = stocktakeRows.filter((r) => r.counted !== "" && r.diff !== 0).length;
  const applyStocktake = () => {
    const toApply = stocktakeRows.filter((r) => r.counted !== "" && r.diff !== 0);
    if (toApply.length === 0) {
      toast("مفيش فروقات لتطبيقها");
      return;
    }
    if (
      !confirm(
        `هيتم تسجيل تسوية مخزون لـ ${toApply.length} صنف وتحديث الأرصدة فورًا. متأكد إنك عايز تطبق نتيجة الجرد؟`
      )
    )
      return;
    const sessionLabel = `جرد ${fd(today())}`;
    const newMovements = toApply.map((r) => ({
      id: generateId(),
      product_id: r.id,
      movement_type: r.diff > 0 ? "in" : "out",
      quantity: Math.abs(r.diff),
      unit_cost: r.cost_price,
      reference_type: "adjustment",
      notes: `${sessionLabel} — الرصيد الدفتري ${r.system} والفعلي ${r.counted}`,
      created_at: today(),
    }));
    update("stock_movements", [...data.stock_movements, ...newMovements]);
    toApply.forEach((r) => updateStock(r.id, r.diff));
    toast(`تم تطبيق تسوية الجرد على ${toApply.length} صنف ✓`);
    setCounts({});
  };
  return (
    <div>
      <div className="tabs">
        <div className={`tab${tab === "movements" ? " active" : ""}`} onClick={() => setTab("movements")}>
          حركات المخزون
        </div>
        <div className={`tab${tab === "levels" ? " active" : ""}`} onClick={() => setTab("levels")}>
          مستوى المخزون
        </div>
        <div className={`tab${tab === "stocktake" ? " active" : ""}`} onClick={() => setTab("stocktake")}>
          📋 جرد المخزون
        </div>
      </div>
      {tab === "levels" && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الكود</th>
                <th>الكمية الحالية</th>
                <th>الحد الأدنى</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.products
                .filter((p) => p.is_active)
                .map((p) => {
                  const qty = getStockQty(p.id);
                  const low = qty < p.min_stock_level;
                  const unit = data.units.find((u) => u.id === p.unit_id);
                  return (
                    <tr key={p.id}>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {p.name}
                      </td>
                      <td>
                        <code
                          style={{
                            fontSize: 12,
                          }}
                        >
                          {p.sku}
                        </code>
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: low ? "var(--red)" : "var(--green)",
                          fontSize: 15,
                        }}
                      >
                        {qty.toLocaleString()} {unit?.abbreviation}
                      </td>
                      <td>
                        {p.min_stock_level.toLocaleString()} {unit?.abbreviation}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: low ? "var(--red-bg)" : "var(--green-bg)",
                            color: low ? "var(--red)" : "var(--green)",
                          }}
                        >
                          {low ? "⚠️ مخزون منخفض" : "✓ طبيعي"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      {tab === "stocktake" && (
        <React.Fragment>
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
                justifyContent: "space-between",
              }}
            >
              <div
                className="form-group"
                style={{
                  minWidth: 220,
                  marginBottom: 0,
                }}
              >
                <label>بحث بالاسم أو الكود</label>
                <input
                  value={stocktakeSearch}
                  onChange={(e) => setStocktakeSearch(e.target.value)}
                  placeholder="اكتب اسم المنتج أو الكود..."
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    printStocktakeSheet(stocktakeRows, org, {
                      date: today(),
                      sessionLabel: fd(today()),
                    })
                  }
                >
                  🖨️ طباعة محضر الجرد
                </button>
                <button className="btn btn-primary" onClick={applyStocktake} disabled={stocktakeDiffCount === 0}>
                  ✅ تطبيق التسويات ({stocktakeDiffCount})
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكود</th>
                  <th>الرصيد الدفتري</th>
                  <th>الجرد الفعلي</th>
                  <th>الفرق</th>
                  <th>قيمة الفرق</th>
                </tr>
              </thead>
              <tbody>
                {stocktakeRows.map((r) => (
                  <tr key={r.id}>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {r.name}
                    </td>
                    <td>
                      <code
                        style={{
                          fontSize: 12,
                        }}
                      >
                        {r.sku}
                      </code>
                    </td>
                    <td>
                      {r.system.toLocaleString()} {r.unit}
                    </td>
                    <td>
                      <input
                        type="number"
                        value={counts[r.id] ?? ""}
                        onChange={(e) =>
                          setCounts({
                            ...counts,
                            [r.id]: e.target.value,
                          })
                        }
                        placeholder="—"
                        style={{
                          width: 100,
                        }}
                      />
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: r.counted === "" ? "var(--text3)" : r.diff > 0 ? "var(--green)" : r.diff < 0 ? "var(--red)" : "var(--text2)",
                      }}
                    >
                      {r.counted === "" ? "—" : (r.diff > 0 ? "+" : "") + r.diff.toLocaleString()}
                    </td>
                    <td
                      style={{
                        color: r.counted === "" || r.diff === 0 ? "var(--text3)" : r.diff > 0 ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {r.counted === "" || r.diff === 0 ? "—" : fc(r.diffValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stocktakeRows.length === 0 && (
              <div className="empty-state">
                <div className="icon">📋</div>
                <p>لا توجد أصناف</p>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
      {tab === "movements" && (
        <React.Fragment>
          <div
            style={{
              marginBottom: 16,
              textAlign: "left",
            }}
          >
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              + تسجيل حركة مخزون
            </button>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المنتج</th>
                  <th>النوع</th>
                  <th>الكمية</th>
                  <th>تكلفة الوحدة</th>
                  <th>الإجمالي</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const prod = data.products.find((p) => p.id === m.product_id);
                  return (
                    <tr key={m.id}>
                      <td>{fd(m.created_at)}</td>
                      <td>{prod?.name || "—"}</td>
                      <td>
                        {(() => {
                          const map = {
                            in: {
                              bg: "var(--green-bg)",
                              color: "var(--green)",
                              label: "⬇ وارد",
                            },
                            out: {
                              bg: "var(--red-bg)",
                              color: "var(--red)",
                              label: "⬆ صادر",
                            },
                            return_in: {
                              bg: "var(--blue-bg)",
                              color: "var(--blue)",
                              label: "↩️ مرتجع مبيعات",
                            },
                            return_out: {
                              bg: "var(--amber-bg)",
                              color: "var(--amber)",
                              label: "↪️ مرتجع مشتريات",
                            },
                            adjustment: {
                              bg: "var(--surface3)",
                              color: "var(--text2)",
                              label: "⚖️ تسوية",
                            },
                            waste: {
                              bg: "var(--red-bg)",
                              color: "var(--red)",
                              label: "🗑️ هالك",
                            },
                            surplus: {
                              bg: "var(--green-bg)",
                              color: "var(--green)",
                              label: "➕ زيادة",
                            },
                          };
                          // هالك/زيادة بتتسجل بنوع in/out أصلي (عشان قيد قاعدة البيانات)
                          // لكن بنميّزها هنا عن طريق reference_type
                          const c =
                            map[
                              m.reference_type === "waste" || m.reference_type === "surplus" || m.reference_type === "adjustment"
                                ? m.reference_type
                                : m.movement_type
                            ] || map.in;
                          return (
                            <span
                              className="badge"
                              style={{
                                background: c.bg,
                                color: c.color,
                              }}
                            >
                              {c.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {m.quantity.toLocaleString()}
                      </td>
                      <td>{m.unit_cost ? fc(m.unit_cost) : "—"}</td>
                      <td>{m.unit_cost ? fc(m.quantity * m.unit_cost) : "—"}</td>
                      <td
                        style={{
                          color: "var(--text2)",
                          fontSize: 13,
                        }}
                      >
                        {m.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {movements.length === 0 && (
              <div className="empty-state">
                <div className="icon">🔄</div>
                <p>لا توجد حركات</p>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">تسجيل حركة مخزون</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>المنتج *</label>
                <ProductPicker
                  products={data.products}
                  units={data.units}
                  value={form.product_id}
                  onSelect={(pid) => {
                    const p = data.products.find((x) => x.id === pid);
                    setForm({
                      ...form,
                      product_id: pid,
                      unit_cost: p?.cost_price || "",
                    });
                  }}
                  renderExtra={(p) => "\u0627\u0644\u0645\u062E\u0632\u0648\u0646: " + getStockQty(p.id)}
                  data={data}
                  update={update}
                  toast={toast}
                />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>نوع الحركة</label>
                  <select
                    value={form.movement_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        movement_type: e.target.value,
                      })
                    }
                  >
                    <option value="in">⬇ وارد (إضافة)</option>
                    <option value="out">⬆ صادر (خصم)</option>
                    <option value="return_in">↩️ مرتجع مبيعات (إضافة للمخزون)</option>
                    <option value="return_out">↪️ مرتجع مشتريات (خصم من المخزون)</option>
                    <option value="adjustment_in">⚖️ تسوية (زيادة رصيد)</option>
                    <option value="adjustment_out">⚖️ تسوية (نقص رصيد)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>الكمية *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        quantity: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>تكلفة الوحدة (ج.م)</label>
                <input
                  type="number"
                  value={form.unit_cost}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      unit_cost: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={addMovement}>
                تسجيل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
