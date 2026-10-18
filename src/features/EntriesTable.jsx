import React, { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import { IconEdit, IconDelete, IconInbox, IconPlus, IconSearch, IconClose } from "../components/icons.jsx";
import { formatDateDE } from "../utils/formatUtils.js";
import { getEntryCategoryName } from "../utils/hbUtils.js";
import { searchEntries, searchHighlightPattern } from "../utils/entrySearch.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import HbTooltip from "../components/HbTooltip.jsx";

const CHUNK_SIZE = 100;

/** Markiert die Treffer der Suche in einem Zellentext. */
function highlight(text, pattern) {
  if (!pattern || !text) return text;
  // split() mit Fanggruppe: Treffer stehen an den ungeraden Indizes.
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="hb-search-hit">{part}</mark> : part
  );
}

export default function EntriesTable({
  entriesSorted,
  monthLabel,
  monthFilter,
  onMonthFilterChange,
  expenseCategories,
  incomeCategories,
  transferCategories,
  startEdit,
  removeEntry,
  onAddEntry,
}) {
  const fmt = useFmt();
  const [collapsed, setCollapsed] = useState(true);
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  const [query, setQuery] = useState("");
  const sentinelRef = useRef(null);
  const searchInputRef = useRef(null);

  const isSearching = query.trim() !== "";
  const matches = useMemo(
    () => searchEntries(entriesSorted, query, { expenseCategories, incomeCategories, transferCategories }),
    [entriesSorted, query, expenseCategories, incomeCategories, transferCategories]
  );
  const highlightPattern = useMemo(() => searchHighlightPattern(query), [query]);

  // Reset when the entries list changes (month, filter or search change) — derived
  // from the prop transition rather than via an Effect (avoids set-state-in-effect).
  const [prevMatches, setPrevMatches] = useState(matches);
  if (matches !== prevMatches) {
    setPrevMatches(matches);
    setCollapsed(true);
    setVisibleCount(CHUNK_SIZE);
  }

  function clearSearch() {
    setQuery("");
    searchInputRef.current?.focus();
  }

  // Auto-load next chunk when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleCount >= matches.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((c) => Math.min(c + CHUNK_SIZE, matches.length));
        }
      },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, matches.length]);

  // Während der Suche nicht auf fünf Zeilen einklappen: Treffer sollen sichtbar sein.
  const isCollapsed = collapsed && !isSearching;
  const displayedEntries = isCollapsed
    ? matches.slice(0, 5)
    : matches.slice(0, visibleCount);
  const hasMore = !isCollapsed && visibleCount < matches.length;
  // Ohne Buchungen im Monat gibt es nichts zu durchsuchen; bleibt Suchtext
  // stehen (z.B. nach Monatswechsel), muss er sich aber leeren lassen.
  const showSearch = entriesSorted.length > 0 || isSearching;

  return (
    <Card style={{ marginTop: "var(--card-gap)" }}>
      <CardContent>
        <div className="hb-card-head hb-card-head--flush">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h3 className="hb-card-title">Buchungen</h3>
            <HbTooltip
              text="Ist ein Monat ausgewählt, zeigt die Tabelle nur dessen Buchungen. Änderst du beim Bearbeiten das Datum auf einen anderen Monat, verschwindet die Buchung hier und erscheint in jenem Monat."
              placement="right"
            />
          </div>
          {showSearch ? (
            <div className="hb-search-field hb-entries-search">
              <span className="hb-search-icon"><IconSearch width={16} height={16} /></span>
              <input
                ref={searchInputRef}
                className={`hb-input${query ? " hb-input--clearable" : ""}`}
                type="search"
                placeholder="Notiz, Betrag oder Kategorie suchen…"
                aria-label="Buchungen durchsuchen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    setQuery("");
                  }
                }}
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  className="hb-icon-btn hb-icon-btn--subtle hb-search-clear"
                  onClick={clearSearch}
                  aria-label="Suche leeren"
                  title="Suche leeren"
                >
                  <IconClose width={14} height={14} />
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="hb-info-pills">
            <span className="hb-info-pill">
              {isSearching
                ? `${matches.length} von ${entriesSorted.length} Einträgen`
                : `${entriesSorted.length} Einträge`}
            </span>
            {monthLabel
              ? monthLabel.split(" · ").map((part, i) => (
                  <span key={i} className="hb-info-pill">{part}</span>
                ))
              : null}
          </div>
        </div>

        {entriesSorted.length > 0 && matches.length === 0 ? (
          <div className="hb-empty">
            <div className="hb-empty-icon"><IconSearch /></div>
            <div className="hb-empty-title">Keine Treffer</div>
            <div className="hb-empty-text">
              Keine Buchung passt zu „{query.trim()}“{monthFilter ? ` in ${monthLabel.split(" · ")[0]}` : ""}.
            </div>
            {monthFilter && onMonthFilterChange ? (
              <Button variant="outline" onClick={() => onMonthFilterChange("")}>
                In allen Monaten suchen
              </Button>
            ) : (
              <Button variant="outline" onClick={clearSearch}>
                Suche leeren
              </Button>
            )}
          </div>
        ) : entriesSorted.length === 0 ? (
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

                  // Einnahme/Ausgabe: Vorzeichen direkt am Betrag („−CHF 200.00“),
                  // wie es formatCurrency für negative Werte schreibt.
                  // Transfer/Entnahme: Richtungspfeil mit schmalem geschütztem
                  // Leerzeichen (U+202F), wie in den Investment-Transaktionen.
                  let typeLabel = "Ausgabe";
                  let sign = "−";
                  let arrow = null;
                  let colorClass = "hb-bad";

                  if (isIncome) {
                    typeLabel = "Einnahme";
                    sign = "+";
                    colorClass = "hb-ok";
                  } else if (isTransfer) {
                    typeLabel = "Transfer";
                    arrow = "→";
                    colorClass = "hb-transfer";
                  } else if (isWithdrawal) {
                    typeLabel = "Entnahme";
                    arrow = "↓";
                    colorClass = "hb-withdrawal";
                  }

                  const amountText = fmt(Number(e.amount || 0));

                  return (
                    <tr key={e.id}>
                      <td className="hb-col-date">{formatDateDE(e.date)}</td>
                      <td className="hb-col-type">{typeLabel}</td>
                      <td className="hb-col-category">
                        {highlight(getEntryCategoryName(e, expenseCategories, incomeCategories, transferCategories), highlightPattern) || "—"}
                      </td>
                      <td className="hb-col-note">{highlight(e.note, highlightPattern) || "—"}</td>
                      <td className={`hb-col-amount hb-right ${colorClass}`}>
                        {arrow ? (
                          <>
                            <span aria-hidden="true">{arrow}</span>
                            {" "}{amountText}
                          </>
                        ) : (
                          `${sign}${amountText}`
                        )}
                      </td>
                      <td className="hb-col-actions">
                        <div className="hb-actions hb-actions-hover">
                          <button
                            type="button"
                            className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                            onClick={() => startEdit(e)}
                            title="Bearbeiten"
                            aria-label="Bearbeiten"
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle hb-icon-btn--danger"
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

            {isCollapsed && matches.length > 5 && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <Button variant="outline" onClick={() => setCollapsed(false)}>
                  Weitere {matches.length - 5} anzeigen
                </Button>
              </div>
            )}

            {!isCollapsed && hasMore && (
              <div ref={sentinelRef} style={{ marginTop: 12, textAlign: "center" }}>
                <span className="hb-muted">
                  {visibleCount} von {matches.length} Einträgen geladen…
                </span>
              </div>
            )}

            {!collapsed && !isSearching && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <Button variant="outline" onClick={() => setCollapsed(true)}>
                  Weniger anzeigen
                </Button>
              </div>
            )}


          </div>
        )}
      </CardContent>
    </Card>
  );
}
