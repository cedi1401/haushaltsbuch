import React, { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui.jsx";
import OverflowMenu from "../../components/OverflowMenu.jsx";
import { useToast } from "../../components/toastContext.js";
import { useConfirm } from "../../components/ConfirmDialog.jsx";
import { IconPlus, IconWallet, IconEdit, IconCheck, IconClose } from "../../components/icons.jsx";
import { DEPOT_NAME_MAX } from "../../utils/investmentModel.js";
import {
  addDepot,
  countDepotTransactions,
  removeDepot,
  updateDepot,
} from "../../utils/investmentActions.js";

// Struktur bewusst 1:1 wie PotsManager: Inline-Umbenennen, Kebab-Menü je Zeile,
// „Neues Depot" als Fuß. Ein zweites Bedienmuster für dieselbe Aufgabe wäre der
// einzige Unterschied zwischen den beiden Dialogen — und genau der wäre falsch.

const NOTE_MAX = 200;
// Ab hier wird der Zeichenzähler eingeblendet — vorher ist die Grenze kein Thema.
const COUNTER_THRESHOLD = 40;

function usageLabel(count) {
  if (count === 0) return "keine Transaktionen";
  if (count === 1) return "1 Transaktion";
  return `${count} Transaktionen`;
}

/**
 * Inhalt des Dialogs „Depots verwalten".
 *
 * @param {{investments: object, onChange: (next: object) => void}} props
 */
export default function DepotsManager({ investments, onChange }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");

  // Immer nur eine Zeile gleichzeitig im Bearbeiten-Modus, daher genügt ein Ref.
  const inputRef = useRef(null);
  const editBtnRefs = useRef({});

  const depots = investments?.depots || [];

  useEffect(() => {
    if (!editingId && !isAdding) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingId, isAdding]);

  function validateName(name, excludeId) {
    const trimmed = name.trim();
    if (!trimmed) return "Name darf nicht leer sein.";
    if (trimmed.length > DEPOT_NAME_MAX) return `Name ist zu lang (max. ${DEPOT_NAME_MAX} Zeichen).`;
    const normalized = trimmed.toLocaleLowerCase("de");
    const duplicate = depots.some(
      (d) => d.id !== excludeId && d.name.trim().toLocaleLowerCase("de") === normalized
    );
    if (duplicate) return "Name bereits vergeben.";
    return null;
  }

  function focusEditButton(depotId) {
    // Erst nach dem Re-Render existiert der Stift-Button wieder.
    requestAnimationFrame(() => editBtnRefs.current[depotId]?.focus());
  }

  function startEdit(depot) {
    setIsAdding(false);
    setNewName("");
    setNewNote("");
    setEditingId(depot.id);
    setEditName(depot.name);
    setEditNote(depot.note || "");
  }

  function cancelEdit() {
    const depotId = editingId;
    setEditingId(null);
    setEditName("");
    setEditNote("");
    if (depotId) focusEditButton(depotId);
  }

  function commitEdit() {
    if (!editingId) return;
    const depot = depots.find((d) => d.id === editingId);
    if (!depot) {
      cancelEdit();
      return;
    }
    if (validateName(editName, editingId)) return;

    const trimmedName = editName.trim();
    const trimmedNote = editNote.trim().slice(0, NOTE_MAX);
    if (trimmedName !== depot.name || trimmedNote !== (depot.note || "")) {
      onChange(updateDepot(investments, editingId, { name: trimmedName, note: trimmedNote }));
      toast.success("Depot gespeichert.");
    }
    cancelEdit();
  }

  function handleEditKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  function startAdding() {
    setEditingId(null);
    setIsAdding(true);
    setNewName("");
    setNewNote("");
  }

  function cancelAdding() {
    setIsAdding(false);
    setNewName("");
    setNewNote("");
  }

  function addNew() {
    if (validateName(newName, null)) return;
    const result = addDepot(investments, {
      name: newName.trim(),
      note: newNote.trim().slice(0, NOTE_MAX),
    });
    if (!result) return;
    onChange(result.investments);
    toast.success(`Depot „${newName.trim()}“ erstellt.`);
    cancelAdding();
  }

  function handleAddKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addNew();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelAdding();
    }
  }

  async function deleteDepot(depot) {
    const count = countDepotTransactions(investments, depot.id);
    // Die Zahl gehört in die Frage: ein Depot zu löschen klingt harmlos, das
    // Mitlöschen seiner Buchungen ist es nicht.
    const note =
      count === 0
        ? "Es hängen keine Transaktionen daran."
        : `Die ${usageLabel(count)} in diesem Depot werden mitgelöscht.`;

    const ok = await confirm({
      title: "Depot löschen",
      message: `Depot „${depot.name}“ wirklich löschen?\n\n${note}`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;

    if (editingId === depot.id) cancelEdit();
    onChange(removeDepot(investments, depot.id));
    toast.success("Depot gelöscht.");
  }

  const newError = validateName(newName, null);
  const showNewError = newError && newName.length > 0;

  return (
    <div>
      {depots.length > 0 ? (
        <div className="hb-potmgr-list">
          {depots.map((depot) => {
            const isEditing = editingId === depot.id;
            const error = isEditing ? validateName(editName, depot.id) : null;
            const count = countDepotTransactions(investments, depot.id);

            return (
              <div
                key={depot.id}
                className={`hb-potmgr-row${isEditing ? " hb-potmgr-row--editing" : ""}`}
              >
                <div className="hb-potmgr-main">
                  {isEditing ? (
                    <>
                      <input
                        ref={inputRef}
                        className={`hb-input hb-potmgr-input${error ? " hb-potmgr-input--invalid" : ""}`}
                        type="text"
                        value={editName}
                        maxLength={DEPOT_NAME_MAX}
                        aria-label={`Name von „${depot.name}“`}
                        aria-invalid={error ? "true" : undefined}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                      />
                      <input
                        className="hb-input hb-potmgr-input hb-inv-depot-note"
                        type="text"
                        value={editNote}
                        maxLength={NOTE_MAX}
                        placeholder="Notiz (optional)"
                        aria-label={`Notiz zu „${depot.name}“`}
                        onChange={(e) => setEditNote(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                      />
                    </>
                  ) : (
                    <div
                      className="hb-potmgr-name"
                      onDoubleClick={() => startEdit(depot)}
                      title={depot.name}
                    >
                      {depot.name}
                    </div>
                  )}
                  <div className="hb-potmgr-meta">
                    {error ? (
                      <span className="hb-potmgr-error">{error}</span>
                    ) : (
                      <span>{depot.note ? `${depot.note} · ${usageLabel(count)}` : usageLabel(count)}</span>
                    )}
                    {isEditing && editName.length >= COUNTER_THRESHOLD && (
                      <span className="hb-potmgr-counter">
                        {editName.length}/{DEPOT_NAME_MAX}
                      </span>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      aria-label="Depot speichern"
                      title="Speichern"
                      disabled={!!error}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={commitEdit}
                    >
                      <IconCheck />
                    </button>
                    <button
                      type="button"
                      className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      aria-label="Bearbeiten abbrechen"
                      title="Abbrechen"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={cancelEdit}
                    >
                      <IconClose />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      ref={(el) => {
                        editBtnRefs.current[depot.id] = el;
                      }}
                      className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      aria-label={`„${depot.name}“ bearbeiten`}
                      title="Bearbeiten"
                      onClick={() => startEdit(depot)}
                    >
                      <IconEdit />
                    </button>
                    <OverflowMenu
                      buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      label={`Aktionen für „${depot.name}“`}
                      items={[
                        { label: "Löschen", danger: true, onClick: () => deleteDepot(depot) },
                      ]}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hb-empty hb-empty--sm">
          <div className="hb-empty-icon"><IconWallet /></div>
          <div className="hb-empty-title">Noch keine Depots</div>
          <div className="hb-empty-text">
            Ein Depot ist der Ort, an dem etwas liegt — ein Broker, eine Bank, aber auch
            „Zu Hause" oder ein Bankschließfach.
          </div>
        </div>
      )}

      <div className="hb-potmgr-footer">
        {isAdding ? (
          <div className="hb-potmgr-row hb-potmgr-row--editing">
            <div className="hb-potmgr-main">
              <input
                ref={inputRef}
                className={`hb-input hb-potmgr-input${showNewError ? " hb-potmgr-input--invalid" : ""}`}
                type="text"
                value={newName}
                maxLength={DEPOT_NAME_MAX}
                placeholder="z.B. Swissquote, Zu Hause"
                aria-label="Name des neuen Depots"
                aria-invalid={showNewError ? "true" : undefined}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleAddKeyDown}
              />
              <input
                className="hb-input hb-potmgr-input hb-inv-depot-note"
                type="text"
                value={newNote}
                maxLength={NOTE_MAX}
                placeholder="Notiz (optional)"
                aria-label="Notiz zum neuen Depot"
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={handleAddKeyDown}
              />
              <div className="hb-potmgr-meta">
                {showNewError ? (
                  <span className="hb-potmgr-error">{newError}</span>
                ) : (
                  <span>Neues Depot</span>
                )}
                {newName.length >= COUNTER_THRESHOLD && (
                  <span className="hb-potmgr-counter">
                    {newName.length}/{DEPOT_NAME_MAX}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
              aria-label="Depot erstellen"
              title="Erstellen"
              disabled={!!newError}
              onClick={addNew}
            >
              <IconCheck />
            </button>
            <button
              type="button"
              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
              aria-label="Neues Depot verwerfen"
              title="Abbrechen"
              onClick={cancelAdding}
            >
              <IconClose />
            </button>
          </div>
        ) : (
          <Button variant="outline" onClick={startAdding}>
            <IconPlus /> Neues Depot
          </Button>
        )}
      </div>
    </div>
  );
}
