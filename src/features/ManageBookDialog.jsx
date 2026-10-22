import React, { useState } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { Button } from "../components/ui.jsx";

/**
 * „Buch verwalten …“ aus dem Buch-Dropdown: Umbenennen und Löschen des
 * aktiven Buchs. Löschen fragt über den bestehenden ConfirmDialog nach
 * (`onDelete` liefert true, wenn wirklich gelöscht wurde).
 */
export default function ManageBookDialog({ open, bookName, canDelete, onClose, onRename, onDelete }) {
  const [name, setName] = useState(bookName);

  // Entwurf beim Öffnen zurücksetzen (wie RenameDialog, ohne Effekt).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setName(bookName);
  }

  const trimmed = name.trim();

  function handleSave() {
    if (trimmed !== bookName) onRename(trimmed);
    onClose();
  }

  async function handleDelete() {
    const deleted = await onDelete();
    if (deleted) onClose();
  }

  return (
    <EditDialog
      open={open}
      title="Buch verwalten"
      onClose={onClose}
      onSave={handleSave}
      canSave={trimmed.length > 0 && trimmed !== bookName}
      footerStart={
        <Button
          variant="outline"
          className="hb-btn-outline--danger"
          onClick={handleDelete}
          disabled={!canDelete}
        >
          Buch löschen
        </Button>
      }
    >
      <div className="hb-field">
        <div className="hb-label">Name</div>
        <input
          className="hb-input hb-full"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        {!canDelete && (
          <div className="hb-field-hint">Das letzte Buch kann nicht gelöscht werden.</div>
        )}
      </div>
    </EditDialog>
  );
}
