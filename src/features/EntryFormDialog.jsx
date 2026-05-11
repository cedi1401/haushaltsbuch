import React from "react";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";

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
}) {
  const { kind, date, amount, potId, category, note, categoryId, subcategoryId } = draft;

  return (
    <EditDialog
      open={open}
      title="Buchung hinzufügen"
      onClose={onClose}
      onSave={onSave}
      canSave={canSave}
      saveLabel="Hinzufügen"
      size="wide"
    >
      <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <input className="hb-input" type="date" value={date} onChange={(e) => setField("date", e.target.value)} />
        </div>

        <div className="hb-field">
          <div className="hb-label">Betrag</div>
          <input
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
        <div style={{ marginTop: 16 }}>
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
        <div style={{ marginTop: 16 }}>
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
        <div style={{ marginTop: 16 }}>
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
    </EditDialog>
  );
}
