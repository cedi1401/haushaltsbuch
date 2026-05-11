import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

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
