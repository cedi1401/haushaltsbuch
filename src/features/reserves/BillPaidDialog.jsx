import React from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { HbDatePicker } from "../../components/HbDatePicker.jsx";
import { IconWarning } from "../../components/icons.jsx";
import { parseAmount } from "../../utils/hbUtils.js";
import { useFmt, useBaseCurrency } from "../../contexts/CurrencyContext.jsx";

/**
 * „Rechnung bezahlt" — erfasst die Zahlung als Entnahme aus dem Topf und
 * beendet damit den Zyklus.
 *
 * Warum ein eigener Dialog und nicht der globale „Buchung hinzufügen": dessen
 * Zweck-Auswahl speist sich aus `getWithdrawalCategoriesForPot()` und bietet nur
 * Zwecke an, aus denen aus diesem Topf **schon einmal** entnommen wurde. Der
 * klassische Fall hier ist aber die *erste* Entnahme für einen Zweck — der
 * stünde dort schlicht nicht in der Liste. Dazu kommt, dass Topf und Zweck hier
 * feststehen und gar nicht zur Wahl stehen dürfen.
 *
 * Der Dialog rechnet nichts und schreibt nichts: `actual` kommt fertig herein,
 * der Draft liegt beim Aufrufer (das Projekt vermeidet set-state-in-effect und
 * setzt den Draft vor dem Öffnen), und `onConfirm` bekommt den fertigen Eintrag.
 * Toast und Schliessen macht der Aufrufer — so bleibt der Dialog frei von
 * Seiteneffekten.
 */
export default function BillPaidDialog({
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

  // Die Unterdeckung informiert nur, sie blockiert nicht: der Nutzer hat die
  // Rechnung real bezahlt, und ob das Geld vorher im Topf lag, ändert daran
  // nichts. Der Zweck steht danach eben im Minus — das ist eine Aussage über
  // die Vergangenheit, kein Eingabefehler.
  const shortfall = amountValid && amount > actual ? amount - actual : 0;

  function set(patch) {
    onDraftChange({ ...draft, ...patch });
  }

  return (
    <EditDialog
      open={open}
      title="Rechnung bezahlt"
      onClose={onClose}
      onSave={() => {
        if (!canSave) return;
        onConfirm({
          date: draft.date,
          amount,
          category: item.transferCategory,
          categoryId: null,
          subcategoryId: null,
          kind: "withdrawal",
          potId: item.potId,
          note: String(draft.note || "").trim(),
        });
      }}
      canSave={canSave}
      saveLabel="Entnahme buchen"
      size="medium"
      // Pflicht, sobald ein HbDatePicker im Dialog steht — sonst erzeugt das
      // Kalender-Popover eine Scrollbar, statt über den Body hinauszuragen.
      bodyScroll={false}
    >
      <div className="hb-form" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {/* Topf und Zweck stehen fest — als Textzeile, nicht als gesperrtes
            Eingabefeld: es gibt nichts zu ändern, also auch nichts zu bedienen. */}
        <div className="hb-muted" style={{ fontSize: 12, marginBottom: 4 }}>
          {item.name} · Topf: {potName || "—"} · Zweck: {item.transferCategory || "—"}
        </div>

        <div className="hb-two hb-two--dialog" style={{ gap: 16 }}>
          <div className="hb-field" style={{ minWidth: 0 }}>
            <div className="hb-label">Datum</div>
            <HbDatePicker
              value={draft?.date || ""}
              onChange={(v) => set({ date: v })}
              style={{ minWidth: 0, width: "100%" }}
            />
          </div>

          <div className="hb-field" style={{ minWidth: 0 }}>
            <div className="hb-label">Betrag ({baseCurrency})</div>
            <input
              className="hb-input"
              style={{ minWidth: 0, width: "100%" }}
              type="text"
              inputMode="decimal"
              value={draft?.amount ?? ""}
              onChange={(e) => set({ amount: e.target.value })}
            />
            {/* Vorbelegt ist der Betrag pro Zyklus, nicht die Monatsrate — die
                Rechnung kommt aber selten auf den Franken genau so, wie sie
                geplant war. Deshalb ist das Feld zwingend änderbar. */}
            <div className="hb-fixed-field-hint">
              Vorbelegt mit dem geplanten Betrag pro Zyklus. Steht auf der Rechnung ein
              anderer Betrag, trag ihn hier ein.
            </div>
          </div>
        </div>

        <div className="hb-field" style={{ minWidth: 0 }}>
          <div className="hb-label">Notiz (optional)</div>
          <input
            className="hb-input"
            style={{ minWidth: 0, width: "100%" }}
            type="text"
            value={draft?.note ?? ""}
            onChange={(e) => set({ note: e.target.value })}
          />
        </div>

        {shortfall > 0 && (
          <div className="hb-infobar hb-infobar--dialog hb-infobar--warning" role="status">
            <div className="hb-infobar-icon"><IconWarning /></div>
            <div className="hb-infobar-content">
              <div className="hb-infobar-message">
                Für diesen Zweck liegen erst <strong>{fmt(actual)}</strong> im Topf. Die
                Entnahme wird trotzdem erfasst; der Zweck steht danach mit{" "}
                <strong>{fmt(shortfall)}</strong> im Minus.
              </div>
            </div>
          </div>
        )}
      </div>
    </EditDialog>
  );
}
