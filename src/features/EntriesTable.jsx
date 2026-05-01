import React from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";

export default function EntriesTable({
  entriesSorted,
  monthLabel,
  toCHF,
  startEdit,
  removeEntry,
}) {
  return (
    <Card style={{ marginTop: 16 }}>
      <CardContent>
        <div className="hb-row" style={{ alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Buchungen</h2>
          <div className="hb-muted">
            {entriesSorted.length} Einträge {monthLabel}
          </div>
        </div>

        {entriesSorted.length === 0 ? (
          <p className="hb-muted">Noch keine Einträge.</p>
        ) : (
          <div className="hb-table-wrap" style={{ marginTop: 10 }}>
            <table className="hb-table hb-entries-table">
              <thead>
                <tr>
                  <th className="hb-col-date">Datum</th>
                  <th className="hb-col-type">Art</th>
                  <th className="hb-col-category">Kategorie</th>
                  <th className="hb-col-note">Notiz</th>
                  <th className="hb-col-amount hb-right">Betrag</th>
                  <th className="hb-col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {entriesSorted.map((e) => {
                  const isIncome = e.kind === "income";
                  const isTransfer = e.kind === "transfer";
                  const isWithdrawal = e.kind === "withdrawal";

                  let typeLabel = "Ausgabe";
                  let sign = "-";
                  let colorClass = "hb-bad";

                  if (isIncome) {
                    typeLabel = "Einnahme";
                    sign = "+";
                    colorClass = "hb-ok";
                  } else if (isTransfer) {
                    typeLabel = "Transfer";
                    sign = "→";
                    colorClass = "hb-transfer";
                  } else if (isWithdrawal) {
                    typeLabel = "Entnahme";
                    sign = "↓";
                    colorClass = "hb-withdrawal";
                  }

                  return (
                    <tr key={e.id}>
                      <td className="hb-col-date">{e.date}</td>
                      <td className="hb-col-type">{typeLabel}</td>
                      <td className="hb-col-category">{e.category}</td>
                      <td className="hb-col-note">{e.note || "—"}</td>
                      <td className={`hb-col-amount hb-right ${colorClass}`}>
                        <span className="hb-sign">{sign}</span>
                        <span className="hb-amount-value">{toCHF(Number(e.amount || 0))}</span>
                      </td>
                      <td className="hb-col-actions">
                        <div className="hb-actions">
                          <Button variant="outline" onClick={() => startEdit(e)}>
                            Bearbeiten
                          </Button>
                          <Button variant="outline" onClick={() => removeEntry(e.id)}>
                            Löschen
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="hb-note">
              Hinweis: Wenn du im Monatsfilter editierst und das Datum in einen anderen Monat änderst,
              verschwindet der Eintrag aus der aktuellen Ansicht.
            </div>
          </div>
        )}

        <div className="hb-note">
          Hinweis: Kategorie-Loeschen entfernt nur die Kategorie aus der Liste. Bestehende Eintraege behalten ihre Kategorie.
        </div>
      </CardContent>
    </Card>
  );
}