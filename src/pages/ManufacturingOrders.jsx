import { useState } from "react";
import { ProductPicker } from "../components/ProductPicker";
import { PartyPicker } from "../components/PartyPicker";
import { generateId, fc, fd, today } from "../utils/format";
import { t } from "../i18n";

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
  contractor_supplier_id: "",
  notes: "",
});

export function ManufacturingOrders({ data, update, updateStock, toast, lang, setPage }) {
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
      contractor_supplier_id: form.contractor_supplier_id || null,
      contractor_invoice_id: null,
      notes: form.notes || "",
      created_at: today(),
    };

    // لو محدد جهة مصنّعة (مورد) والمصاريف أكبر من صفر، بننشئلها فاتورة مشتريات
    // فعلية بمصاريف التصنيع دي، عشان تتحسب كمديونية حقيقية عليك تقدر تسددها من
    // صفحة المدفوعات زي أي مورد عادي — بدل ما تكون رقم معلّق من غير أي تتبع.
    // المبلغ ده هيتحسب أوتوماتيك ضمن "إجمالي المشتريات" فيقلل صافي الربح من هناك،
    // فمش هنجمعه تاني كـ"مصاريف تصنيع" منفصلة (عشان منضاعفش نفس التكلفة مرتين).
    if (form.contractor_supplier_id && expensesTotal > 0 && validExpenses.length > 0) {
      const contractorInvoice = {
        id: generateId(),
        type: "purchase",
        invoice_number: `MFG-${newOrder.order_number}`,
        invoice_date: newOrder.order_date,
        due_date: newOrder.order_date,
        supplier_id: form.contractor_supplier_id,
        client_id: null,
        status: "confirmed",
        discount_amount: 0,
        tax_rate: 0,
        subtotal: expensesTotal,
        total_amount: expensesTotal,
        paid_amount: 0,
        notes: `مصاريف تصنيع لأمر رقم ${newOrder.order_number}`,
        items: validExpenses.map((e) => ({
          id: generateId(),
          product_id: null,
          product_name: e.title,
          product_sku: "",
          quantity: 1,
          unit_price: e.amount,
          discount_percent: 0,
          total_price: e.amount,
        })),
        created_at: new Date().toISOString(),
      };
      update("invoices", [...data.invoices, contractorInvoice]);
      newOrder.contractor_invoice_id = contractorInvoice.id;
    }

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
    const linkedInvoice = order.contractor_invoice_id
      ? data.invoices.find((i) => i.id === order.contractor_invoice_id)
      : null;
    if (linkedInvoice && linkedInvoice.paid_amount > 0) {
      toast("⚠️ فيه فاتورة مصاريف تصنيع مرتبطة بالأمر ده وعليها دفعات مسجلة — لازم تلغي الدفعات أو الفاتورة الأول من صفحة الفواتير");
      return;
    }
    if (
      !confirm(
        `هل تريد حذف أمر التصنيع "${order.order_number}"؟\nسيتم عكس أثره على المخزون (إعادة الخامة المستخدمة وخصم الكمية المنتجة)${
          linkedInvoice ? "، وحذف فاتورة مصاريف التصنيع المرتبطة به" : ""
        }، لكن سعر تكلفة المنتج لن يرجع تلقائيًا لقيمته السابقة قبل هذا الأمر.`
      )
    )
      return;
    update(
      "manufacturing_orders",
      orders.filter((o) => o.id !== order.id)
    );
    if (linkedInvoice) {
      update(
        "invoices",
        data.invoices.filter((i) => i.id !== linkedInvoice.id)
      );
    }
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
              <th>{t("common", "order_number", lang)}</th>
              <th>{t("common", "date", lang)}</th>
              <th>{t("common", "material_used", lang)}</th>
              <th>{t("common", "qty_used", lang)}</th>
              <th>{t("common", "output_product", lang)}</th>
              <th>{t("common", "qty_produced", lang)}</th>
              <th>{t("common", "piece_cost", lang)}</th>
              <th>{t("common", "total_cost", lang)}</th>
              <th>الجهة المصنّعة</th>
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
                    {o.contractor_supplier_id
                      ? data.suppliers.find((s) => s.id === o.contractor_supplier_id)?.name || "—"
                      : "—"}
                  </td>
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
                    lang={lang}
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
              <div
                className="form-group"
                style={{
                  marginBottom: 12,
                }}
              >
                <label>الجهة المصنّعة (اختياري)</label>
                <PartyPicker
                  parties={data.suppliers}
                  value={form.contractor_supplier_id}
                  onSelect={(id) =>
                    setForm({
                      ...form,
                      contractor_supplier_id: id,
                    })
                  }
                  placeholder="ابحث عن المصنع/المقاول اللي هيصنع الأمر ده..."
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text3)",
                    marginTop: 6,
                  }}
                >
                  لو حددت جهة، هيتحسبلها فاتورة مشتريات بإجمالي المصاريف تحت، وتقدر تسددها من صفحة المدفوعات
                  زي أي مورد عادي.
                </div>
              </div>
              <table
                className="inv-table"
                style={{
                  marginBottom: 10,
                }}
              >
                <thead>
                  <tr>
                    <th>{t("common", "item", lang)}</th>
                    <th>{t("common", "amount_egp", lang)}</th>
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
                    lang={lang}
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
                {t("actions", "cancel", lang)}
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
              {viewOrder.contractor_supplier_id &&
                (() => {
                  const contractor = data.suppliers.find((s) => s.id === viewOrder.contractor_supplier_id);
                  const contractorInvoice = data.invoices.find((i) => i.id === viewOrder.contractor_invoice_id);
                  const remaining = contractorInvoice
                    ? contractorInvoice.total_amount - contractorInvoice.paid_amount
                    : 0;
                  return (
                    <div
                      className="totals-row"
                      style={{
                        background: "var(--amber-bg)",
                        padding: "8px 10px",
                        borderRadius: 8,
                      }}
                    >
                      <span>الجهة المصنّعة</span>
                      <span>
                        {contractor?.name || "—"}
                        {contractorInvoice && remaining > 0.01 && (
                          <span
                            style={{
                              color: "var(--amber)",
                              fontWeight: 600,
                            }}
                          >
                            {" "}
                            — متبقي {fc(remaining)}
                          </span>
                        )}
                        {contractorInvoice && remaining <= 0.01 && (
                          <span
                            style={{
                              color: "var(--green)",
                              fontWeight: 600,
                            }}
                          >
                            {" "}
                            — مسدد بالكامل
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })()}
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
              {viewOrder.contractor_supplier_id && setPage && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setPage("payments");
                    setViewOrder(null);
                  }}
                >
                  💰 دفع للمورد
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewOrder(null)}>
                {t("actions", "close", lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
