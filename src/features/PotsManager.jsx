import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import HbSwitch from "../components/HbSwitch.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { generateId } from "../utils/idUtils.js";
import { useToast } from "../components/toastContext.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { IconPlus, IconPots, IconEdit, IconCheck, IconClose } from "../components/icons.jsx";

const MAX_NAME_LENGTH = 50;
// Ab hier wird der Zeichenzähler eingeblendet — vorher ist die Grenze kein Thema.
const COUNTER_THRESHOLD = 40;

/**
 * Der Spar-Schalter wird einmal zentral im Dialogkopf erklärt statt in jeder
 * Topf-Zeile. Als Konstante exportiert, damit die beiden Render-Pfade in
 * PotsView nicht auseinanderlaufen können.
 */
export const POTS_MANAGER_TITLE = (
  <span className="hb-title-with-help">
    Töpfe verwalten
    <HbTooltip
      placement="bottom"
      text="Als Spar-Topf markierte Töpfe zählen ihre Einzahlungen als Sparbetrag — dieser fließt in die Berechnung der Sparquote ein."
    />
  </span>
);

function usageLabel(count) {
  if (count === 0) return "keine Buchungen";
  if (count === 1) return "1 Buchung";
  return `${count} Buchungen`;
}

export default function PotsManager({ activeBook, onUpdateBook }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [isAddingPot, setIsAddingPot] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [newPotIsSavings, setNewPotIsSavings] = useState(false);

  // Immer nur eine Zeile gleichzeitig im Bearbeiten-Modus, daher genügt ein Ref.
  const inputRef = useRef(null);
  const editBtnRefs = useRef({});

  const pots = activeBook?.pots || [];
  const entries = activeBook?.entries;

  const usageCounts = useMemo(() => {
    const counts = {};
    (entries || []).forEach((e) => {
      if ((e.kind === "transfer" || e.kind === "withdrawal") && e.potId) {
        counts[e.potId] = (counts[e.potId] || 0) + 1;
      }
    });
    return counts;
  }, [entries]);

  useEffect(() => {
    if (!editingId && !isAddingPot) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingId, isAddingPot]);

  function validateName(name, excludeId) {
    const trimmed = name.trim();
    if (!trimmed) return "Name darf nicht leer sein.";
    if (trimmed.length > MAX_NAME_LENGTH) return `Name ist zu lang (max. ${MAX_NAME_LENGTH} Zeichen).`;
    const normalized = trimmed.toLocaleLowerCase("de");
    const isDuplicate = pots.some(
      (p) => p.id !== excludeId && p.name.trim().toLocaleLowerCase("de") === normalized
    );
    if (isDuplicate) return "Name bereits vergeben.";
    return null;
  }

  function focusEditButton(potId) {
    // Erst nach dem Re-Render existiert der Stift-Button wieder.
    requestAnimationFrame(() => editBtnRefs.current[potId]?.focus());
  }

  function startEdit(pot) {
    setIsAddingPot(false);
    setNewPotName("");
    setEditingId(pot.id);
    setEditName(pot.name);
  }

  function cancelEdit() {
    const potId = editingId;
    setEditingId(null);
    setEditName("");
    if (potId) focusEditButton(potId);
  }

  function commitEdit() {
    if (!editingId) return;
    const pot = pots.find((p) => p.id === editingId);
    if (!pot) {
      cancelEdit();
      return;
    }

    const trimmed = editName.trim();
    if (trimmed === pot.name) {
      cancelEdit();
      return;
    }
    if (validateName(editName, editingId)) return;

    onUpdateBook?.({
      ...activeBook,
      pots: pots.map((p) => (p.id === editingId ? { ...p, name: trimmed } : p)),
    });
    const potId = editingId;
    setEditingId(null);
    setEditName("");
    focusEditButton(potId);
    toast.success("Topf umbenannt.");
  }

  // Wegklicken speichert, solange die Eingabe gültig ist — sonst wird verworfen,
  // damit der Fokus nicht in einem ungültigen Feld gefangen bleibt.
  function handleEditBlur() {
    if (!editingId) return;
    if (validateName(editName, editingId)) {
      cancelEdit();
      return;
    }
    commitEdit();
  }

  function handleEditKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      // Ohne stopPropagation würde der globale Handler in EditDialog den
      // kompletten Dialog schließen statt nur das Bearbeiten abzubrechen.
      e.stopPropagation();
      e.preventDefault();
      cancelEdit();
    }
  }

  function toggleSavings(pot) {
    onUpdateBook?.({
      ...activeBook,
      pots: pots.map((p) =>
        p.id === pot.id ? { ...p, isSavings: !(p.isSavings ?? false) } : p
      ),
    });
  }

  function startAdding() {
    setEditingId(null);
    setEditName("");
    setNewPotName("");
    setNewPotIsSavings(false);
    setIsAddingPot(true);
  }

  function cancelAdding() {
    setIsAddingPot(false);
    setNewPotName("");
    setNewPotIsSavings(false);
  }

  function addNewPot() {
    if (validateName(newPotName, null)) return;
    const trimmed = newPotName.trim();
    onUpdateBook?.({
      ...activeBook,
      pots: [...pots, { id: generateId("pot"), name: trimmed, isSavings: newPotIsSavings }],
    });
    cancelAdding();
    toast.success(`Topf „${trimmed}“ erstellt.`);
  }

  function handleAddKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewPot();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      cancelAdding();
    }
  }

  async function deletePot(potId) {
    if (pots.length <= 1) return;
    const pot = pots.find((p) => p.id === potId);
    if (!pot) return;

    const usageCount = usageCounts[potId] || 0;
    const usageNote =
      usageCount === 0
        ? "Dieser Topf wird in keinen Einträgen verwendet."
        : usageCount === 1
        ? "Achtung: 1 Eintrag verwendet diesen Topf. Er bleibt erhalten, zeigt aber dann einen ungültigen Topf."
        : `Achtung: ${usageCount} Einträge verwenden diesen Topf. Sie bleiben erhalten, zeigen aber dann einen ungültigen Topf.`;

    const ok = await confirm({
      title: "Topf löschen",
      message: `Topf „${pot.name}“ wirklich löschen?\n\n${usageNote}`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;

    if (editingId === potId) {
      setEditingId(null);
      setEditName("");
    }
    onUpdateBook?.({ ...activeBook, pots: pots.filter((p) => p.id !== potId) });
    toast.success("Topf gelöscht.");
  }

  const newPotError = validateName(newPotName, null);
  const showNewPotError = newPotError && newPotName.length > 0;

  return (
    <div>
      {pots.length > 0 ? (
        <div className="hb-potmgr-list">
          {pots.map((pot) => {
            const isEditing = editingId === pot.id;
            const error = isEditing ? validateName(editName, pot.id) : null;
            const count = usageCounts[pot.id] || 0;
            const meta = pot.isSavings
              ? `Spar-Topf · ${usageLabel(count)}`
              : usageLabel(count);

            return (
              <div
                key={pot.id}
                className={`hb-potmgr-row${isEditing ? " hb-potmgr-row--editing" : ""}`}
              >
                <div className="hb-potmgr-main">
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      className={`hb-input hb-potmgr-input${error ? " hb-potmgr-input--invalid" : ""}`}
                      type="text"
                      value={editName}
                      maxLength={MAX_NAME_LENGTH}
                      aria-label={`Name von „${pot.name}“`}
                      aria-invalid={error ? "true" : undefined}
                      aria-describedby={error ? `pot-error-${pot.id}` : undefined}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={handleEditBlur}
                    />
                  ) : (
                    <div
                      className="hb-potmgr-name"
                      onDoubleClick={() => startEdit(pot)}
                      title={pot.name}
                    >
                      {pot.name}
                    </div>
                  )}
                  <div className="hb-potmgr-meta">
                    {error ? (
                      <span id={`pot-error-${pot.id}`} className="hb-potmgr-error">
                        {error}
                      </span>
                    ) : (
                      <span>{meta}</span>
                    )}
                    {isEditing && editName.length >= COUNTER_THRESHOLD && (
                      <span className="hb-potmgr-counter">
                        {editName.length}/{MAX_NAME_LENGTH}
                      </span>
                    )}
                  </div>
                </div>

                <HbSwitch
                  checked={pot.isSavings ?? false}
                  onChange={() => toggleSavings(pot)}
                  label={`Spar-Topf für „${pot.name}“`}
                  disabled={isEditing}
                />

                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      aria-label="Namen speichern"
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
                        editBtnRefs.current[pot.id] = el;
                      }}
                      className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      aria-label={`„${pot.name}“ umbenennen`}
                      title="Umbenennen"
                      onClick={() => startEdit(pot)}
                    >
                      <IconEdit />
                    </button>
                    <OverflowMenu
                      buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      label={`Aktionen für „${pot.name}“`}
                      items={[
                        {
                          label: "Löschen",
                          danger: true,
                          disabled: pots.length <= 1,
                          onClick: () => deletePot(pot.id),
                        },
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
          <div className="hb-empty-icon"><IconPots /></div>
          <div className="hb-empty-title">Noch keine Töpfe</div>
          <div className="hb-empty-text">Erstelle deinen ersten Topf mit dem Button unten.</div>
        </div>
      )}

      <div className="hb-potmgr-footer">
        {isAddingPot ? (
          <div className="hb-potmgr-row hb-potmgr-row--editing">
            <div className="hb-potmgr-main">
              <input
                ref={inputRef}
                className={`hb-input hb-potmgr-input${showNewPotError ? " hb-potmgr-input--invalid" : ""}`}
                type="text"
                value={newPotName}
                maxLength={MAX_NAME_LENGTH}
                placeholder="z.B. Notgroschen, Auto"
                aria-label="Name des neuen Topfes"
                aria-invalid={showNewPotError ? "true" : undefined}
                aria-describedby={showNewPotError ? "new-pot-error" : undefined}
                onChange={(e) => setNewPotName(e.target.value)}
                onKeyDown={handleAddKeyDown}
              />
              <div className="hb-potmgr-meta">
                {showNewPotError ? (
                  <span id="new-pot-error" className="hb-potmgr-error">{newPotError}</span>
                ) : (
                  <span>{newPotIsSavings ? "Neuer Spar-Topf" : "Neuer Topf"}</span>
                )}
                {newPotName.length >= COUNTER_THRESHOLD && (
                  <span className="hb-potmgr-counter">
                    {newPotName.length}/{MAX_NAME_LENGTH}
                  </span>
                )}
              </div>
            </div>

            <HbSwitch
              checked={newPotIsSavings}
              onChange={setNewPotIsSavings}
              label="Neuen Topf als Spar-Topf anlegen"
            />

            <button
              type="button"
              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
              aria-label="Topf erstellen"
              title="Erstellen"
              disabled={!!newPotError}
              onClick={addNewPot}
            >
              <IconCheck />
            </button>
            <button
              type="button"
              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
              aria-label="Neuen Topf verwerfen"
              title="Abbrechen"
              onClick={cancelAdding}
            >
              <IconClose />
            </button>
          </div>
        ) : (
          <Button variant="outline" onClick={startAdding}>
            <IconPlus /> Neuer Topf
          </Button>
        )}
      </div>
    </div>
  );
}
