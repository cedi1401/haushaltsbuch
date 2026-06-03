import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import { IconEdit, IconDelete, IconInbox, IconPlus } from "../components/icons.jsx";
import { formatDateDE } from "../utils/hbUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";

const CHUNK_SIZE = 100;

export default function EntriesTable({
  entriesSorted,
  monthLabel,
  monthFilter,
  startEdit,
  removeEntry,
  onAddEntry,
}) {
  const fmt = useFmt();
  const [collapsed, setCollapsed] = useState(true);
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  const sentinelRef = useRef(null);

  // Reset when the entries list changes (month or filter change)
  useEffect(() => {
    setCollapsed(true);
    setVisibleCount(CHUNK_SIZE);
  }, [entriesSorted]);

  // Auto-load next chunk when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleCount >= entriesSorted.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((c) => Math.min(c + CHUNK_SIZE, entriesSorted.length));
        }
      },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, entriesSorted.length]);

  const displayedEntries = collapsed
    ? entriesSorted.slice(0, 5)
    : entriesSorted.slice(0, visibleCount);
  const hasMore = !collapsed && visibleCount < entriesSorted.length;

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
          <div className="hb-empty">
            <div className="hb-empty-icon"><IconInbox /></div>
            <div className="hb-empty-title">Noch keine Einträge</div>
            <div className="hb-empty-text">
              Lege deine erste Buchung an, um Einnahmen und Ausgaben für diesen
              Monat festzuhalten.
            </div>
            {onAddEntry ? (
              <Button onClick={onAddEntry}>
                <IconPlus /> Buchung hinzufügen
              </Button>
            ) : null}
          </div>
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
                {displayedEntries.map((e) => {
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
                    sign = "↓";
                    colorClass = "hb-transfer";
                  } else if (isWithdrawal) {
                    typeLabel = "Entnahme";
                    sign = "↓";
                    colorClass = "hb-withdrawal";
                  }

                  return (
                    <tr key={e.id}>
                      <td className="hb-col-date">{formatDateDE(e.date)}</td>
                      <td className="hb-col-type">{typeLabel}</td>
                      <td className="hb-col-category">{e.category}</td>
                      <td className="hb-col-note">{e.note || "—"}</td>
                      <td className={`hb-col-amount hb-right ${colorClass}`}>
                        <span className={`hb-sign${isTransfer ? " hb-sign-right" : ""}`}>{sign}</span>
                        <span className="hb-amount-value">{fmt(Number(e.amount || 0))}</span>
                      </td>
                      <td className="hb-col-actions">
                        <div className="hb-actions hb-actions-hover">
                          <button
                            type="button"
                            className="hb-icon-btn"
                            onClick={() => startEdit(e)}
                            title="Bearbeiten"
                            aria-label="Bearbeiten"
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="hb-icon-btn"
                            onClick={() => removeEntry(e.id)}
                            title="Löschen"
                            aria-label="Löschen"
                          >
                            <IconDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {collapsed && entriesSorted.length > 5 && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <Button variant="outline" onClick={() => setCollapsed(false)}>
                  Weitere {entriesSorted.length - 5} anzeigen
                </Button>
              </div>
            )}

            {!collapsed && (
              <>
                {hasMore && (
                  <div ref={sentinelRef} style={{ marginTop: 12, textAlign: "center" }}>
                    <span className="hb-muted">
                      {visibleCount} von {entriesSorted.length} Einträgen geladen…
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <Button variant="outline" onClick={() => setCollapsed(true)}>
                    Weniger anzeigen
                  </Button>
                </div>
              </>
            )}

            {monthFilter && (
              <div className="hb-note">
                Hinweis: Wenn du im Monatsfilter editierst und das Datum in einen anderen Monat änderst,
                verschwindet der Eintrag aus der aktuellen Ansicht.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
