import React, { useEffect, useMemo, useRef, useState } from "react";

export default function CategoryPicker({
  label,
  value,
  categories,
  onChange,
  onDelete,
  isDeletable,
  className,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Kategorie-Namen extrahieren (unterstützt String-Array und Objekt-Array)
  const categoryNames = useMemo(() => {
    if (!Array.isArray(categories)) return [];
    return categories.map((c) => (typeof c === "string" ? c : c.name));
  }, [categories]);

  const displayCategories = useMemo(() => {
    const arr = [...categoryNames];
    if (value && !arr.includes(value)) arr.push(value);
    return arr;
  }, [categoryNames, value]);

  const canDelete = (cat) => (typeof isDeletable === "function" ? isDeletable(cat) : true);

  return (
    <div className={`hb-field ${className || ""}`} ref={wrapRef}>
      {label ? <div className="hb-label">{label}</div> : null}
      <div className="hb-dropdown">
        <button
          type="button"
          className="hb-input hb-input-btn"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={!categoryNames.includes(value) ? "hb-orphan" : ""}>{value}</span>
          <span className="hb-caret">▾</span>
        </button>

        {open ? (
          <div className="hb-dropdown-menu">
            {displayCategories.map((cat) => {
              const orphan = !categoryNames.includes(cat);
              const deletable = canDelete(cat);
              return (
                <div key={cat} className="hb-dropdown-row">
                  <button
                    type="button"
                    className="hb-dropdown-item"
                    onClick={() => {
                      onChange(cat);
                      setOpen(false);
                    }}
                  >
                    <span className="hb-row-left">
                      <span>{cat}</span>
                      {orphan ? <span className="hb-badge">gelöscht</span> : null}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`hb-x ${!orphan && deletable ? "" : "hb-x-disabled"}`}
                    disabled={orphan || !deletable}
                    title={orphan ? "Kategorie ist bereits gelöscht" : "Kategorie löschen"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!orphan && deletable) onDelete?.(cat);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
