import { useState } from "react";
import { generateId } from "../utils/format";

// مكوّن مشترك لإدارة الفئات ووحدات القياس (إضافة / تعديل / حذف)
// مستخدم من صفحة المنتجات وأيضًا من داخل ProductPicker (لإضافة منتج جديد بسرعة من أي شاشة)
export function CategoryUnitManager({ type, data, update, toast, onClose, onSelectCreated }) {
  const [editingItemId, setEditingItemId] = useState(null);
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");

  const list = type === "category" ? data.categories : data.units;

  const reset = () => {
    setEditingItemId(null);
    setName("");
    setAbbr("");
  };

  const startEdit = (item) => {
    setEditingItemId(item.id);
    setName(item.name);
    setAbbr(item.abbreviation || "");
  };

  const save = () => {
    if (!name.trim()) return;
    if (type === "category") {
      if (editingItemId) {
        update(
          "categories",
          data.categories.map((c) => (c.id === editingItemId ? { ...c, name: name.trim() } : c))
        );
        toast && toast("تم تعديل الفئة ✓");
      } else {
        const newCat = { id: generateId(), name: name.trim() };
        update("categories", [...data.categories, newCat]);
        onSelectCreated && onSelectCreated(newCat.id);
        toast && toast("تم إضافة الفئة ✓");
      }
    } else {
      if (editingItemId) {
        update(
          "units",
          data.units.map((u) =>
            u.id === editingItemId
              ? { ...u, name: name.trim(), abbreviation: abbr.trim() || name.trim() }
              : u
          )
        );
        toast && toast("تم تعديل وحدة القياس ✓");
      } else {
        const newUnit = { id: generateId(), name: name.trim(), abbreviation: abbr.trim() || name.trim() };
        update("units", [...data.units, newUnit]);
        onSelectCreated && onSelectCreated(newUnit.id);
        toast && toast("تم إضافة وحدة القياس ✓");
      }
    }
    reset();
  };

  const del = (item) => {
    if (type === "category") {
      const usedCount = data.products.filter((p) => p.category_id === item.id).length;
      if (usedCount > 0) {
        toast && toast(`لا يمكن حذف هذه الفئة لأنها مستخدمة في ${usedCount} منتج`);
        return;
      }
      if (!confirm(`حذف الفئة "${item.name}"؟`)) return;
      update(
        "categories",
        data.categories.filter((c) => c.id !== item.id)
      );
    } else {
      const usedCount = data.products.filter((p) => p.unit_id === item.id).length;
      if (usedCount > 0) {
        toast && toast(`لا يمكن حذف هذه الوحدة لأنها مستخدمة في ${usedCount} منتج`);
        return;
      }
      if (!confirm(`حذف وحدة القياس "${item.name}"؟`)) return;
      update(
        "units",
        data.units.filter((u) => u.id !== item.id)
      );
    }
    toast && toast("تم الحذف");
    if (editingItemId === item.id) reset();
  };

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 400,
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: 420,
        }}
      >
        <div className="modal-header">
          <span className="modal-title">{type === "category" ? "إدارة الفئات" : "إدارة وحدات القياس"}</span>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 14,
            }}
          >
            <input
              autoFocus
              placeholder={type === "category" ? "اسم الفئة" : "اسم الوحدة"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              style={{
                flex: 1,
              }}
            />
            {type === "unit" && (
              <input
                placeholder="الاختصار"
                value={abbr}
                onChange={(e) => setAbbr(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                style={{
                  width: 90,
                }}
              />
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              {editingItemId ? "تحديث" : "+ إضافة"}
            </button>
            {editingItemId && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
                إلغاء
              </button>
            )}
          </div>
          <div
            style={{
              maxHeight: 280,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            {list.length === 0 && (
              <div
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--text3)",
                  fontSize: 13,
                }}
              >
                {type === "category" ? "لا توجد فئات بعد" : "لا توجد وحدات قياس بعد"}
              </div>
            )}
            {list.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                  background: editingItemId === item.id ? "var(--surface2)" : "transparent",
                }}
              >
                {type === "unit" && item.abbreviation ? (
                  <span>
                    {item.name}{" "}
                    <span
                      style={{
                        color: "var(--text3)",
                        fontSize: 12.5,
                      }}
                    >
                      ({item.abbreviation})
                    </span>
                  </span>
                ) : (
                  <span>{item.name}</span>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                  }}
                >
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(item)}>
                    تعديل
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => del(item)}>
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            إنهاء
          </button>
        </div>
      </div>
    </div>
  );
}
