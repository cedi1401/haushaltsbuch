import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

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
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  // Position des Dropdown-Menüs berechnen (fixed, damit es nicht von overflow abgeschnitten wird)
  const updateMenuPosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 280; // max-height des Menüs

    if (spaceBelow >= menuHeight || spaceBelow >= rect.top) {
      // Dropdown nach unten
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    } else {
      // Dropdown nach oben
      setMenuStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const onDown = (e) => {
      if (!wrapRef.current) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);

    // Position bei Scroll/Resize aktualisieren
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

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
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={!categoryNames.includes(value) ? "hb-orphan" : ""}>{value}</span>
          <span className="hb-caret">▾</span>
        </button>

        {open ? (
          <div className="hb-dropdown-menu" ref={menuRef} style={menuStyle}>
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
