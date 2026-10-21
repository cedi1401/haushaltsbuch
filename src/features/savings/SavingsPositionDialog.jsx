import React, { useMemo, useState } from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { AlertBar, Button, RangeTabs } from "../../components/ui.jsx";
import { HbDatePicker } from "../../components/HbDatePicker.jsx";
import HbTooltip from "../../components/HbTooltip.jsx";
import CategoryFlyout from "../../components/CategoryFlyout.jsx";
import TagInputField from "../../components/TagInputField.jsx";
import TrendToggle from "../../components/TrendToggle.jsx";
import { parseAmount } from "../../utils/formatUtils.js";
import { fixedCostKind } from "../../utils/hbUtils.js";
import { monthlyRate } from "../../utils/fixedCostUtils.js";
import {
  findTransferCategoryByName,
  hasPurposeRate,
  MAX_TRANSFER_NAME_LENGTH,
  purposeHasEntries,
  isReservedPurposeName,
  NO_PURPOSE_LABEL,
} from "../../utils/transferCategoryUtils.js";
import { useFmt, useBaseCurrency } from "../../contexts/CurrencyContext.jsx";
import { RULE_LABEL } from "./savingsColumns.jsx";

const RULE_OPTIONS = ["free", "reserve", "goal"].map((value) => ({ value, label: RULE_LABEL[value] }));

const RULE_HELP = {
  free: "Freies Sparen ohne Termin und ohne Ziel. Die Rate ist optional; das Geld bleibt im Topf, bis du es brauchst.",
  reserve: "Spart auf eine wiederkehrende Rechnung: Der Rechnungsbetrag wird über den Turnus verteilt, gebucht wird monatlich der anteilige Betrag.",
  goal: "Spart einmalig auf einen Zielbetrag, optional bis zu einer Deadline. Ist das Ziel erreicht, schließt du es ab.",
};

// Beim Anlegen nennt der Titel die gewählte Art. Beim Bearbeiten bleibt er
// neutral, weil sich die Art dort wechseln lässt.
const CREATE_TITLE = {
  free: "Neue freie Rücklage",
  reserve: "Neue Rückstellung",
  goal: "Neues Sparziel",
};

// „Monatlich" fehlt bewusst: Bei Turnus 1 wäre die Rate der volle
// Rechnungsbetrag, angespart würde nie. Das ist eine Rücklage.
const TURNUS_OPTIONS = [
  { value: "3", label: "Quartalsweise" },
  { value: "6", label: "Halbjährlich" },
  { value: "12", label: "Jährlich" },
  { value: "24", label: "Alle 2 Jahre" },
  { value: "36", label: "Alle 3 Jahre" },
];

/** Der Katalog, ergänzt um einen Bestandswert, den er nicht führt. */
function turnusOptionsFor(turnus) {
  if (!turnus || TURNUS_OPTIONS.some((o) => o.value === String(turnus))) return TURNUS_OPTIONS;
  const label = turnus === 1 ? "Monatlich" : `Alle ${turnus} Monate`;
  return [...TURNUS_OPTIONS, { value: String(turnus), label: `${label} (Bestandswert)` }];
}

function draftFrom(purpose, { defaultPotId, defaultRule, defaultGroupId }) {
  const rateText = (v) => (Number(v) > 0 ? String(v) : "");
  return {
    rule: purpose?.rule || defaultRule || "free",
    name: purpose?.name || "",
    potId: purpose?.potId || defaultPotId || "",
    groupId: purpose ? purpose.groupId || null : defaultGroupId || null,
    tags: purpose?.tags || [],
    showInOverview: purpose?.showInOverview === true,
    monthlyRate: rateText(purpose?.monthlyRate),
    amount: purpose?.rule === "reserve" ? String(purpose.amount ?? "") : "",
    turnus: purpose?.rule === "reserve" ? String(purpose.turnus ?? "12") : "12",
    faelligkeit: purpose?.rule === "reserve" ? purpose.faelligkeit || "" : "",
    categoryId: purpose?.rule === "reserve" ? purpose.categoryId || null : null,
    subcategoryId: purpose?.rule === "reserve" ? purpose.subcategoryId || null : null,
    targetAmount: purpose?.rule === "goal" ? String(purpose.targetAmount ?? "") : "",
    deadline: purpose?.rule === "goal" ? purpose.deadline || "" : "",
  };
}

