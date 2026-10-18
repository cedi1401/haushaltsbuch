import React from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { formatYearMonth, getFinancialMonth } from "../../utils/financialMonthUtils.js";
import { useFmt } from "../../contexts/CurrencyContext.jsx";

/**
 * „Ausgleich zurücknehmen" — löscht die Raten, die „Rückstand ausgleichen"
 * gebucht hat, auf einmal. Gedacht für den Fall, dass der Rechnungsbetrag beim
 * Anlegen nur geschätzt war: Betrag korrigieren, Ausgleich zurücknehmen und
 * neu ausführen, statt jede Rate einzeln im Buchungsmonat zu suchen.
 *
 * Die Raten werden bewusst nicht automatisch an einen geänderten Betrag
 * angepasst — gebuchte Monate schreiben sich nicht still um. Erkannt werden
 * sie an `catchUpBatchId`; was von Hand gebucht wurde, bleibt stehen.
 *
 * `entries` und `otherDeposits` liefert der View; wie beim Ausgleich gilt:
 * dieselbe Liste, die hier steht, wird gelöscht.
 */
export default function CatchUpRevertDialog({
  open,
  name,
  entries,
  actual,
  otherDeposits,
  monthStartDay = 1,
  onClose,
  onConfirm,
}) {
  const fmt = useFmt();

  const list = entries || [];
  const n = list.length;
  if (!open || n === 0) return null;

  const sum = list.reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const sorted = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return (
    <EditDialog
      open={open}
      title="Ausgleich zurücknehmen"
      onClose={onClose}
      onSave={() => onConfirm(list)}
      canSave
      saveLabel={n === 1 ? "1 Rate löschen" : `${n} Raten löschen`}
      size="medium"
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div className="hb-muted hb-muted--sm">{name}</div>

        <div>
          Diese Raten hat „Rückstand ausgleichen“ gebucht. Sie werden gelöscht — von Hand
          gebuchte Einzahlungen und Entnahmen bleiben stehen.
        </div>

        <div className="hb-table-wrap">
          <table className="hb-table">
            <thead>
              <tr>
                <th scope="col">Monat</th>
                <th scope="col" className="hb-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td>{formatYearMonth(getFinancialMonth(e.date, monthStartDay)?.yyyymm)}</td>
                  <td className="hb-right">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontWeight: 600 }}>
          {n === 1 ? "1 Rate" : `${n} Raten`} · Summe {fmt(sum)} · Ist-Stand danach{" "}
          {fmt(Number(actual || 0) - sum)}
        </div>

        <div className="hb-muted hb-muted--sm">
          {otherDeposits > 0
            ? "Für diese Sparposition gibt es weitere Einzahlungen. „Rückstand ausgleichen“ steht deshalb danach nicht wieder zur Verfügung — fehlende Monate buchst du von Hand."
            : "Danach steht „Rückstand ausgleichen“ wieder zur Verfügung und rechnet mit dem aktuellen Rechnungsbetrag."}
        </div>
      </div>
    </EditDialog>
  );
}
