import { useState } from "react";
import { ProductPicker } from "../components/ProductPicker";
import { generateId, fc, fd, today } from "../utils/format";

const emptyExpenseRow = () => ({
  id: generateId(),
  title: "",
  amount: "",
});

const blankForm = () => ({
  order_number: "",
  order_date: today(),
  material_product_id: "",
  material_quantity_used: "",
  output_product_id: "",
  output_quantity: "",
  notes: "",
});

export function ManufacturingOrders({ data, update, updateStock, toast }) {
  const orders = data.manufacturing_orders || [];
  const [showModal, setShowModal] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [expenseItems, setExpenseItems] = useState([emptyExpenseRow()]);

  const newOrderNumber = () => {
    const yearPrefix = `MFG-${new Date().getFullYear()}-`;
    const maxNum = orders
      .filter((o) => o.order_number && o.order_number.startsWith(yearPrefix))
      .reduce((max, o) => {
        const n = parseInt(o.order_number.slice(yearPrefix.length), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 0);
    return `${yearPrefix}${String(maxNum + 1).padStart(3, "0")}`;
  };

  const openNew = () => {
    setForm({
      ...blankForm(),
      order_number: newOrderNumber(),
    });
    setExpenseItems([emptyExpenseRow()]);
    setShowModal(true);
  };

  const getStockQtyLocal = (pid) => {
    const sl = data.stock_levels.find((s) => s.product_id === pid);
    return sl ? sl.quantity : 0;
  };

  const materialProduct = data.products.find((p) => p.id === form.material_product_id);
  const outputProduct = data.products.find((p) => p.id === form.output_product_id);
  const materialUnit = materialProduct ? data.units.find((u) => u.id === materialProduct.unit_id) : null;
  const outputUnit = outputProduct ? data.units.find((u) => u.id === outputProduct.unit_id) : null;

  const materialQtyUsed = +form.material_quantity_used || 0;
  const materialUnitCost = materialProduct?.cost_price || 0;
  const materialCostTotal = materialQtyUsed * materialUnitCost;
  const expensesTotal = expenseItems.reduce((s, e) => s + (+e.amount || 0), 0);
  const totalCost = materialCostTotal + expensesTotal;
  const outputQty = +form.output_quantity || 0;
  const costPerUnit = outputQty > 0 ? totalCost / outputQty : 0;

  const addExpenseRow = () => setExpenseItems((prev) => [...prev, emptyExpenseRow()]);
  const removeExpenseRow = (id) => setExpenseItems((prev) => prev.filter((e) => e.id !== id));
  const updateExpenseRow = (id, field, val) =>
    setExpenseItems((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: val } : e)));

  const saveOrder = () => {
    if (!form.material_product_id) return toast("⚠️ اختر الخامة المستخدمة");
    if (!materialQtyUsed || materialQtyUsed <= 0) return toast("⚠️ أدخل كمية الخامة المستخدمة");
    if (!form.output_product_id) return toast("⚠️ اختر المنتج النهائي");
    if (!outputQty || outputQty <= 0) return toast("⚠️ أدخل عدد القطع المنتجة");
    if (form.material_product_id === form.output_product_id)
      return toast("⚠️ لا يمكن أن تكون الخامة ونفس المنتج النهائي");

    const currentMaterialQty = getStockQtyLocal(form.material_product_id);
    if (currentMaterialQty < materialQtyUsed) {
      if (
        !confirm(
          `⚠️ تحذير: مخزون الخامة "${materialProduct?.name || ""}" الحالي (${currentMaterialQty}) أقل من الكمية المطلوب خصمها (${materialQtyUsed}).\nهل تريد الاستمرار وتسجيل العجز؟`
        )
      )
        return;
    }

    const validExpenses = expenseItems
      .filter((e) => e.title.trim() && +e.amount > 0)
      .map((e) => ({
        id: e.id,
        title: e.title.trim(),
        amount: +e.amount,
      }));

    const newOrder = {
      id: generateId(),
      order_number: form.order_number || newOrderNumber(),
      order_date: form.order_date || today(),
      material_product_id: form.material_product_id,
      material_quantity_used: materialQtyUsed,
      material_unit_cost: materialUnitCost,
      material_cost_total: materialCostTotal,
      expense_items: validExpenses,
      expenses_total: expensesTotal,
      total_cost: totalCost,
      output_product_id: form.output_product_id,
      output_quantity: outputQty,
      cost_per_unit: costPerUnit,
      notes: form.notes || "",
      created_at: today(),
    };

    update("manufacturing_orders", [...orders, newOrder]);
    // خصم الخامة المستخدمة من المخزون
    updateStock(form.material_product_id, -materialQtyUsed);
    // إضافة الكمية المنتجة لمخزون المنتج النهائي
    updateStock(form.output_product_id, outputQty);
    // تحديث سعر تكلفة المنتج النهائي تلقائيًا بالتكلفة الجديدة المحسوبة
    update(
      "products",
      data.products.map((p) => (p.id === form.output_product_id ? { ...p, cost_price: costPerUnit } : p))
    );

    setShowModal(false);
    toast("تم حفظ أمر التصنيع، وتحديث المخزون وسعر تكلفة المنتج ✓");
  };

  const deleteOrder = (order) => {
    if (
      !confirm(
        `هل تريد حذف أمر التصنيع "${order.order_number}"؟\nسيتم عكس أثره على المخزون (إعادة الخامة المستخدمة وخصم الكمية المنتجة)، لكن سعر تكلفة المنتج لن يرجع تلقائيًا لقيمته السابقة قبل هذا الأمر.`
      )
    )
      return;
    update(
      "manufacturing_orders",
      orders.filter((o) => o.id !== order.id)
    );
    updateStock(order.material_product_id, order.material_quantity_used);
    updateStock(order.output_product_id, -order.output_quantity);
    toast("تم حذف أمر التصنيع ✓");
  };

  const sortedOrders = [...orders].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          textAlign: "left",
        }}
      >
        <button className="btn btn-primary" onClick={openNew}>
          + أمر تصنيع جديد
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>رقم الأمر</th>
              <th>التاريخ</th>
              <th>الخامة المستخدمة</th>
              <th>الكمية المستخدمة</th>
              <th>المنتج الناتج</th>
              <th>الكمية المنتجة</th>
              <th>تكلفة القطعة</th>
              <th>إجمالي التكلفة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sortedOrders.map((o) => {
              const material = data.products.find((p) => p.id === o.material_product_id);
              const output = data.products.find((p) => p.id === o.output_product_id);
              const mUnit = material ? data.units.find((u) => u.id === material.unit_id) : null;
              const oUnit = output ? data.units.find((u) => u.id === output.unit_id) : null;
              return (
                <tr
                  key={o.id}
                  style={{
                    cursor: "pointer",
                  }}
                  onClick={() => setViewOrder(o)}
                >
                  <td>
                    <code
                      style={{
                        fontSize: 12,
                      }}
                    >
                      {o.order_number}
                    </code>
                  </td>
                  <td>{fd(o.order_date)}</td>
                  <td>{material?.name || "—"}</td>
                  <td>
                    {(o.material_quantity_used || 0).toLocaleString()} {mUnit?.abbreviation}
                  </td>
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {output?.name || "—"}
                  </td>
                  <td>
                    {(o.output_quantity || 0).toLocaleString()} {oUnit?.abbreviation}
                  </td>
                  <td
                    style={{
                      fontWeight: 600,
                      color: "var(--accent)",
                    }}
                  >
                    {fc(o.cost_per_unit)}
                  </td>
                  <td>{fc(o.total_cost)}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteOrder(o);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedOrders.length === 0 && (
          <div className="empty-state">
            <div className="icon">🏭</div>
            <p>لا توجد أوامر تصنيع بعد</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">أمر تصنيع جديد</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>رقم الأمر</label>
                  <input
                    type="text"
                    value={form.order_number}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        order_number: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>التاريخ</label>
                  <input
                    type="date"
                    value={form.order_date}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        order_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="section-title">🧵 الخامة المستخدمة</div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الخامة *</label>
                  <ProductPicker
                    products={data.products}
                    units={data.units}
                    value={form.material_product_id}
                    onSelect={(pid) =>
                      setForm({
                        ...form,
                        material_product_id: pid,
                      })
                    }
                    renderExtra={(p) => "المخزون: " + getStockQtyLocal(p.id)}
                    data={data}
                    update={update}
                    toast={toast}
                  />
                </div>
                <div className="form-group">
                  <label>الكمية المستخدمة {materialUnit ? `(${materialUnit.abbreviation})` : ""} *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.material_quantity_used}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        material_quantity_used: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              {materialProduct && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text3)",
                    marginTop: -8,
                    marginBottom: 14,
                  }}
                >
                  تكلفة الوحدة الحالية: {fc(materialUnitCost)} — إجمالي تكلفة الخامة المستخدمة:{" "}
                  <strong>{fc(materialCostTotal)}</strong>
                </div>
              )}

              <div className="section-title">💸 بنود المصاريف</div>
              <table
                className="inv-table"
                style={{
                  marginBottom: 10,
                }}
              >
                <thead>
                  <tr>
                    <th>البند</th>
                    <th>المبلغ (ج.م)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {expenseItems.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <input
                          type="text"
                          placeholder="مثال: مغسلة، قص..."
                          value={e.title}
                          onChange={(ev) => updateExpenseRow(e.id, "title", ev.target.value)}
                        />
                      </td>
                      <td
                        style={{
                          width: "30%",
                        }}
                      >
                        <input
                          type="number"
                          min="0"
                          value={e.amount}
                          onChange={(ev) => updateExpenseRow(e.id, "amount", ev.target.value)}
                        />
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => removeExpenseRow(e.id)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="btn btn-secondary btn-sm"
                style={{
                  marginBottom: 16,
                }}
                onClick={addExpenseRow}
              >
                + إضافة بند مصاريف
              </button>

              <div className="section-title">👖 المنتج النهائي</div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>المنتج *</label>
                  <ProductPicker
                    products={data.products}
                    units={data.units}
                    value={form.output_product_id}
                    onSelect={(pid) =>
                      setForm({
                        ...form,
                        output_product_id: pid,
                      })
                    }
                    data={data}
                    update={update}
                    toast={toast}
                  />
                </div>
                <div className="form-group">
                  <label>عدد القطع المنتجة {outputUnit ? `(${outputUnit.abbreviation})` : ""} *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.output_quantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        output_quantity: e.target.value,
                      })
                    }
                  />
                </div>
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

              <div className="totals-box">
                <div className="totals-row">
                  <span>تكلفة الخامة المستخدمة</span>
                  <span>{fc(materialCostTotal)}</span>
                </div>
                <div className="totals-row">
                  <span>إجمالي بنود المصاريف</span>
                  <span>{fc(expensesTotal)}</span>
                </div>
                <div className="totals-row">
                  <span>إجمالي التكلفة</span>
                  <span
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    {fc(totalCost)}
                  </span>
                </div>
                <div className="totals-row">
                  <span>عدد القطع المنتجة</span>
                  <span>{outputQty.toLocaleString()}</span>
                </div>
                <div className="totals-row total">
                  <span>تكلفة القطعة الواحدة</span>
                  <span
                    style={{
                      color: "var(--accent)",
                      fontSize: 17,
                    }}
                  >
                    {fc(costPerUnit)}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={saveOrder}>
                حفظ أمر التصنيع
              </button>
            </div>
          </div>
        </div>
      )}

      {viewOrder && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">تفاصيل أمر التصنيع {viewOrder.order_number}</span>
              <button className="close-btn" onClick={() => setViewOrder(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="totals-row">
                <span>التاريخ</span>
                <span>{fd(viewOrder.order_date)}</span>
              </div>
              <div className="totals-row">
                <span>الخامة المستخدمة</span>
                <span>
                  {data.products.find((p) => p.id === viewOrder.material_product_id)?.name || "—"} (
                  {(viewOrder.material_quantity_used || 0).toLocaleString()})
                </span>
              </div>
              <div className="totals-row">
                <span>تكلفة الخامة</span>
                <span>{fc(viewOrder.material_cost_total)}</span>
              </div>
              <div className="section-title">بنود المصاريف</div>
              {(viewOrder.expense_items || []).length === 0 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text3)",
                    marginBottom: 8,
                  }}
                >
                  لا توجد بنود مصاريف
                </div>
              )}
              {(viewOrder.expense_items || []).map((e) => (
                <div className="totals-row" key={e.id}>
                  <span>{e.title}</span>
                  <span>{fc(e.amount)}</span>
                </div>
              ))}
              <div className="totals-row">
                <span>إجمالي المصاريف</span>
                <span>{fc(viewOrder.expenses_total)}</span>
              </div>
              <div className="totals-row">
                <span>إجمالي التكلفة</span>
                <span>{fc(viewOrder.total_cost)}</span>
              </div>
              <div className="totals-row">
                <span>المنتج الناتج</span>
                <span>
                  {data.products.find((p) => p.id === viewOrder.output_product_id)?.name || "—"} (
                  {(viewOrder.output_quantity || 0).toLocaleString()} قطعة)
                </span>
              </div>
              <div className="totals-row total">
                <span>تكلفة القطعة</span>
                <span
                  style={{
                    color: "var(--accent)",
                    fontSize: 17,
                  }}
                >
                  {fc(viewOrder.cost_per_unit)}
                </span>
              </div>
              {viewOrder.notes && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    color: "var(--text2)",
                  }}
                >
                  ملاحظات: {viewOrder.notes}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewOrder(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