function makeCopyName(baseName, transferCategories) {
  const taken = new Set(
    (transferCategories || []).filter((c) => !c.deleted).map((c) => (c.name || "").trim())
  );
  const first = `${baseName} (Kopie)`;
  if (!taken.has(first)) return first;
  let n = 2;
  while (taken.has(`${baseName} (Kopie ${n})`)) n += 1;
  return `${baseName} (Kopie ${n})`;
}

// Optionaler Betrag: leer ist gültig (= keine Rate), sonst eine Zahl > 0.
function optionalAmount(text) {
  if (!String(text).trim()) return { valid: true, value: null };
  const n = parseAmount(text);
  return { valid: Number.isFinite(n) && n > 0, value: n };
}

/**
 * Anlegen und Bearbeiten einer Sparposition — ein Dialog für alle drei Arten.
 *
 * Die Art lässt sich auch beim Bearbeiten wechseln: Der Zweck bleibt derselbe
 * (gleiche ID, gleiche Buchungen), nur seine Regel ändert sich. Die Felder der
 * nicht gewählten Arten bleiben bis zum Speichern im Entwurf stehen, damit ein
 * versehentlicher Wechsel nichts verliert. Gespeichert wird über
 * `applySavingsFields` (transferCategoryUtils).
 *
 * Der Parent rendert den Dialog mit einem `key` je Öffnung neu — der Entwurf
 * entsteht so einmal aus den Props (`initialDraft` oder `purpose`), ohne Effekt
 * zum Zurücksetzen.
 */
