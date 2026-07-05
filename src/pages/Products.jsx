import { useState } from "react";
import { generateId, today } from "../utils/format";
import { fc } from "../utils/format";
import { CategoryUnitManager } from "../components/CategoryUnitManager";

export function Products({ data, update, updateStock, getStockQty, toast }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [manageType, setManageType] = useState(null); // "category" | "unit" | null
  const [adjForm, setAdjForm] = useState({
    reason: "waste",
    quantity: "",
    unit_cost: "",
    notes: "",
  });
  // آخر سعر تكلفة اتسجل فعليًا لهذا المنتج من فواتير الشراء (مش سعر التكلفة الثابت في بطاقة المنتج)
  const getLastPurchaseCost = (productId) => {
    const rows = data.invoices
      .filter((i) => i.type === "purchase" && i.status !== "cancelled")
      .flatMap((i) =>
        (i.items || [])
          .filter((it) => it.product_id === productId)
          .map((it) => ({ unit_price: it.unit_price, sortKey: `${i.invoice_date || ""}_${i.created_at || ""}` }))
      )
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return rows[0]?.unit_price ?? null;
  };
  const filtered = data.products.filter(
    (p) =>
      (!search || p.name.includes(search) || p.sku.includes(search)) &&
      (!catFilter || p.category_id === catFilter)
  );
  const openNew = () => {
    setEditing(null);
    setForm({
      sku: `PKG-${String(data.products.length + 1).padStart(3, "0")}`,
      name: "",
      category_id: data.categories[0]?.id,
      unit_id: data.units[0]?.id,
      cost_price: "",
      sale_price: "",
      min_stock_level: 50,
      is_active: true,
    });
    setShowModal(true);
  };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      ...p,
    });
    const lastCost = getLastPurchaseCost(p.id);
    setAdjForm({
      reason: "waste",
      quantity: "",
      unit_cost: lastCost ?? p.cost_price ?? "",
      notes: "",
    });
    setShowModal(true);
  };
  const save = () => {
    if (!form.name || !form.sale_price) return;
    if (editing)
      update(
        "products",
        data.products.map((p) =>
          p.id === editing.id
            ? {
                ...form,
                id: editing.id,
              }
            : p
        )
      );
    else
      update("products", [
        ...data.products,
        {
          ...form,
          id: generateId(),
          created_at: today(),
        },
      ]);
    setShowModal(false);
    toast(editing ? "تم تعديل المنتج ✓" : "تم إضافة المنتج ✓");
  };
  const del = (id) => {
    if (confirm("حذف المنتج؟")) {
      update(
        "products",
        data.products.filter((p) => p.id !== id)
      );
      toast("تم الحذف");
    }
  };
  const submitAdjustment = async () => {
    if (!editing || !adjForm.quantity || +adjForm.quantity <= 0) return;
    const qty = +adjForm.quantity;
    const cost = +adjForm.unit_cost || 0;
    const isWaste = adjForm.reason === "waste";
    const currentQty = getStockQty(editing.id);
    if (isWaste && currentQty < qty) {
      if (
        !confirm(
          `⚠️ الكمية المطلوب تسجيلها كهالك (${qty}) أكبر من المخزون الحالي (${currentQty}).\nهل تريد الاستمرار؟`
        )
      )
        return;
    }
    const movement = {
      id: generateId(),
      product_id: editing.id,
      movement_type: isWaste ? "out" : "in",
      quantity: qty,
      unit_cost: cost,
      reference_type: isWaste ? "waste" : "surplus",
      notes: adjForm.notes || (isWaste ? "هالك" : "زيادة جرد"),
      created_at: today(),
    };
    const errors = await update("stock_movements", [...data.stock_movements, movement]);
    if (errors && errors.length) {
      toast(`⚠️ فشل تسجيل التسوية ولم يتم تعديل المخزون: ${errors[0].message}`);
      return;
    }
    updateStock(editing.id, isWaste ? -qty : qty);
    setAdjForm({
      reason: "waste",
      quantity: "",
      unit_cost: cost,
      notes: "",
    });
    toast(isWaste ? "تم تسجيل الهالك وخصمه من المخزون ✓" : "تم تسجيل الزيادة وإضافتها للمخزون ✓");
  };
  const openManage = (type) => {
    setManageType(type);
  };
  return (
    <div>
      <div
        className="filter-row"
        style={{
          marginBottom: 16,
        }}
      >
        <div
          className="search-bar"
          style={{
            flex: 1,
          }}
        >
          <span className="search-icon">🔍</span>
          <input
            placeholder="بحث بالاسم أو الكود..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          style={{
            width: 160,
          }}
        >
          <option value="">كل الفئات</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={openNew}>
          + منتج جديد
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>الكود</th>
              <th>الاسم</th>
              <th>الفئة</th>
              <th>الوحدة</th>
              <th>سعر التكلفة</th>
              <th>سعر البيع</th>
              <th>المخزون</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const qty = getStockQty(p.id);
              const low = qty < p.min_stock_level;
              return (
                <tr key={p.id}>
                  <td>
                    <code
                      style={{
                        fontSize: 12,
                        background: "var(--surface2)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {p.sku}
                    </code>
                  </td>
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {p.name}
                  </td>
                  <td>{data.categories.find((c) => c.id === p.category_id)?.name || "—"}</td>
                  <td>{data.units.find((u) => u.id === p.unit_id)?.name || "—"}</td>
                  <td>{fc(p.cost_price)}</td>
                  <td
                    style={{
                      fontWeight: 500,
                    }}
                  >
                    {fc(p.sale_price)}
                  </td>
                  <td
                    style={{
                      fontWeight: 500,
                      color: low ? "var(--red)" : "var(--green)",
                    }}
                  >
                    {qty.toLocaleString()}
                    {low ? " ⚠️" : ""}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: p.is_active ? "var(--green-bg)" : "var(--surface3)",
                        color: p.is_active ? "var(--green)" : "var(--text3)",
                      }}
                    >
                      {p.is_active ? "نشط" : "موقوف"}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>
                        تعديل
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="icon">📦</div>
            <p>لا توجد منتجات</p>
          </div>
        )}
      </div>
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? "تعديل منتج" : "منتج جديد"}</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>كود المنتج (SKU)</label>
                  <input
                    value={form.sku || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sku: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>اسم المنتج *</label>
                  <input
                    value={form.name || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الفئة</label>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    <select
                      value={form.category_id || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          category_id: e.target.value,
                        })
                      }
                      style={{
                        flex: 1,
                      }}
                    >
                      {data.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      title="إضافة/تعديل/حذف الفئات"
                      onClick={() => openManage("category")}
                    >
                      ⚙️
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>وحدة القياس</label>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                    }}
                  >
                    <select
                      value={form.unit_id || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          unit_id: e.target.value,
                        })
                      }
                      style={{
                        flex: 1,
                      }}
                    >
                      {data.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      title="إضافة/تعديل/حذف وحدات القياس"
                      onClick={() => openManage("unit")}
                    >
                      ⚙️
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label>سعر التكلفة</label>
                  <input
                    type="number"
                    value={form.cost_price || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cost_price: +e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>سعر البيع *</label>
                  <input
                    type="number"
                    value={form.sale_price || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sale_price: +e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>حد أدنى للمخزون</label>
                  <input
                    type="number"
                    value={form.min_stock_level || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        min_stock_level: +e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>الحالة</label>
                <select
                  value={form.is_active ? "1" : "0"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      is_active: e.target.value === "1",
                    })
                  }
                >
                  <option value="1">نشط</option>
                  <option value="0">موقوف</option>
                </select>
              </div>
              {editing && (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 16,
                    borderTop: "1px dashed var(--border2)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <label
                      style={{
                        margin: 0,
                        fontWeight: 700,
                      }}
                    >
                      ⚖️ تسوية مخزون سريعة (هالك / زيادة)
                    </label>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: "var(--text3)",
                      }}
                    >
                      الرصيد الحالي: {getStockQty(editing.id).toLocaleString()}
                    </span>
                  </div>
                  <div className="form-row form-row-3">
                    <div className="form-group">
                      <label>نوع التسوية</label>
                      <select
                        value={adjForm.reason}
                        onChange={(e) =>
                          setAdjForm({
                            ...adjForm,
                            reason: e.target.value,
                          })
                        }
                      >
                        <option value="waste">🗑️ هالك (خصم من المخزون)</option>
                        <option value="surplus">➕ زيادة (إضافة للمخزون)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>الكمية</label>
                      <input
                        type="number"
                        min="0"
                        value={adjForm.quantity}
                        onChange={(e) =>
                          setAdjForm({
                            ...adjForm,
                            quantity: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>تكلفة الوحدة (ج.م)</label>
                      <input
                        type="number"
                        value={adjForm.unit_cost}
                        onChange={(e) =>
                          setAdjForm({
                            ...adjForm,
                            unit_cost: e.target.value,
                          })
                        }
                        title="اتحسبت تلقائيًا من آخر فاتورة شراء لهذا المنتج، وتقدر تعدلها"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>ملاحظات (اختياري)</label>
                    <input
                      value={adjForm.notes}
                      placeholder={adjForm.reason === "waste" ? "مثال: تلف أثناء التصنيع" : "مثال: فرق جرد"}
                      onChange={(e) =>
                        setAdjForm({
                          ...adjForm,
                          notes: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div
                    style={{
                      textAlign: "left",
                    }}
                  >
                    <button type="button" className="btn btn-secondary btn-sm" onClick={submitAdjustment}>
                      تسجيل التسوية
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={save}>
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
      {manageType && (
        <CategoryUnitManager
          type={manageType}
          data={data}
          update={update}
          toast={toast}
          onClose={() => setManageType(null)}
          onSelectCreated={(id) =>
            setForm((f) => ({
              ...f,
              [manageType === "category" ? "category_id" : "unit_id"]: id,
            }))
          }
        />
      )}
    </div>
  );
}
