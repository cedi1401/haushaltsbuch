import React, { useMemo, useRef, useSyncExternalStore } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
import { EntryKindSelector } from "../components/EntryKindSelector.jsx";
import { getTemplateColor } from "../utils/entryTemplateUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { EMPTY_ARRAY, ENTRY_KIND_LABELS } from "../utils/constants.js";

/*
  Vorlagen-Grid: feste Spaltenzahl statt auto-fill, damit JS und CSS dieselbe
  Anzahl kennen. Nur so lässt sich exakt auf zwei Reihen kürzen — der Rest
  wandert hinter die „+N weitere"-Ghost-Karte. Die Werte müssen mit den
  Media-Queries von .hb-tpl-card-grid übereinstimmen.
*/
const TPL_GRID_BREAKPOINTS = [
  { query: "(max-width: 560px)", cols: 2 },
  { query: "(max-width: 960px)", cols: 3 },
];
const TPL_GRID_DEFAULT_COLS = 4;
const TPL_GRID_ROWS = 2;

// Einmalig erzeugte MediaQueryLists — getSnapshot läuft bei jedem Render und
// soll dabei keine neuen Objekte anlegen.
let tplGridMediaQueries = null;
function getTplGridMediaQueries() {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  if (!tplGridMediaQueries) {
    tplGridMediaQueries = TPL_GRID_BREAKPOINTS.map((bp) => ({
      cols: bp.cols,
      mql: window.matchMedia(bp.query),
    }));
  }
  return tplGridMediaQueries;
}

function subscribeTplGridCols(onChange) {
  const queries = getTplGridMediaQueries();
  if (!queries) return () => {};
  queries.forEach(({ mql }) => mql.addEventListener("change", onChange));
  return () => queries.forEach(({ mql }) => mql.removeEventListener("change", onChange));
}

function getTplGridCols() {
  const queries = getTplGridMediaQueries();
  if (!queries) return TPL_GRID_DEFAULT_COLS;
  const hit = queries.find(({ mql }) => mql.matches);
  return hit ? hit.cols : TPL_GRID_DEFAULT_COLS;
}

