import React, { useMemo, useState } from "react";
import EditDialog from "./EditDialog.jsx";
import { HierarchicalCategoryPicker } from "./HierarchicalCategoryPicker.jsx";
import { useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { parseAmount } from "../utils/formatUtils.js";
import { TEMPLATE_NAME_MAX } from "../utils/entryTemplateUtils.js";
import { EMPTY_ARRAY } from "../utils/constants.js";
import {
  getPurposesForPot,
  getTransferCategoryOptions,
  validTransferCategoryId,
} from "../utils/transferCategoryUtils.js";

const EMPTY_DRAFT = {
  name: "",
  kind: "expense",
  amount: "",
  note: "",
  categoryId: null,
  subcategoryId: null,
  transferCategoryId: "",
  potId: "",
};

// Ein Zweck gehört genau einem Topf: der gewählte muss zum Topf passen, sonst
// der erste des Topfs (oder keiner).
function withPotPurpose(draft, transferCategories) {
  if (draft.kind !== "transfer" && draft.kind !== "withdrawal") return draft;
  const choices = getPurposesForPot(transferCategories, draft.potId);
  if (choices.some((c) => c.id === draft.transferCategoryId)) return draft;
  return { ...draft, transferCategoryId: validTransferCategoryId(choices, draft.transferCategoryId) };
}

function draftFromTemplate(template, { transferCategories, pots }) {
  if (!template) {
    return {
      ...EMPTY_DRAFT,
      potId: pots[0]?.id || "",
    };
  }
  // Ein gelöschter Zweck bleibt stehen und erscheint als eigene Option.
  return {
    name: template.name || "",
    kind: template.kind || "expense",
    amount: template.amount == null ? "" : String(template.amount),
    note: template.note || "",
    categoryId: template.categoryId || null,
    subcategoryId: template.subcategoryId || null,
    transferCategoryId:
      template.transferCategoryId ||
      getPurposesForPot(transferCategories, template.potId || pots[0]?.id)[0]?.id ||
      "",
    potId: template.potId || pots[0]?.id || "",
  };
}

/**
 * Ein Dialog für Anlegen und Bearbeiten einer Buchungsvorlage — analog zu
 * FixedCostsView, das ebenfalls einen Dialog für beides nutzt.
 * Kein Datumsfeld: das Datum kommt beim Buchen immer aus dem Draft.
 * Kein Löschen: das macht der Kebab in der Manager-Zeile (sonst zwei Löschpfade).
 */
export default function EntryTemplateFormDialog({
  open,
  template,
  existingTemplates = EMPTY_ARRAY,
  expenseCategories = EMPTY_ARRAY,
  incomeCategories = EMPTY_ARRAY,
  transferCategories = EMPTY_ARRAY,
  allTransferCategories = transferCategories,
  pots = EMPTY_ARRAY,
  onClose,
  onSave,
}) {
  const baseCurrency = useBaseCurrency();
  const [draft, setDraft] = useState(() =>
    draftFromTemplate(template, { transferCategories, pots })
  );

  // Draft beim Öffnen aus der Vorlage ableiten — aus dem open/template-Übergang
  // statt via Effekt (vermeidet set-state-in-effect).
  const [prevKey, setPrevKey] = useState(open ? template?.id ?? "__new__" : null);
  const key = open ? template?.id ?? "__new__" : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) setDraft(draftFromTemplate(template, { transferCategories, pots }));
  }

  const isTransferKind = draft.kind === "transfer" || draft.kind === "withdrawal";
  const potPurposes = useMemo(
    () => getPurposesForPot(transferCategories, draft.potId),
    [transferCategories, draft.potId]
  );

  const nameError = useMemo(() => {
    const trimmed = draft.name.trim();
    if (!trimmed) return null; // leerer Name blockiert still über canSave
    if (trimmed.length > TEMPLATE_NAME_MAX)
      return `Name ist zu lang (max. ${TEMPLATE_NAME_MAX} Zeichen).`;
    const normalized = trimmed.toLocaleLowerCase("de");
    const isDuplicate = existingTemplates.some(
      (t) => t.id !== template?.id && (t.name || "").trim().toLocaleLowerCase("de") === normalized
    );
    if (isDuplicate) return "Eine Vorlage mit diesem Namen existiert bereits.";
    return null;
  }, [draft.name, existingTemplates, template?.id]);

  const canSave = useMemo(() => {
    if (!draft.name.trim() || nameError) return false;
    // Betrag ist optional — nur wenn etwas drinsteht, muss es gültig sein
    if (draft.amount.trim()) {
      const n = parseAmount(draft.amount);
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    // Eine Transfer-Vorlage ohne Topf wäre wertlos; ein Zweck ist Pflicht,
    // sobald der Topf welche hat.
    if (isTransferKind && !draft.potId) return false;
    if (isTransferKind && potPurposes.length > 0 && !draft.transferCategoryId) return false;
    return true;
  }, [draft, nameError, isTransferKind, potPurposes]);

  function handleSave() {
    if (!canSave) return;
    const amountText = draft.amount.trim();
    const numericAmount = amountText ? parseAmount(amountText) : null;
    onSave({
      ...(template?.id ? { id: template.id, usageCount: template.usageCount || 0 } : {}),
      name: draft.name.trim(),
      kind: draft.kind,
      amount: numericAmount,
      note: draft.note.trim(),
      categoryId: draft.categoryId,
      subcategoryId: draft.subcategoryId,
      transferCategoryId: draft.transferCategoryId || null,
      potId: draft.potId,
    });
  }

  function setKind(kind) {
    setDraft((d) =>
      withPotPurpose(
        {
          ...d,
          kind,
          // Kategoriefelder und Transferfelder schließen sich aus
          categoryId: kind === "income" ? "cat_einnahmen" : null,
          subcategoryId: null,
          transferCategoryId: kind === "transfer" || kind === "withdrawal" ? d.transferCategoryId : "",
          potId: kind === "transfer" || kind === "withdrawal" ? d.potId || pots[0]?.id || "" : "",
        },
        transferCategories
      )
    );
  }

  return (
    <EditDialog
      open={open}
      title={template ? "Vorlage bearbeiten" : "Neue Vorlage"}
      onClose={onClose}
      onSave={handleSave}
      canSave={canSave}
      saveLabel={template ? "Speichern" : "Erstellen"}
      size="medium"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, width: "100%" }}>
          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className="hb-input"
              style={{ width: "100%", minWidth: 0 }}
              type="text"
              maxLength={TEMPLATE_NAME_MAX}
              placeholder="z.B. Wocheneinkauf"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
            {nameError && (
              <div style={{ marginTop: 6, color: "var(--red)", fontSize: 12 }}>{nameError}</div>
            )}
          </div>
          <div className="hb-field">
            <div className="hb-label">Betrag ({baseCurrency})</div>
            <input
              className="hb-input"
              style={{ width: "100%", minWidth: 0 }}
              type="text"
              inputMode="decimal"
              placeholder="leer = jedes Mal neu"
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
            />
          </div>
        </div>

        <div className="hb-field">
          <div className="hb-label">Art</div>
          <select
            className="hb-input"
            value={draft.kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="income">Einnahme</option>
            <option value="expense">Ausgabe</option>
            <option value="withdrawal">Entnahme</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

        <div className="hb-field">
          <div className="hb-label">Notiz (optional)</div>
          <input
            className="hb-input"
            style={{ width: "100%", minWidth: 0 }}
            type="text"
            placeholder="z.B. Migros"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          />
        </div>

        {(draft.kind === "expense" || draft.kind === "income") && (
          <HierarchicalCategoryPicker
            label="Kategorie"
            value={{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId }}
            categories={draft.kind === "expense" ? expenseCategories : incomeCategories}
            onChange={({ categoryId, subcategoryId }) =>
              setDraft((d) => ({ ...d, categoryId, subcategoryId }))
            }
          />
        )}

        {isTransferKind && (
          <>
            <div className="hb-field">
              <div className="hb-label">Transfer-Zweck</div>
              <select
                className="hb-input"
                value={draft.transferCategoryId}
                onChange={(e) => setDraft((d) => ({ ...d, transferCategoryId: e.target.value }))}
              >
                {potPurposes.length === 0 && !draft.transferCategoryId && (
                  <option value="">Kein Zweck</option>
                )}
                {getTransferCategoryOptions(allTransferCategories, draft.transferCategoryId, potPurposes).map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="hb-field">
              <div className="hb-label">{draft.kind === "transfer" ? "In Topf" : "Aus Topf"}</div>
              <select
                className="hb-input"
                value={draft.potId}
                onChange={(e) =>
                  setDraft((d) => withPotPurpose({ ...d, potId: e.target.value }, transferCategories))
                }
              >
                {pots.length === 0 && <option value="">Kein Topf vorhanden</option>}
                {pots.map((pot) => (
                  <option key={pot.id} value={pot.id}>{pot.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </EditDialog>
  );
}
