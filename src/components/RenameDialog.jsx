import React, { useState } from "react";
import EditDialog from "./EditDialog.jsx";

/**
 * Inline rename dialog used to replace window.prompt.
 */
export default function RenameDialog({
  open,
  title = "Umbenennen",
  label = "Name",
  initialValue = "",
  saveLabel = "Speichern",
  onClose,
  onSave,
}) {
  const [value, setValue] = useState(initialValue);

  // Draft beim Öffnen zurücksetzen — abgeleitet aus dem open-Übergang statt via
  // Effekt (vermeidet set-state-in-effect und den zusätzlichen Render-Durchlauf).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValue(initialValue);
  }

  const trimmed = value.trim();
  const canSave = trimmed.length > 0;

  return (
    <EditDialog
      open={open}
      title={title}
      onClose={onClose}
      onSave={() => onSave?.(trimmed)}
      canSave={canSave}
      saveLabel={saveLabel}
    >
      <div className="hb-field">
        <div className="hb-label">{label}</div>
        <input
          className="hb-input hb-full"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </div>
    </EditDialog>
  );
}