export default function SavingsPositionDialog({
  open,
  purpose,
  initialDraft,
  duplicateOf,
  defaultPotId,
  defaultRule,
  defaultGroupId,
  knownTags,
  pots,
  transferCategories,
  expenseCategories,
  fixedCostGroups,
  entries,
  onClose,
  onSave,
  onUseExisting,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const [draft, setDraft] = useState(() => {
    if (initialDraft) return initialDraft;
    // Kopie: alle Werte des Originals, nur mit freiem „(Kopie)“-Namen
    if (duplicateOf) {
      return { ...draftFrom(duplicateOf, {}), name: makeCopyName(duplicateOf.name || "", transferCategories) };
    }
    return draftFrom(purpose, { defaultPotId, defaultRule, defaultGroupId });
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const isEdit = Boolean(purpose);
  const isDuplicate = !isEdit && Boolean(duplicateOf);

  const groupOptions = useMemo(
    () =>
      (fixedCostGroups || [])
        .filter((g) => fixedCostKind(g) === "transfer")
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [fixedCostGroups]
  );

  // Der Topf einer Sparposition mit Buchungen steht fest — ein Wechsel ließe die
  // bisherigen Buchungen im alten Topf zurück.
  const potLocked = isEdit && purposeHasEntries(entries, purpose.id);

  // Namen sind über alle Sparpositionen eindeutig. Trifft ein neuer Name eine
  // Rücklage ohne Rate im selben Topf, bietet der Dialog an, sie zu verwenden —
  // ausdrücklich per Button statt still beim Speichern.
  const sameName = draft.name.trim()
    ? findTransferCategoryByName(transferCategories, draft.name, { excludeId: purpose?.id })
    : null;
  const reusable =
    !isEdit && sameName && sameName.rule === "free" && !hasPurposeRate(sameName) &&
    sameName.potId === draft.potId
      ? sameName
      : null;
  let nameError = null;
  if (draft.name.trim().length > MAX_TRANSFER_NAME_LENGTH) {
    nameError = `Der Name ist zu lang (max. ${MAX_TRANSFER_NAME_LENGTH} Zeichen).`;
  } else if (isReservedPurposeName(draft.name)) {
    nameError = `„${NO_PURPOSE_LABEL}“ ist für Geld ohne Sparposition reserviert.`;
  } else if (sameName && !reusable) {
    nameError =
      sameName.potId !== draft.potId
        ? "Es gibt bereits eine Sparposition mit diesem Namen, aber in einem anderen Topf."
        : "Es gibt bereits eine Sparposition mit diesem Namen.";
  }

  // Regelabhängige Prüfungen
  const rate = optionalAmount(draft.monthlyRate);
  const amount = parseAmount(draft.amount);
  const turnus = Number(draft.turnus) || null;
  const reserveRate =
    draft.rule === "reserve" && Number.isFinite(amount) && amount > 0 && turnus
      ? monthlyRate({ kind: "transfer", amount, turnus })
      : null;
  const target = parseAmount(draft.targetAmount);

  let ruleValid;
  if (draft.rule === "reserve") {
    ruleValid = reserveRate !== null && reserveRate >= 0.01 && !!draft.faelligkeit;
  } else if (draft.rule === "goal") {
    ruleValid = Number.isFinite(target) && target > 0 && rate.valid;
  } else {
    ruleValid = rate.valid;
  }
  // Nur Sparpositionen mit Rate stehen in den Fixkosten und damit im Trend.
  const hasRate = draft.rule === "reserve" || (rate.valid && rate.value !== null);
  const canSave = !!draft.name.trim() && !nameError && !reusable && !!draft.potId && ruleValid;

  function handleSave() {
    if (!canSave) return;
    onSave({
      rule: draft.rule,
      name: draft.name.trim(),
      potId: draft.potId,
      groupId: draft.groupId,
      monthlyRate: rate.value,
      amount,
      turnus,
      faelligkeit: draft.faelligkeit || null,
      categoryId: draft.categoryId,
      subcategoryId: draft.subcategoryId,
      targetAmount: target,
      deadline: draft.deadline || null,
      tags: draft.tags,
      showInOverview: hasRate && draft.showInOverview,
    });
  }

  return (
    <EditDialog
      open={open}
      title={isEdit ? "Sparposition bearbeiten" : isDuplicate ? "Sparposition duplizieren" : CREATE_TITLE[draft.rule]}
      onClose={onClose}
      onSave={handleSave}
      canSave={canSave}
      saveLabel={isEdit ? "Speichern" : isDuplicate ? "Duplizieren" : "Erstellen"}
      size="medium"
      // Ohne das klemmt `.hb-modal-body` das Kalender-Popover ab.
      bodyScroll={false}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
        <div className="hb-field">
          <div className="hb-label">Art</div>
          <RangeTabs
            options={RULE_OPTIONS}
            value={draft.rule}
            onChange={(rule) => set({ rule })}
            ariaLabel="Art der Sparposition"
            size="md"
            full
          />
          <div className="hb-field-hint">{RULE_HELP[draft.rule]}</div>
        </div>

        <div className="hb-two hb-two--dialog" style={{ width: "100%" }}>
          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className={`hb-input${nameError ? " hb-input--invalid" : ""}`}
              type="text"
              placeholder="z.B. Steuern, Notgroschen, Velo"
              value={draft.name}
              aria-invalid={nameError ? "true" : undefined}
              aria-describedby={nameError ? "hb-savings-name-error" : undefined}
              onChange={(e) => set({ name: e.target.value })}
              autoFocus
            />
            {nameError && <div id="hb-savings-name-error" className="hb-field-error">{nameError}</div>}
          </div>
          <div className="hb-field">
            <div className="hb-label">Topf</div>
            <select
              className="hb-input"
              value={draft.potId}
              disabled={potLocked}
              onChange={(e) => set({ potId: e.target.value })}
            >
              {pots.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {potLocked && (
              <div className="hb-field-hint">
                Die Sparposition hat schon Buchungen in diesem Topf, der Topf steht deshalb fest.
              </div>
            )}
          </div>
        </div>

        {reusable && (
          <div className="hb-infobar hb-infobar--dialog" role="status">
            <div className="hb-infobar-content">
              <div className="hb-infobar-message">
                Die Rücklage „{reusable.name}“ gibt es in diesem Topf schon. Verwende sie,
                statt eine zweite anzulegen — ihre Buchungen zählen dann mit.
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onUseExisting?.(reusable, draft)}>
              Bestehende verwenden
            </Button>
          </div>
        )}

        {draft.rule === "reserve" && (
          <>
            <div className="hb-two hb-two--dialog" style={{ width: "100%" }}>
              <div className="hb-field">
                <div className="hb-label">Rechnungsbetrag ({baseCurrency})</div>
                <input
                  className="hb-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="z.B. 1200.00"
                  value={draft.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
              </div>
              <div className="hb-field">
                <div className="hb-label">Turnus</div>
                <select
                  className="hb-input"
                  value={draft.turnus}
                  onChange={(e) => set({ turnus: e.target.value })}
                >
                  {turnusOptionsFor(Number(draft.turnus)).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {reserveRate !== null && reserveRate < 0.01 ? (
              <div className="hb-field-error">
                Der Betrag ergibt weniger als {fmt(0.01)} pro Monat — erhöhe ihn oder verkürze
                den Turnus.
              </div>
            ) : reserveRate !== null ? (
              <div className="hb-field-hint">
                Ergibt <strong>{fmt(reserveRate)}</strong> pro Monat — diesen Betrag bucht die
                Fixkosten-Ansicht monatlich in den Topf.
              </div>
            ) : null}
          </>
        )}

        {draft.rule === "goal" && (
          <div className="hb-two hb-two--dialog" style={{ width: "100%" }}>
            <div className="hb-field">
              <div className="hb-label">Zielbetrag ({baseCurrency})</div>
              <input
                className="hb-input"
                type="text"
                inputMode="decimal"
                placeholder="z.B. 10000"
                value={draft.targetAmount}
                onChange={(e) => set({ targetAmount: e.target.value })}
              />
            </div>
            <div className="hb-field">
              <div className="hb-label">Deadline (optional)</div>
              <HbDatePicker
                value={draft.deadline}
                onChange={(v) => set({ deadline: v })}
                placeholder="Kein Enddatum"
                clearable
              />
            </div>
          </div>
        )}

        <div className="hb-two hb-two--dialog" style={{ width: "100%" }}>
          {draft.rule !== "reserve" ? (
            <div className="hb-field">
              <div className="hb-label">Monatsrate (optional, {baseCurrency})</div>
              <input
                className="hb-input"
                type="text"
                inputMode="decimal"
                placeholder="Keine feste Rate"
                value={draft.monthlyRate}
                aria-invalid={rate.valid ? undefined : "true"}
                onChange={(e) => set({ monthlyRate: e.target.value })}
              />
              <div className="hb-field-hint">
                Mit Rate erscheint die Sparposition in den Fixkosten unter „Sparraten“ und lässt
                sich dort monatlich buchen.
              </div>
            </div>
          ) : (
            // Ein Datum braucht keine volle Dialogbreite: die Fälligkeit teilt
            // sich die Zeile mit der Gruppe, die Erklärung steckt im Tooltip.
            <div className="hb-field">
              <div className="hb-label hb-title-with-help">
                Nächste Fälligkeit
                <HbTooltip
                  size={14}
                  text="Wann die Rechnung das nächste Mal fällig wird — nicht die letzte Zahlung. Der Termin wiederholt sich im Turnus, auch wenn eine Rechnung einmal verspätet kommt."
                />
              </div>
              <HbDatePicker
                clearable
                value={draft.faelligkeit}
                onChange={(v) => set({ faelligkeit: v })}
              />
            </div>
          )}
          <div className="hb-field">
            <div className="hb-label">Gruppe</div>
            <select
              className="hb-input"
              value={draft.groupId || ""}
              onChange={(e) => set({ groupId: e.target.value || null })}
            >
              <option value="">Sonstige</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <div className="hb-field-hint">Gliedert die Sparraten in den Fixkosten.</div>
          </div>
        </div>

        {draft.rule === "reserve" && (
          <div className="hb-field">
            <div className="hb-label">Kategorie (optional)</div>
            <CategoryFlyout
              value={{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId }}
              categories={expenseCategories}
              onChange={({ categoryId, subcategoryId }) => set({ categoryId, subcategoryId })}
            />
            <div className="hb-field-hint">
              Die monatliche Rate erscheint im Ausgaben-Diagramm unter dieser Kategorie.
            </div>
          </div>
        )}

        {draft.rule === "reserve" && !draft.faelligkeit && (
          <AlertBar
            tone="warning"
            message="Trage die nächste Fälligkeit ein. Ohne diesen Termin lässt sich der Turnus nicht berechnen, und die Rückstellung kann nicht gespeichert werden."
          />
        )}

        <TagInputField
          tags={draft.tags}
          onChange={(tags) => set({ tags })}
          knownTags={knownTags}
        />

        {hasRate && (
          <TrendToggle
            checked={draft.showInOverview}
            onChange={(showInOverview) => set({ showInOverview })}
            subject="Die Sparrate"
          />
        )}
      </div>
    </EditDialog>
  );
}
