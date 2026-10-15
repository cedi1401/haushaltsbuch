import React, { useState } from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { Button } from "../../components/ui.jsx";
import { parseAmount } from "../../utils/hbUtils.js";
import { useBaseCurrency, useFmt } from "../../contexts/CurrencyContext.jsx";
import { budgetMoney } from "./budgetColumns.jsx";

// Beträge sind auf Rappen/Cent genau — alles darunter ist Rechenrauschen.
const EPS = 0.005;

const hasBudget = (node) => node?.budget != null && node.budget > 0;
const toDraft = (node) => (hasBudget(node) ? String(node.budget) : "");

/**
 * Budget einer Ausgaben-Kategorie festlegen, ändern oder entfernen.
 *
 * Die Oberkategorie trägt das Budget; ihre Unterkategorien teilen es optional
 * auf. Die Summe der Unterkategorien darf das Budget nie übersteigen — der
 * Dialog rechnet mit und sperrt das Speichern, solange sie es tut.
 *
 * Der Dialog initialisiert seinen Entwurf beim Mounten — der View rendert ihn
 * nur, solange er offen ist, und gibt ihm die Kategorie als `key`.
 *
 * @param {object} props
 * @param {object} props.category - Oberkategorie mit `subcategories`
 * @param {(change: { budget: number, subBudgets: object }) => void} props.onSave
 * @param {() => void} props.onRemove
 * @param {() => void} props.onClose
 */
export default function BudgetEditDialog({ category, onSave, onRemove, onClose }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const money = (value) => budgetMoney(fmt, value);

  const subs = category.subcategories || [];

  const [amount, setAmount] = useState(toDraft(category));
  const [subAmounts, setSubAmounts] = useState(() =>
    Object.fromEntries(subs.map((sub) => [sub.id, toDraft(sub)]))
  );

  const setSubAmount = (id, value) => setSubAmounts((prev) => ({ ...prev, [id]: value }));

  const parsedAmount = parseAmount(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const amountInvalid = amount.trim() !== "" && !amountValid;

  const parsedSubs = subs.map((sub) => {
    const raw = (subAmounts[sub.id] || "").trim();
    return { id: sub.id, empty: raw === "", value: parseAmount(raw) };
  });
  const subInvalid = (s) => !s.empty && !(Number.isFinite(s.value) && s.value >= 0);
  const subsValid = !parsedSubs.some(subInvalid);
  const subTotal = parsedSubs.reduce(
    (sum, s) => sum + (!s.empty && Number.isFinite(s.value) && s.value > 0 ? s.value : 0),
    0
  );
  const free = amountValid ? parsedAmount - subTotal : null;
  const exceeded = free != null && free < -EPS;

  const canSave = amountValid && subsValid && !exceeded;

  function save() {
    if (!canSave) return;
    onSave({
      budget: parsedAmount,
      subBudgets: Object.fromEntries(parsedSubs.map((s) => [s.id, s.empty ? null : s.value])),
    });
  }

  let distribution = null;
  if (subs.length > 0 && subTotal > 0) {
    if (!amountValid) {
      distribution = "Lege zuerst das Budget der Kategorie fest — die Unterkategorien teilen es auf.";
    } else if (exceeded) {
      distribution = `Die Unterkategorien übersteigen das Budget um ${money(-free)}.`;
    } else {
      distribution = `${money(subTotal)} von ${money(parsedAmount)} verteilt · ${money(free)} frei`;
    }
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
        hasBudget(category) && (
          <Button variant="outline" className="hb-btn-outline--danger" onClick={onRemove}>
            Budget entfernen
          </Button>
        )
      }
    >
      <div className="hb-budget-edit">
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

        {subs.length > 0 && (
          <>
            <div className="hb-budget-edit-subs">
              <div className="hb-budget-edit-subs-head">
                <span className="hb-label">Davon für Unterkategorien (optional)</span>
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

            <div
              className={"hb-budget-edit-hint" + (exceeded ? " hb-budget-edit-hint--error" : "")}
              aria-live="polite"
            >
              {distribution ||
                "Leere Felder bleiben ohne eigenes Budget; ihre Ausgaben zählen nur zum Budget der Kategorie."}
            </div>
          </>
        )}
      </div>
    </EditDialog>
  );
}
