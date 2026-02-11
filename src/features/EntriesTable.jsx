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
          <div style={{ overflow: "auto", marginTop: 10 }}>
            <table className="hb-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Art</th>
                  <th>Kategorie</th>
                  <th>Notiz</th>
                  <th className="hb-right">Betrag</th>
                  <th className="hb-right" style={{ whiteSpace: "nowrap" }}></th>
                </tr>
              </thead>
              <tbody>
                {entriesSorted.map((e) => {
                  // NEU: kind statt type
                  const isIncome = e.kind === "income";
                  const isTransfer = e.kind === "transfer";
                  const isPotExpense = e.kind === "expense" && e.source === "pot";
                  
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
                  } else if (isPotExpense) {
                    typeLabel = "Ausgabe (Topf)";
                    sign = "-";
                    colorClass = "hb-bad";
                  }

                  return (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                      <td>{typeLabel}</td>
                      <td>{e.category}</td>
                      <td style={{ minWidth: 180 }}>{e.note || "—"}</td>
                      <td className={`hb-right ${colorClass}`} style={{ whiteSpace: "nowrap" }}>
                        {sign}
                        {toCHF(Number(e.amount || 0))}
                      </td>
                      <td className="hb-right" style={{ whiteSpace: "nowrap" }}>
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