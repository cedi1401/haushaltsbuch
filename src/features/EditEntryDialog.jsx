import React from "react";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";

export default function EditEntryDialog({
  open,
  onClose,
  onSave,
  canSave,
  editDraft,
  setEditDraft,
  pots,
  expenseCategories,
  incomeCategories,
  transferCategories,
  withdrawalCategories,
}) {
  return (
    <EditDialog
      open={open}
      title="Eintrag bearbeiten"
      onClose={onClose}
      onSave={onSave}
      canSave={canSave}
    >
      <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="hb-field">
          <div className="hb-label">Datum</div>
          <input
            className="hb-input"
            type="date"
            value={editDraft.date}
            onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))}
          />
        </div>

        <div className="hb-field">
          <div className="hb-label">Art</div>
          <select
            className="hb-input"
            value={editDraft.kind}
            onChange={(e) => setEditDraft((d) => ({ ...d, kind: e.target.value }))}
          >
            <option value="income">Einnahme</option>
            <option value="expense">Ausgabe</option>
            <option value="withdrawal">Entnahme</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

        {editDraft.kind === "expense" ? (
          <HierarchicalCategoryPicker
            label="Kategorie"
            value={{ categoryId: editDraft.categoryId, subcategoryId: editDraft.subcategoryId }}
            categories={expenseCategories}
            onChange={({ categoryId: cid, subcategoryId: sid }) =>
              setEditDraft((d) => ({ ...d, categoryId: cid, subcategoryId: sid }))
            }
          />
        ) : editDraft.kind === "income" ? (
          <HierarchicalCategoryPicker
            label="Kategorie"
            value={{ categoryId: editDraft.categoryId, subcategoryId: editDraft.subcategoryId }}
            categories={incomeCategories}
            onChange={({ categoryId: cid, subcategoryId: sid }) =>
              setEditDraft((d) => ({ ...d, categoryId: cid, subcategoryId: sid }))
            }
          />
        ) : editDraft.kind === "transfer" ? (
          <div className="hb-field">
            <div className="hb-label">Transfer-Zweck</div>
            <select
              className="hb-input"
              value={editDraft.category || ""}
              onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
            >
              {transferCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        ) : editDraft.kind === "withdrawal" ? (
          <div className="hb-field">
            <div className="hb-label">Transfer-Zweck</div>
            <select
              className="hb-input"
              value={editDraft.category || ""}
              onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
            >
              {withdrawalCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        ) : null}

        {editDraft.kind === "expense" && (
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

        {(editDraft.kind === "transfer" || editDraft.kind === "withdrawal") && (
          <div className="hb-field">
            <div className="hb-label">{editDraft.kind === "transfer" ? "In Topf" : "Aus Topf"}</div>
            <select
              className="hb-input"
              value={editDraft.potId}
              onChange={(e) => setEditDraft((d) => ({ ...d, potId: e.target.value }))}
            >
              {pots.map((pot) => (
                <option key={pot.id} value={pot.id}>{pot.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="hb-field">
          <div className="hb-label">Betrag</div>
          <input
            className="hb-input"
            type="text"
            inputMode="decimal"
            placeholder="z.B. 12.50"
            value={editDraft.amount}
            onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))}
          />
          <div className="hb-muted" style={{ marginTop: 6 }}>
            Komma geht auch (z.B. 12,50).
          </div>
        </div>

        <div className="hb-field" style={{ gridColumn: "1 / -1" }}>
          <div className="hb-label">Notiz</div>
          <input
            className="hb-input"
            type="text"
            placeholder="z.B. Migros, Abo, ..."
            value={editDraft.note}
            onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
          />
        </div>
      </div>

      {!canSave ? (
        <div style={{ marginTop: 10, color: "var(--red)", fontSize: 12 }}>
          Bitte Datum & einen gültigen Betrag (&gt; 0) setzen.
        </div>
      ) : null}
    </EditDialog>
  );
}
