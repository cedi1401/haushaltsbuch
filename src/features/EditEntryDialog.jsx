import React, { useId } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
import { EntryKindSelector } from "../components/EntryKindSelector.jsx";
import PurposeSelect from "../components/PurposeSelect.jsx";
import { getTransferCategoryOptions, purposeForPot } from "../utils/transferCategoryUtils.js";

const isPotKind = (kind) => kind === "transfer" || kind === "withdrawal";

export default function EditEntryDialog({
  open,
  onClose,
  onSave,
  canSave,
  editDraft,
  setEditDraft,
  pots,
  expenseCategories,
  incomeCategories,
  transferCategories,
  allTransferCategories,
  purposes,
}) {
  const fieldId = useId();
  const selectedPurposeId = editDraft.transferCategoryId || "";
  const purposeOptions = getTransferCategoryOptions(allTransferCategories, selectedPurposeId, purposes);

  // Ein Zweck gehört genau einem Topf: Wechselt der Topf (oder die Art auf
  // Transfer/Entnahme), muss der Zweck zum neuen Topf passen; vorgeschlagen
  // wird dann die erste Sparposition (siehe purposeForPot). Ein bewusst
  // gewähltes „Ohne" bleibt beim Topfwechsel stehen.
  function withPurposeFor(d, suggest) {
    if (!isPotKind(d.kind)) return d;
    const id = purposeForPot(transferCategories, d.potId, d.transferCategoryId, { suggest });
    return id === d.transferCategoryId ? d : { ...d, transferCategoryId: id };
  }

  function renderPurposeSelect() {
    return (
      <PurposeSelect
        value={selectedPurposeId}
        options={purposeOptions}
        onChange={(id) => setEditDraft((d) => ({ ...d, transferCategoryId: id }))}
      />
    );
  }

  return (
    <EditDialog
      open={open}
      title="Eintrag bearbeiten"
      onClose={onClose}
      onSave={onSave}
      canSave={canSave}
      size="medium"
      bodyScroll={false}
    >
      <div className="hb-entry-form">
        <div className="hb-entry-form__panes">
          <div className="hb-entry-form__main">
            <div className="hb-field">
              <div className="hb-label">Art</div>
              <EntryKindSelector
                value={editDraft.kind}
                onChange={(kind) => setEditDraft((d) => withPurposeFor({ ...d, kind }, !isPotKind(d.kind)))}
              />
              {editDraft.kind === "expense" && (
                <div className="hb-field-hint">Quelle: Monat</div>
              )}
            </div>

            <div className="hb-two hb-two--dialog">
              <div className="hb-field">
                <div className="hb-label">Datum</div>
                <HbDatePicker
                  value={editDraft.date}
                  onChange={(v) => setEditDraft((d) => ({ ...d, date: v }))}
                />
              </div>

              <div className="hb-field">
                <label className="hb-label" htmlFor={`${fieldId}-amount`}>Betrag</label>
                <input
                  id={`${fieldId}-amount`}
                  className="hb-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="z.B. 12.50"
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))}
                />
                <div className="hb-field-hint">
                  Komma geht auch (z.B. 12,50).
                </div>
              </div>
            </div>

            <div className="hb-field">
              <label className="hb-label" htmlFor={`${fieldId}-note`}>Notiz (optional)</label>
              <input
                id={`${fieldId}-note`}
                className="hb-input"
                type="text"
                placeholder="z.B. Migros, Abo, ..."
                value={editDraft.note}
                onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </div>

            {/*
              Anders als im Add-Dialog ohne `&& amount`-Guard: hier liegt immer
              schon ein Betrag vor, eine leere Eingabe ist also echtes Feedback
              und kein Begrüßungsfehler.
            */}
            {!canSave ? (
              <div className="hb-field-error">
                Bitte Datum &amp; einen gültigen Betrag (&gt; 0) setzen.
              </div>
            ) : null}
          </div>

          <div className="hb-entry-form__aside">
            {editDraft.kind === "expense" ? (
              <HierarchicalCategoryPicker
                label="Kategorie"
                value={{ categoryId: editDraft.categoryId, subcategoryId: editDraft.subcategoryId }}
                categories={expenseCategories}
                onChange={({ categoryId: cid, subcategoryId: sid }) =>
                  setEditDraft((d) => ({ ...d, categoryId: cid, subcategoryId: sid }))
                }
              />
            ) : editDraft.kind === "income" ? (
              <HierarchicalCategoryPicker
                label="Kategorie"
                value={{ categoryId: editDraft.categoryId, subcategoryId: editDraft.subcategoryId }}
                categories={incomeCategories}
                onChange={({ categoryId: cid, subcategoryId: sid }) =>
                  setEditDraft((d) => ({ ...d, categoryId: cid, subcategoryId: sid }))
                }
              />
            ) : editDraft.kind === "withdrawal" ? (
              <>
                <div className="hb-field">
                  <label className="hb-label" htmlFor={`${fieldId}-pot`}>Aus Topf</label>
                  <select
                    id={`${fieldId}-pot`}
                    className="hb-input"
                    value={editDraft.potId}
                    onChange={(e) => setEditDraft((d) => withPurposeFor({ ...d, potId: e.target.value }, Boolean(d.transferCategoryId)))}
                  >
                    {pots.map((pot) => (
                      <option key={pot.id} value={pot.id}>{pot.name}</option>
                    ))}
                  </select>
                </div>
                {renderPurposeSelect()}
              </>
            ) : editDraft.kind === "transfer" ? (
              <>
                <div className="hb-field">
                  <label className="hb-label" htmlFor={`${fieldId}-pot`}>In Topf</label>
                  <select
                    id={`${fieldId}-pot`}
                    className="hb-input"
                    value={editDraft.potId}
                    onChange={(e) => setEditDraft((d) => withPurposeFor({ ...d, potId: e.target.value }, Boolean(d.transferCategoryId)))}
                  >
                    {pots.map((pot) => (
                      <option key={pot.id} value={pot.id}>{pot.name}</option>
                    ))}
                  </select>
                </div>
                {renderPurposeSelect()}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </EditDialog>
  );
}
