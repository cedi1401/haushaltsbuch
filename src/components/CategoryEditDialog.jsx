import React, { useState, useEffect } from "react";
import EditDialog from "./EditDialog.jsx";
import { CUSTOM_CATEGORY_PALETTE } from "../utils/hbPalette.js";
import { useConfirm } from "./ConfirmDialog.jsx";

export default function CategoryEditDialog({
  open,
  onClose,
  onSave,
  onDelete,
  category,
  isSubcategory,
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CUSTOM_CATEGORY_PALETTE[0]);
  const { confirm } = useConfirm();

  // Felder vorausfüllen wenn Kategorie übergeben wird
  useEffect(() => {
    if (open && category) {
      setName(category.name || "");
      setColor(category.color || CUSTOM_CATEGORY_PALETTE[0]);
    }
  }, [open, category]);

  const canSave = name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      color: isSubcategory ? undefined : color,
    });
    onClose();
  }

  async function handleDelete() {
    const confirmed = await confirm({
      title: "Kategorie löschen",
      message: `Kategorie „${category?.name}“ wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (confirmed) {
      onDelete();
      onClose();
    }
  }

  return (
    <EditDialog
      open={open}
      title="Kategorie bearbeiten"
      onClose={onClose}
      onSave={handleSave}
      canSave={canSave}
      saveLabel="Speichern"
    >
      {/* Kategoriename */}
      <div className="hb-field">
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

      {/* Farbauswahl: nur bei eigenen Oberkategorien (nicht bei Default-Kategorien) */}
      {!isSubcategory && !category?.isDefault && (
        <div className="hb-field" style={{ marginTop: 16 }}>
          <label className="hb-label">Farbe</label>
          <div className="hb-color-picker">
            {CUSTOM_CATEGORY_PALETTE.map((c) => (
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

      {/* Lösch-Button */}
      {category && !category.isDefault && (
        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            className="hb-btn hb-full"
            style={{ background: "var(--red-soft)", color: "var(--red)", border: "1px solid var(--red)", boxShadow: "none" }}
            onClick={handleDelete}
          >
            Kategorie löschen
          </button>
        </div>
      )}
    </EditDialog>
  );
}
