import React, { useState } from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { Button, RangeTabs } from "../../components/ui.jsx";
import { IconWarning } from "../../components/icons.jsx";
import { parseAmount } from "../../utils/hbUtils.js";
import { useBaseCurrency, useFmt } from "../../contexts/CurrencyContext.jsx";
import { budgetMoney } from "./budgetColumns.jsx";

const MODE_OPTIONS = [
  { value: "category", label: "Ganze Kategorie" },
  { value: "subcategories", label: "Je Unterkategorie" },
];

const hasBudget = (node) => node?.budget != null && node.budget > 0;
const toDraft = (node) => (hasBudget(node) ? String(node.budget) : "");

/**
 * Budget einer Ausgaben-Kategorie festlegen, ändern oder entfernen.
 *
 * Ein Budget liegt entweder auf der Oberkategorie oder auf ihren
 * Unterkategorien, nie auf beiden. Der Umschalter macht diese Regel zur Wahl:
 * gespeichert wird immer nur die gewählte Ebene, die andere wird geleert
 * (`setCategoryBudgets`).
 *
 * Der Dialog initialisiert seinen Entwurf beim Mounten — der View rendert ihn
 * nur, solange er offen ist, und gibt ihm die Kategorie als `key`.
 *
 * @param {object} props
 * @param {object} props.category - Oberkategorie mit `subcategories`
 * @param {(change: { budget?: number, subBudgets?: object }) => void} props.onSave
 * @param {() => void} props.onRemove
 * @param {() => void} props.onClose
 */
export default function BudgetEditDialog({ category, onSave, onRemove, onClose }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const money = (value) => budgetMoney(fmt, value);

  const subs = category.subcategories || [];
  const hadSubBudgets = subs.some(hasBudget);
  const hadCategoryBudget = !hadSubBudgets && hasBudget(category);

  const [mode, setMode] = useState(hadSubBudgets ? "subcategories" : "category");
  const [amount, setAmount] = useState(hadSubBudgets ? "" : toDraft(category));
  const [subAmounts, setSubAmounts] = useState(() =>
    Object.fromEntries(subs.map((sub) => [sub.id, toDraft(sub)]))
  );

  const setSubAmount = (id, value) => setSubAmounts((prev) => ({ ...prev, [id]: value }));

  const parsedAmount = parseAmount(amount);
  const parsedSubs = subs.map((sub) => {
    const raw = (subAmounts[sub.id] || "").trim();
    return { id: sub.id, empty: raw === "", value: parseAmount(raw) };
  });
  const subsValid = parsedSubs.every((s) => s.empty || (Number.isFinite(s.value) && s.value >= 0));
  const subTotal = parsedSubs.reduce(
    (sum, s) => sum + (!s.empty && Number.isFinite(s.value) && s.value > 0 ? s.value : 0),
    0
  );

  const amountInvalid = amount.trim() !== "" && !(parsedAmount > 0);
  const subInvalid = (s) => !s.empty && !(Number.isFinite(s.value) && s.value >= 0);

  const canSave =
    mode === "category"
      ? Number.isFinite(parsedAmount) && parsedAmount > 0
      : subsValid && subTotal > 0;

  function save() {
    if (!canSave) return;
    if (mode === "category") onSave({ budget: parsedAmount });
    else onSave({ subBudgets: Object.fromEntries(parsedSubs.map((s) => [s.id, s.empty ? null : s.value])) });
  }

  // Was beim Speichern auf der anderen Ebene verloren geht, steht da, bevor es
  // passiert.
  let switchHint = null;
  if (mode === "category" && hadSubBudgets) {
    switchHint = "Beim Speichern entfallen die Budgets der Unterkategorien.";
  } else if (mode === "subcategories" && hadCategoryBudget) {
    switchHint = `Beim Speichern entfällt das Budget der ganzen Kategorie (${money(category.budget)}).`;
  }

  return (
    <EditDialog
      open
      title={`Budget für „${category.name}“`}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      saveLabel="Speichern"
      size="medium"
      footerStart={
        (hadSubBudgets || hadCategoryBudget) && (
          <Button variant="outline" className="hb-btn-outline--danger" onClick={onRemove}>
            {hadSubBudgets ? "Budgets entfernen" : "Budget entfernen"}
          </Button>
        )
      }
    >
      <div className="hb-budget-edit">
        {subs.length > 0 && (
          <div className="hb-field">
            <div className="hb-label">Budget gilt für</div>
            <RangeTabs
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
              ariaLabel="Budget gilt für"
              size="md"
              full
            />
          </div>
        )}

        {switchHint && (
          <div className="hb-infobar hb-infobar--dialog hb-infobar--warning" role="status">
            <div className="hb-infobar-icon"><IconWarning /></div>
            <div className="hb-infobar-content">
              <div className="hb-infobar-message">{switchHint}</div>
            </div>
          </div>
        )}

        {mode === "category" ? (
          <div className="hb-field">
            <label className="hb-label" htmlFor="hb-budget-edit-amount">
              Budget pro Monat ({baseCurrency})
            </label>
            <input
              id="hb-budget-edit-amount"
              className="hb-input hb-full"
              style={{ minWidth: 0 }}
              type="text"
              inputMode="decimal"
              placeholder="z.B. 400"
              value={amount}
              aria-invalid={amountInvalid || undefined}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amountInvalid && (
              <div className="hb-budget-edit-hint">Bitte einen Betrag über 0 eingeben.</div>
            )}
          </div>
        ) : (
          <>
            <div className="hb-budget-edit-subs">
              <div className="hb-budget-edit-subs-head">
                <span className="hb-label">Unterkategorie</span>
                <span className="hb-label" id="hb-budget-edit-col-amount">Pro Monat ({baseCurrency})</span>
              </div>
              {subs.map((sub, index) => (
                <div key={sub.id} className="hb-budget-edit-subs-row">
                  <label
                    className="hb-budget-edit-subs-name"
                    htmlFor={`hb-budget-edit-${sub.id}`}
                    title={sub.name}
                  >
                    {sub.name}
                  </label>
                  <input
                    id={`hb-budget-edit-${sub.id}`}
                    className="hb-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="kein Budget"
                    value={subAmounts[sub.id] || ""}
                    aria-describedby="hb-budget-edit-col-amount"
                    aria-invalid={subInvalid(parsedSubs[index]) || undefined}
                    onChange={(e) => setSubAmount(sub.id, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="hb-budget-edit-hint" aria-live="polite">
              Summe: <strong>{money(subTotal)}</strong> pro Monat. Leere Felder bleiben ohne
              Budget; was dort ausgegeben wird, steht in der Tabelle unter „Ohne Budget“.
            </div>
          </>
        )}
      </div>
    </EditDialog>
  );
}
