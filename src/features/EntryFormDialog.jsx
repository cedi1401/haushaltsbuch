import React, { useMemo, useRef } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
import { getTemplateColor } from "../utils/entryTemplateUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { EMPTY_ARRAY } from "../utils/constants.js";

const KIND_LABELS = {
  income: "Einnahme",
  expense: "Ausgabe",
  withdrawal: "Entnahme",
  transfer: "Transfer",
};

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
  templates = EMPTY_ARRAY,
  appliedTemplateId = null,
  onApplyTemplate,
}) {
  const { kind, date, amount, potId, category, note, categoryId, subcategoryId } = draft;
  const fmt = useFmt();
  const amountInputRef = useRef(null);

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

  const templateCtx = { expenseCategories, incomeCategories };

  function templateTitle(tpl) {
    const parts = [KIND_LABELS[tpl.kind] || "Ausgabe"];
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
        <div className="hb-tpl-bar" role="group" aria-label="Buchungsvorlagen">
          <span className="hb-tpl-bar-label">Aus Vorlage</span>
          {sortedTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className={`hb-tpl-chip${tpl.id === appliedTemplateId ? " hb-tpl-chip--active" : ""}`}
              aria-pressed={tpl.id === appliedTemplateId ? true : undefined}
              title={templateTitle(tpl)}
              onClick={() => handleApplyTemplate(tpl)}
            >
              <span className="hb-cat-dot" style={{ background: getTemplateColor(tpl, templateCtx) }} />
              <span className="hb-tpl-chip-name">{tpl.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="hb-two hb-two--dialog" style={{ gap: 16 }}>
        <div className="hb-field" style={{ gridColumn: "1 / -1" }}>
          <div className="hb-label">Art</div>
          <select className="hb-input" value={kind} onChange={(e) => setField("kind", e.target.value)}>
            <option value="income">Einnahme</option>
            <option value="expense">Ausgabe</option>
            <option value="withdrawal">Entnahme</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

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
        </div>

        {kind === "expense" && (
          <div className="hb-field">
            <div className="hb-label">Quelle</div>
            <input
              className="hb-input"
              type="text"
              value="Monatsbudget"
              disabled
              style={{ background: "var(--hover-bg)", color: "var(--muted)" }}
            />
          </div>
        )}

        {kind === "withdrawal" && (
          <div className="hb-field">
            <div className="hb-label">Aus Topf</div>
            <select className="hb-input" value={potId} onChange={(e) => setField("potId", e.target.value)}>
              {pots.map((pot) => (
                <option key={pot.id} value={pot.id}>{pot.name}</option>
              ))}
            </select>
          </div>
        )}

        {kind === "withdrawal" && (
          <div className="hb-field">
            <div className="hb-label">Transfer-Zweck</div>
            <select className="hb-input" value={category} onChange={(e) => setField("category", e.target.value)}>
              {availableWithdrawalCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}

        {kind === "transfer" && (
          <div className="hb-field">
            <div className="hb-label">In Topf</div>
            <select className="hb-input" value={potId} onChange={(e) => setField("potId", e.target.value)}>
              {pots.map((pot) => (
                <option key={pot.id} value={pot.id}>{pot.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="hb-field" style={{ gridColumn: "1 / -1" }}>
          <div className="hb-label">Notiz (optional)</div>
          <input
            className="hb-input"
            type="text"
            placeholder="z.B. Migros, Abo, ..."
            value={note}
            onChange={(e) => setField("note", e.target.value)}
          />
        </div>
      </div>

      {kind === "expense" ? (
        <div className="hb-entry-form__tail" style={{ marginTop: 16 }}>
          <HierarchicalCategoryPicker
            label="Kategorie"
            value={{ categoryId, subcategoryId }}
            categories={expenseCategories}
            onChange={({ categoryId: cid, subcategoryId: sid }) => {
              setField("categoryId", cid);
              setField("subcategoryId", sid);
            }}
          />
        </div>
      ) : kind === "income" ? (
        <div className="hb-entry-form__tail" style={{ marginTop: 16 }}>
          <HierarchicalCategoryPicker
            label="Kategorie"
            value={{ categoryId, subcategoryId }}
            categories={incomeCategories}
            onChange={({ categoryId: cid, subcategoryId: sid }) => {
              setField("categoryId", cid);
              setField("subcategoryId", sid);
            }}
          />
        </div>
      ) : kind === "transfer" ? (
        <div className="hb-entry-form__tail" style={{ marginTop: 16 }}>
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
                style={{ marginTop: 6 }}
              >
                + Neuer Zweck
              </button>
            )}
          </div>
        </div>
      ) : null}

      {!canSave && amount ? (
        <div style={{ marginTop: 10, color: "var(--red)", fontSize: 12 }}>
          Bitte Datum & einen gültigen Betrag (&gt; 0) setzen.
        </div>
      ) : null}
      </div>
    </EditDialog>
  );
}
