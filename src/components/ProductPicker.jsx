import { useState, useEffect, useRef } from "react";
import { fc, generateId, today } from "../utils/format";
import { CategoryUnitManager } from "./CategoryUnitManager";

// لو اتبعت data + update، بيظهر خيار "+ إضافة منتج جديد" جوه نتائج البحث
// عشان تقدر تسجّل منتج جديد (خامة أو منتج نهائي) من غير ما تسيب الشاشة اللي انت فيها
export function ProductPicker({ products, units, value, onSelect, placeholder, renderExtra, data, update, toast }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(null);
  const [manageType, setManageType] = useState(null); // "category" | "unit" | null
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const selected = products.find((p) => p.id === value);
  const canCreate = Boolean(data && update);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const results = (
    q
      ? products.filter(
          (p) => p.is_active && (p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
        )
      : products.filter((p) => p.is_active)
  ).slice(0, 50);

  const pick = (p) => {
    onSelect(p.id);
    setOpen(false);
    setQuery("");
    setHighlight(0);
  };

  const openCreate = () => {
    setCreateForm({
      name: query.trim(),
      category_id: data.categories[0]?.id || "",
      unit_id: data.units[0]?.id || "",
      cost_price: "",
      sale_price: "",
      min_stock_level: 0,
    });
    setShowCreate(true);
    setOpen(false);
  };

  const saveCreate = () => {
    if (!createForm.name.trim()) {
      toast && toast("⚠️ أدخل اسم المنتج");
      return;
    }
    const newProduct = {
      id: generateId(),
      sku: "AUTO-" + Date.now().toString(36).toUpperCase(),
      name: createForm.name.trim(),
      category_id: createForm.category_id || null,
      unit_id: createForm.unit_id || null,
      cost_price: +createForm.cost_price || 0,
      sale_price: +createForm.sale_price || 0,
      min_stock_level: +createForm.min_stock_level || 0,
      is_active: true,
      created_at: today(),
    };
    update("products", [...data.products, newProduct]);
    onSelect(newProduct.id);
    setShowCreate(false);
    toast && toast("تم إضافة المنتج ✓");
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setHighlight((h) => Math.min(h + 1, results.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlight((h) => Math.max(h - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (results[highlight]) pick(results[highlight]);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={open ? query : selected ? selected.name : ""}
        placeholder={placeholder || "ابحث بالاسم أو الكود..."}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={selected && !open ? { fontWeight: 500 } : {}}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            left: 0,
            background: "var(--surface)",
            border: "1.5px solid var(--border2)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-md)",
            maxHeight: 400,
            overflowY: "auto",
            zIndex: 300,
          }}
        >
          {results.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--text3)" }}>لا توجد نتائج</div>
          )}
          {results.map((p, i) => {
            const unit = units.find((u) => u.id === p.unit_id);
            return (
              <div
                key={p.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: "9px 14px",
                  cursor: "pointer",
                  fontSize: 13.5,
                  background: i === highlight ? "var(--accent-light)" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: i < results.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <span>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  {p.sku && (
                    <span style={{ color: "var(--text3)", fontSize: 11, marginRight: 8 }}> {p.sku}</span>
                  )}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text3)", whiteSpace: "nowrap" }}>
                  {renderExtra ? renderExtra(p) : [fc(p.sale_price), unit ? " / " + unit.abbreviation : ""]}
                </span>
              </div>
            );
          })}
          {canCreate && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                openCreate();
              }}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                fontSize: 13.5,
                fontWeight: 500,
                color: "var(--accent)",
                borderTop: results.length ? "1px solid var(--border)" : "none",
                background: "var(--surface2)",
              }}
            >
              + إضافة منتج جديد{query.trim() ? ` "${query.trim()}"` : ""}
            </div>
          )}
        </div>
      )}
      {showCreate && createForm && (
        <div className="modal-overlay" style={{ zIndex: 350 }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">منتج جديد</span>
              <button className="close-btn" onClick={() => setShowCreate(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>اسم المنتج *</label>
                <input
                  autoFocus
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الفئة</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={createForm.category_id}
                      onChange={(e) => setCreateForm({ ...createForm, category_id: e.target.value })}
                      style={{ flex: 1 }}
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
                      onClick={() => setManageType("category")}
                    >
                      ⚙️
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>وحدة القياس</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={createForm.unit_id}
                      onChange={(e) => setCreateForm({ ...createForm, unit_id: e.target.value })}
                      style={{ flex: 1 }}
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
                      onClick={() => setManageType("unit")}
                    >
                      ⚙️
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>سعر التكلفة (ج.م)</label>
                  <input
                    type="number"
                    value={createForm.cost_price}
                    onChange={(e) => setCreateForm({ ...createForm, cost_price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>سعر البيع (ج.م)</label>
                  <input
                    type="number"
                    value={createForm.sale_price}
                    onChange={(e) => setCreateForm({ ...createForm, sale_price: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>الحد الأدنى للمخزون</label>
                <input
                  type="number"
                  min="0"
                  value={createForm.min_stock_level}
                  onChange={(e) => setCreateForm({ ...createForm, min_stock_level: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={saveCreate}>
                حفظ وإضافة
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
            setCreateForm((f) => ({
              ...f,
              [manageType === "category" ? "category_id" : "unit_id"]: id,
            }))
          }
        />
      )}
    </div>
  );
}
