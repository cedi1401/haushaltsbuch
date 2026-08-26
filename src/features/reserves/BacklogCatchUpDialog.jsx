import React from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { IconInfo } from "../../components/icons.jsx";
import { formatDateDE } from "../../utils/hbUtils.js";
import { formatYearMonth } from "../../utils/financialMonthUtils.js";
import { useFmt } from "../../contexts/CurrencyContext.jsx";

/**
 * „Rückstand ausgleichen" — bucht die Monatsraten seit Zyklusbeginn rückwirkend
 * nach, damit eine mitten im Zyklus angelegte Position nicht dauerhaft als
 * „Rückstand" dasteht.
 *
 * Der Dialog **ist** die Bestätigung; ein `ConfirmDialog` davor gäbe es nicht
 * zweimal, und der könnte ohnehin nur Text rendern, keine Ratenliste.
 *
 * `rates` wird außerhalb berechnet und fertig hereingereicht — dieselbe Liste,
 * die hier steht, wird auch gebucht. Anzeige und Buchung können dadurch
 * konstruktiv nicht auseinanderlaufen. Die Frage, **ob** die Aktion verfügbar
 * ist, entscheidet ebenfalls der View: der Dialog führt aus, er entscheidet
 * nicht, sonst gäbe es zwei Wahrheiten darüber.
 */
export default function BacklogCatchUpDialog({
  open,
  item,
  potName,
  cycleStart,
  rates,
  actual,
  target,
  onClose,
  onConfirm,
}) {
  const fmt = useFmt();

  if (!item) return null;

  const list = rates || [];
  const n = list.length;
  const sum = list.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const newActual = Number(actual || 0) + sum;

  return (
    <EditDialog
      open={open}
      title="Rückstand ausgleichen"
      onClose={onClose}
      onSave={() => {
        if (n === 0) return;
        onConfirm(list);
      }}
      canSave={n > 0}
      saveLabel={n === 1 ? "1 Rate buchen" : `${n} Raten buchen`}
      size="medium"
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div className="hb-muted" style={{ fontSize: 12 }}>
          {item.name} · Topf: {potName || "—"} · Zweck: {item.transferCategory || "—"}
        </div>

        <div>
          Der Zyklus läuft seit <strong>{formatDateDE(cycleStart)}</strong>. Für jeden
          Finanzmonat seither wird eine Monatsrate in den Topf gebucht — datiert auf den
          jeweiligen Monatsanfang, damit sie im richtigen Monat zählt.
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
              {list.map((r) => (
                <tr key={r.ym}>
                  <td>{formatYearMonth(r.ym)}</td>
                  <td className="hb-right">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Die Summenzeile ist der eigentliche Schutz vor einer falsch
            eingetragenen Fälligkeit: wer „Apr 2025 … Mär 2027" und 24 Raten
            liest, stutzt. Deshalb steht sie ausgeschrieben da und nicht nur als
            Zahl im Button. */}
        <div style={{ fontWeight: 600 }}>
          {n === 1 ? "1 Rate" : `${n} Raten`} · Summe {fmt(sum)} · Ist-Stand danach{" "}
          {fmt(newActual)}
          {target !== null && target !== undefined ? ` von ${fmt(target)} Soll` : ""}
        </div>

        {Number(actual || 0) > 0 && (
          <div className="hb-infobar hb-infobar--dialog" role="status">
            <div className="hb-infobar-icon"><IconInfo /></div>
            <div className="hb-infobar-content">
              <div className="hb-infobar-message">
                Für diesen Zweck liegen bereits <strong>{fmt(actual)}</strong> im Topf. Der
                Ausgleich rechnet das nicht gegen, sondern addiert die Raten dazu — der
                Ist-Stand kann danach über dem Soll liegen. Das ist gewollt: die Raten
                füllen die Historie, damit in der Fixkosten-Trendlinie kein Monat leer bleibt.
              </div>
            </div>
          </div>
        )}

        <div className="hb-muted" style={{ fontSize: 12 }}>
          Diese Aktion steht nur einmal zur Verfügung. Sobald eine Monatsrate gebucht ist,
          verschwindet sie — was danach fehlt, gehört in die normale monatliche Buchung.
        </div>
      </div>
    </EditDialog>
  );
}