export default function EntryFormDialog({
  open,
  onClose,
  onSave,
  canSave,
  draft,
  setField,
  pots,
  expenseCategories,
  incomeCategories,
  transferCategories,
  availableWithdrawalCategories,
  onOpenCategoryManager,
  onOpenTemplateManager,
  templates = EMPTY_ARRAY,
  appliedTemplateId = null,
  onApplyTemplate,
}) {
  const { kind, date, amount, potId, category, note, categoryId, subcategoryId } = draft;
  const fmt = useFmt();
  const amountInputRef = useRef(null);

  const gridCols = useSyncExternalStore(
    subscribeTplGridCols,
    getTplGridCols,
    () => TPL_GRID_DEFAULT_COLS
  );

  // Meistgenutzte Vorlagen zuerst; bei Gleichstand alphabetisch, damit die
  // Reihenfolge nicht bei jedem Render springt.
  const sortedTemplates = useMemo(
    () =>
      [...templates].sort(
        (a, b) =>
          (b.usageCount || 0) - (a.usageCount || 0) ||
          a.name.localeCompare(b.name, "de")
      ),
    [templates]
  );

  // Genau zwei Reihen. Passt nicht alles hinein, belegt die Ghost-Karte den
  // letzten Platz und führt in den Vorlagen-Manager.
  const capacity = gridCols * TPL_GRID_ROWS;
  const hasOverflow = sortedTemplates.length > capacity;
  const visibleTemplates = hasOverflow
    ? sortedTemplates.slice(0, capacity - 1)
    : sortedTemplates;
  const hiddenCount = sortedTemplates.length - visibleTemplates.length;

  const templateCtx = { expenseCategories, incomeCategories };

  function templateSummary(tpl) {
    const parts = [ENTRY_KIND_LABELS[tpl.kind] || "Ausgabe"];
    if (tpl.amount != null) parts.push(fmt(tpl.amount));
    else parts.push("Betrag jedes Mal neu");
    if (tpl.note) parts.push(tpl.note);
    return parts.join(" · ");
  }

  function handleApplyTemplate(tpl) {
    onApplyTemplate?.(tpl);
    // Ohne festen Betrag ist das Betragsfeld der nächste sinnvolle Schritt.
    if (tpl.amount == null) {
      requestAnimationFrame(() => amountInputRef.current?.focus());
    }
  }

  return (
    <EditDialog
      open={open}
      title="Buchung hinzufügen"
      onClose={onClose}
      onSave={onSave}
      canSave={canSave}
      saveLabel="Hinzufügen"
      size="medium"
      bodyScroll={false}
    >
      <div className="hb-entry-form">
      {sortedTemplates.length > 0 && (
        <section className="hb-tpl-picker">
          <div className="hb-tpl-picker-head">
            <span className="hb-tpl-picker-title">Vorlagen</span>
            <span className="hb-tpl-picker-hint">Ein Klick füllt das Formular aus</span>
          </div>
          <div className="hb-tpl-card-grid" role="group" aria-label="Buchungsvorlagen">
            {visibleTemplates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={`hb-tpl-card${tpl.id === appliedTemplateId ? " hb-tpl-card--active" : ""}`}
                aria-pressed={tpl.id === appliedTemplateId}
                aria-label={`${tpl.name} · ${templateSummary(tpl)}`}
                onClick={() => handleApplyTemplate(tpl)}
              >
                <span className="hb-tpl-card-name">
                  <span className="hb-cat-dot" style={{ background: getTemplateColor(tpl, templateCtx) }} />
                  <span className="hb-tpl-card-name-text">{tpl.name}</span>
                </span>
                <span className="hb-tpl-card-meta">
                  <span
                    className={`hb-tpl-card-amount${tpl.amount == null ? " hb-tpl-card-amount--open" : ""}`}
                  >
                    {tpl.amount != null ? fmt(tpl.amount) : "Betrag offen"}
                  </span>
                  <span>· {ENTRY_KIND_LABELS[tpl.kind] || "Ausgabe"}</span>
                </span>
              </button>
            ))}

            {hasOverflow && (
              <button
                type="button"
                className="hb-tpl-card hb-tpl-card--ghost"
                onClick={onOpenTemplateManager}
                disabled={!onOpenTemplateManager}
                aria-label={`${hiddenCount} weitere Vorlagen im Vorlagen-Manager anzeigen`}
              >
                <span className="hb-tpl-card-name">
                  <span className="hb-tpl-card-name-text">+{hiddenCount} weitere</span>
                </span>
                <span className="hb-tpl-card-meta">Alle Vorlagen verwalten</span>
              </button>
            )}
          </div>
        </section>
      )}

      <div className="hb-entry-form__panes">
        <div className="hb-entry-form__main">
          <div className="hb-field">
            <div className="hb-label">Art</div>
            <EntryKindSelector value={kind} onChange={(v) => setField("kind", v)} />
            {kind === "expense" && (
              <div className="hb-entry-form__hint">Quelle: Monatsbudget</div>
            )}
          </div>

          <div className="hb-two hb-two--dialog">
            <div className="hb-field">
              <div className="hb-label">Datum</div>
              <HbDatePicker value={date} onChange={(v) => setField("date", v)} />
            </div>

            <div className="hb-field">
              <div className="hb-label">Betrag</div>
              <input
                ref={amountInputRef}
                className="hb-input"
                type="text"
                inputMode="decimal"
                placeholder="z.B. 12.50"
                value={amount}
                onChange={(e) => setField("amount", e.target.value)}
              />
              <div className="hb-entry-form__field-hint">
                Komma geht auch (z.B. 12,50).
              </div>
            </div>
          </div>

          <div className="hb-field">
            <div className="hb-label">Notiz (optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Migros, Abo, ..."
              value={note}
              onChange={(e) => setField("note", e.target.value)}
            />
          </div>

          {/*
            Der Add-Dialog startet mit leerem Betrag — die Fehlermeldung erst ab
            der ersten Eingabe zeigen, statt den frisch geöffneten Dialog rot
            zu begrüßen. (Im Edit-Dialog liegt immer schon ein Wert vor.)
          */}
          {!canSave && amount ? (
            <div className="hb-entry-form__error">
              Bitte Datum &amp; einen gültigen Betrag (&gt; 0) setzen.
            </div>
          ) : null}

          {onOpenTemplateManager && (
            <div className="hb-entry-form__foot">
              <button type="button" className="hb-link-btn" onClick={onOpenTemplateManager}>
                Vorlagen verwalten
              </button>
            </div>
          )}
        </div>

        <div className="hb-entry-form__aside">
          {kind === "expense" ? (
            <HierarchicalCategoryPicker
              label="Kategorie"
              value={{ categoryId, subcategoryId }}
              categories={expenseCategories}
              onChange={({ categoryId: cid, subcategoryId: sid }) => {
                setField("categoryId", cid);
                setField("subcategoryId", sid);
              }}
            />
          ) : kind === "income" ? (
            <HierarchicalCategoryPicker
              label="Kategorie"
              value={{ categoryId, subcategoryId }}
              categories={incomeCategories}
              onChange={({ categoryId: cid, subcategoryId: sid }) => {
                setField("categoryId", cid);
                setField("subcategoryId", sid);
              }}
            />
          ) : kind === "withdrawal" ? (
            <>
              <div className="hb-field">
                <div className="hb-label">Aus Topf</div>
                <select className="hb-input" value={potId} onChange={(e) => setField("potId", e.target.value)}>
                  {pots.map((pot) => (
                    <option key={pot.id} value={pot.id}>{pot.name}</option>
                  ))}
                </select>
              </div>
              <div className="hb-field">
                <div className="hb-label">Transfer-Zweck</div>
                <select className="hb-input" value={category} onChange={(e) => setField("category", e.target.value)}>
                  {availableWithdrawalCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </>
          ) : kind === "transfer" ? (
            <>
              <div className="hb-field">
                <div className="hb-label">In Topf</div>
                <select className="hb-input" value={potId} onChange={(e) => setField("potId", e.target.value)}>
                  {pots.map((pot) => (
                    <option key={pot.id} value={pot.id}>{pot.name}</option>
                  ))}
                </select>
              </div>
              <div className="hb-field">
                <div className="hb-label">Transfer-Zweck</div>
                <select className="hb-input" value={category} onChange={(e) => setField("category", e.target.value)}>
                  {transferCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {onOpenCategoryManager && (
                  <button
                    type="button"
                    className="hb-link-btn"
                    onClick={onOpenCategoryManager}
                  >
                    + Neuer Zweck
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
      </div>
    </EditDialog>
  );
}
