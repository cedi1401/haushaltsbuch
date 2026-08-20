import React from "react";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
import { EntryKindSelector } from "../components/EntryKindSelector.jsx";

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
  withdrawalCategories,
}) {
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
                onChange={(kind) => setEditDraft((d) => ({ ...d, kind }))}
              />
              {editDraft.kind === "expense" && (
                <div className="hb-entry-form__hint">Quelle: Monatsbudget</div>
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
                <div className="hb-label">Betrag</div>
                <input
                  className="hb-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="z.B. 12.50"
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))}
                />
                <div className="hb-entry-form__field-hint">
                  Komma geht auch (z.B. 12,50).
                </div>
              </div>
            </div>

            <div className="hb-field">
              <div className="hb-label">Notiz (optional)</div>
              <input
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
              <div className="hb-entry-form__error">
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
                  <div className="hb-label">Aus Topf</div>
                  <select
                    className="hb-input"
                    value={editDraft.potId}
                    onChange={(e) => setEditDraft((d) => ({ ...d, potId: e.target.value }))}
                  >
                    {pots.map((pot) => (
                      <option key={pot.id} value={pot.id}>{pot.name}</option>
                    ))}
                  </select>
                </div>
                <div className="hb-field">
                  <div className="hb-label">Transfer-Zweck</div>
                  <select
                    className="hb-input"
                    value={editDraft.category || ""}
                    onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                  >
                    {withdrawalCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : editDraft.kind === "transfer" ? (
              <>
                <div className="hb-field">
                  <div className="hb-label">In Topf</div>
                  <select
                    className="hb-input"
                    value={editDraft.potId}
                    onChange={(e) => setEditDraft((d) => ({ ...d, potId: e.target.value }))}
                  >
                    {pots.map((pot) => (
                      <option key={pot.id} value={pot.id}>{pot.name}</option>
                    ))}
                  </select>
                </div>
                <div className="hb-field">
                  <div className="hb-label">Transfer-Zweck</div>
                  <select
                    className="hb-input"
                    value={editDraft.category || ""}
                    onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                  >
                    {transferCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </EditDialog>
  );
}
