import React, { useMemo, useState } from "react";
import EditDialog from "./EditDialog.jsx";
import { HierarchicalCategoryPicker } from "./HierarchicalCategoryPicker.jsx";
import PurposeSelect from "./PurposeSelect.jsx";
import { useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { parseAmount } from "../utils/formatUtils.js";
import { TEMPLATE_NAME_MAX } from "../utils/entryTemplateUtils.js";
import { EMPTY_ARRAY } from "../utils/constants.js";
import {
  getPurposesForPot,
  getTransferCategoryOptions,
  purposeForPot,
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

const isPotKind = (kind) => kind === "transfer" || kind === "withdrawal";

// Ein Zweck gehört genau einem Topf: der gewählte muss zum Topf passen.
// „Ohne Sparposition" bleibt stehen; mit `suggest` (Topf gewechselt, frisch
// auf Transfer/Entnahme gewechselt) wird die erste Sparposition vorgeschlagen.
function withPotPurpose(draft, transferCategories, suggest = false) {
  if (!isPotKind(draft.kind)) return draft;
  const id = purposeForPot(transferCategories, draft.potId, draft.transferCategoryId, { suggest });
  return id === draft.transferCategoryId ? draft : { ...draft, transferCategoryId: id };
}

function draftFromTemplate(template, { pots }) {
  if (!template) {
    return {
      ...EMPTY_DRAFT,
      potId: pots[0]?.id || "",
    };
  }
  // Ein gelöschter Zweck bleibt stehen und erscheint als eigene Option; ohne
  // Zweck steht „Ohne Sparposition".
  return {
    name: template.name || "",
    kind: template.kind || "expense",
    amount: template.amount == null ? "" : String(template.amount),
    note: template.note || "",
    categoryId: template.categoryId || null,
    subcategoryId: template.subcategoryId || null,
    transferCategoryId: template.transferCategoryId || "",
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
    draftFromTemplate(template, { pots })
  );

  // Draft beim Öffnen aus der Vorlage ableiten — aus dem open/template-Übergang
  // statt via Effekt (vermeidet set-state-in-effect).
  const [prevKey, setPrevKey] = useState(open ? template?.id ?? "__new__" : null);
  const key = open ? template?.id ?? "__new__" : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) setDraft(draftFromTemplate(template, { pots }));
  }

  const isTransferKind = isPotKind(draft.kind);
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
    // Eine Transfer-Vorlage ohne Topf wäre wertlos; die Sparposition ist
    // optional („Ohne Sparposition").
    if (isTransferKind && !draft.potId) return false;
    return true;
  }, [draft, nameError, isTransferKind]);

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
          transferCategoryId: isPotKind(kind) ? d.transferCategoryId : "",
          potId: isPotKind(kind) ? d.potId || pots[0]?.id || "" : "",
        },
        transferCategories,
        !isPotKind(d.kind)
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
              className={`hb-input${nameError ? " hb-input--invalid" : ""}`}
              style={{ width: "100%", minWidth: 0 }}
              type="text"
              maxLength={TEMPLATE_NAME_MAX}
              placeholder="z.B. Wocheneinkauf"
              value={draft.name}
              aria-invalid={nameError ? "true" : undefined}
              aria-describedby={nameError ? "hb-tpl-name-error" : undefined}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
            {nameError && <div id="hb-tpl-name-error" className="hb-field-error">{nameError}</div>}
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
              <div className="hb-label">{draft.kind === "transfer" ? "In Topf" : "Aus Topf"}</div>
              <select
                className="hb-input"
                value={draft.potId}
                onChange={(e) =>
                  // Bewusst gewähltes „Ohne" bleibt beim Topfwechsel stehen.
                  setDraft((d) =>
                    withPotPurpose({ ...d, potId: e.target.value }, transferCategories, Boolean(d.transferCategoryId))
                  )
                }
              >
                {pots.length === 0 && <option value="">Kein Topf vorhanden</option>}
                {pots.map((pot) => (
                  <option key={pot.id} value={pot.id}>{pot.name}</option>
                ))}
              </select>
            </div>
            {/* Nach dem Topf: die Auswahl hängt an ihm. */}
            <PurposeSelect
              value={draft.transferCategoryId}
              options={getTransferCategoryOptions(allTransferCategories, draft.transferCategoryId, potPurposes)}
              onChange={(id) => setDraft((d) => ({ ...d, transferCategoryId: id }))}
            />
          </>
        )}
      </div>
    </EditDialog>
  );
}
