import { useState, useEffect, useRef } from "react";
import { fc } from "../utils/format";

export function ProductPicker({ products, units, value, onSelect, placeholder, renderExtra }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const selected = products.find((p) => p.id === value);

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
            maxHeight: 260,
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
        </div>
      )}
    </div>
  );
}
