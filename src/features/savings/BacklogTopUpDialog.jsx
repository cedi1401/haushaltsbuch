import React from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { HbDatePicker } from "../../components/HbDatePicker.jsx";
import { parseAmount } from "../../utils/formatUtils.js";
import { useFmt, useBaseCurrency } from "../../contexts/CurrencyContext.jsx";

/**
 * „Rückstand ausgleichen" — eine einzelne Einzahlung in den Topf, die den
 * laufenden Rückstand einer Rückstellung schließt. Das Gegenstück zu „Raten
 * nachbuchen" (BacklogCatchUpDialog): jenes holt einmalig die Historie nach,
 * dieses gleicht später entstandene Lücken aus.
 *
 * Gebucht wird ein normaler Transfer vom Monat in den Topf — dasselbe, was der
 * Nutzer sonst von Hand im Dashboard erfasst. Ohne `catchUpBatchId`: der
 * Eintrag ist eine gewöhnliche Einzahlung und gehört nicht zu dem, was
 * „Nachbuchung zurücknehmen" löscht.
 *
 * Wie bei „Rechnung bezahlt" liegt der Draft beim Aufrufer, `actual` kommt
 * fertig herein, und `onConfirm` bekommt den fertigen Eintrag.
 */
export default function BacklogTopUpDialog({
  open,
  item,
  potName,
  actual,
  draft,
  onDraftChange,
  onClose,
  onConfirm,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();

  if (!item) return null;

  const amount = parseAmount(draft?.amount);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const canSave = Boolean(draft?.date) && amountValid;
  const newActual = Number(actual || 0) + (amountValid ? amount : 0);

  function set(patch) {
    onDraftChange({ ...draft, ...patch });
  }

  return (
    <EditDialog
      open={open}
      title="Rückstand ausgleichen"
      onClose={onClose}
      onSave={() => {
        if (!canSave) return;
        onConfirm({
          date: draft.date,
          amount,
          transferCategoryId: item.transferCategoryId || null,
          categoryId: null,
          subcategoryId: null,
          kind: "transfer",
          potId: item.potId,
          note: String(draft.note || "").trim(),
        });
      }}
      canSave={canSave}
      saveLabel="Einzahlung buchen"
      size="medium"
      // Pflicht, sobald ein HbDatePicker im Dialog steht — sonst erzeugt das
      // Kalender-Popover eine Scrollbar, statt über den Body hinauszuragen.
      bodyScroll={false}
    >
      <div className="hb-form hb-form-stack">
        <div className="hb-res-dlg-context">
          <div className="hb-res-dlg-name">{item.name}</div>
          {/* Akzentblau aus der Status-Pille „Fällig" — der Ton ist dort schon auf
              Kontrast geprüft. */}
          <span className="hb-badge hb-res-pill hb-res-pill--due">Topf: {potName || "—"}</span>
        </div>

        <div className="hb-two hb-two--dialog">
          <div className="hb-field">
            <div className="hb-label">Datum</div>
            <HbDatePicker
              value={draft?.date || ""}
              onChange={(v) => set({ date: v })}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Betrag ({baseCurrency})</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              value={draft?.amount ?? ""}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </div>
        </div>

        <div className="hb-field">
          <div className="hb-label">Notiz (optional)</div>
          <input
            className="hb-input"
            type="text"
            value={draft?.note ?? ""}
            onChange={(e) => set({ note: e.target.value })}
          />
        </div>

        {/* Die Nachher-Kachel rechnet beim Tippen mit. */}
        <div className="hb-res-dlg-tiles">
          <Tile label="Ist-Stand jetzt" value={fmt(actual)} />
          <Tile label="Ist-Stand danach" value={fmt(newActual)} />
        </div>

        <p className="hb-res-dlg-text">
          Der Betrag geht vom Monat in den Topf und zählt im Monat des gewählten Datums.
        </p>
      </div>
    </EditDialog>
  );
}

/** Eine Kachel im Muster der Faktenkacheln aus dem Detailbereich. */
function Tile({ label, value }) {
  return (
    <div className="hb-res-fact">
      <span className="hb-res-fact-label">{label}</span>
      <span className="hb-res-fact-value">{value}</span>
    </div>
  );
}
