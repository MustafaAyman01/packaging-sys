import React, { useState } from "react";
import { ProductPicker } from "../components/ProductPicker";
import { generateId, fc, fd, today } from "../utils/format";

export function Stock({ data, update, getStockQty, updateStock, toast }) {
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("movements");
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
    const isAddition = form.movement_type === "in" || form.movement_type === "return_in";
    const isDeduction = form.movement_type === "out" || form.movement_type === "return_out";
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
        quantity: qty,
        unit_cost: +form.unit_cost,
        reference_type: form.movement_type,
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
  return (
    <div>
      <div className="tabs">
        <div className={`tab${tab === "movements" ? " active" : ""}`} onClick={() => setTab("movements")}>
          حركات المخزون
        </div>
        <div className={`tab${tab === "levels" ? " active" : ""}`} onClick={() => setTab("levels")}>
          مستوى المخزون
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
                            map[m.reference_type === "waste" || m.reference_type === "surplus" ? m.reference_type : m.movement_type] ||
                            map.in;
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
                    <option value="adjustment">تسوية مخزون</option>
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
