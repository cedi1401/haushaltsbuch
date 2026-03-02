import React, { useState, useEffect } from "react";
import EditDialog from "./EditDialog.jsx";
import { PIE_PALETTE } from "../utils/hbPalette.js";

export default function CategoryCreateDialog({
  open,
  onClose,
  onSave,
  expenseCategories,
}) {
  const [mode, setMode] = useState("parent"); // "parent" | "sub"
  const [name, setName] = useState("");
  const [color, setColor] = useState(PIE_PALETTE[0]);
  const [parentId, setParentId] = useState("");

  // State zurücksetzen wenn Dialog öffnet
  useEffect(() => {
    if (open) {
      setMode("parent");
      setName("");
      setColor(PIE_PALETTE[0]);
      setParentId(expenseCategories?.[0]?.id || "");
    }
  }, [open, expenseCategories]);

  const canSave =
    name.trim().length > 0 && (mode === "parent" || parentId !== "");

  function handleSave() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      color: mode === "parent" ? color : undefined,
      parentId: mode === "sub" ? parentId : undefined,
      isSubcategory: mode === "sub",
    });
    onClose();
  }

  return (
    <EditDialog
      open={open}
      title="Neue Kategorie erstellen"
      onClose={onClose}
      onSave={handleSave}
      canSave={canSave}
      saveLabel="Speichern"
    >
      {/* Toggle: Ober- / Unterkategorie */}
      <div className="hb-field">
        <div className="hb-toggle-group">
          <button
            type="button"
            className={`hb-toggle-btn${mode === "parent" ? " hb-toggle-active" : ""}`}
            onClick={() => setMode("parent")}
          >
            Oberkategorie erstellen
          </button>
          <button
            type="button"
            className={`hb-toggle-btn${mode === "sub" ? " hb-toggle-active" : ""}`}
            onClick={() => setMode("sub")}
          >
            Unterkategorie erstellen
          </button>
        </div>
      </div>

      {/* Kategoriename */}
      <div className="hb-field" style={{ marginTop: 16 }}>
        <label className="hb-label">Kategoriename</label>
        <input
          className="hb-input hb-full"
          type="text"
          placeholder="Name eingeben..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Farbauswahl (nur bei Oberkategorie) */}
      {mode === "parent" && (
        <div className="hb-field" style={{ marginTop: 16 }}>
          <label className="hb-label">Farbe</label>
          <div className="hb-color-picker">
            {PIE_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`hb-color-dot${color === c ? " hb-color-dot-selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {/* Oberkategorie-Dropdown (nur bei Unterkategorie) */}
      {mode === "sub" && (
        <div className="hb-field" style={{ marginTop: 16 }}>
          <label className="hb-label">Oberkategorie wählen</label>
          <select
            className="hb-input hb-full"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            {(expenseCategories || []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </EditDialog>
  );
}
