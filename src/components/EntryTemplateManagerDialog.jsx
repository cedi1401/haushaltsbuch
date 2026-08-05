import React, { useMemo, useRef, useState } from "react";
import EditDialog from "./EditDialog.jsx";
import EntryTemplateFormDialog from "./EntryTemplateFormDialog.jsx";
import OverflowMenu from "./OverflowMenu.jsx";
import HbTooltip from "./HbTooltip.jsx";
import { Button } from "./ui.jsx";
import { useConfirm } from "./ConfirmDialog.jsx";
import { useToast } from "./toastContext.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { IconSearch, IconEdit, IconPlus, IconTemplate } from "./icons.jsx";
import {
  makeEntryTemplate,
  normalizeEntryTemplate,
  getTemplateIssues,
  getTemplateColor,
} from "../utils/entryTemplateUtils.js";
import { EMPTY_ARRAY } from "../utils/constants.js";

const KIND_LABELS = {
  income: "Einnahme",
  expense: "Ausgabe",
  withdrawal: "Entnahme",
  transfer: "Transfer",
};

export default function EntryTemplateManagerDialog({
  open,
  onClose,
  templates = EMPTY_ARRAY,
  expenseCategories = EMPTY_ARRAY,
  incomeCategories = EMPTY_ARRAY,
  transferCategories = EMPTY_ARRAY,
  pots = EMPTY_ARRAY,
  onUpdateTemplates,
}) {
  const fmt = useFmt();
  const { confirm } = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Fokus-Rückgabe nach Sub-Dialog und nach dem Löschen
  const editBtnRefs = useRef({});
  const createBtnRef = useRef(null);

  // Reset beim Schließen — abgeleitet aus dem open-Übergang statt via Effekt
  // (vermeidet set-state-in-effect und den zusätzlichen Render-Durchlauf).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setSearch("");
      setFormOpen(false);
      setEditTarget(null);
    }
  }

  const ctx = useMemo(
    () => ({ expenseCategories, incomeCategories, transferCategories, pots }),
    [expenseCategories, incomeCategories, transferCategories, pots]
  );

  const trimmedSearch = search.trim();
  const visibleTemplates = useMemo(() => {
    const sorted = [...templates].sort(
      (a, b) =>
        (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, "de")
    );
    if (!trimmedSearch) return sorted;
    const needle = trimmedSearch.toLocaleLowerCase("de");
    return sorted.filter(
      (t) =>
        (t.name || "").toLocaleLowerCase("de").includes(needle) ||
        (t.note || "").toLocaleLowerCase("de").includes(needle)
    );
  }, [templates, trimmedSearch]);

  function focusRow(templateId) {
    requestAnimationFrame(() => {
      const el = templateId ? editBtnRefs.current[templateId] : null;
      (el || createBtnRef.current)?.focus();
    });
  }

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(template) {
    setEditTarget(template);
    setFormOpen(true);
  }

  function closeForm() {
    const targetId = editTarget?.id || null;
    setFormOpen(false);
    setEditTarget(null);
    focusRow(targetId);
  }

  function handleSaveTemplate(fields) {
    if (fields.id) {
      const normalized = normalizeEntryTemplate(fields);
      if (!normalized) return;
      onUpdateTemplates(templates.map((t) => (t.id === normalized.id ? normalized : t)));
      toast.success("Vorlage gespeichert.");
    } else {
      const created = makeEntryTemplate(fields);
      if (!created) return;
      onUpdateTemplates([...templates, created]);
      toast.success("Vorlage angelegt.");
    }
    closeForm();
  }

  async function deleteTemplate(template) {
    const ok = await confirm({
      title: "Vorlage löschen",
      message: `Vorlage „${template.name}“ wirklich löschen? Bereits erfasste Buchungen bleiben erhalten.`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    // Fokus auf die Folgezeile, sonst auf „Neue Vorlage"
    const idx = visibleTemplates.findIndex((t) => t.id === template.id);
    const nextId = visibleTemplates[idx + 1]?.id || visibleTemplates[idx - 1]?.id || null;
    onUpdateTemplates(templates.filter((t) => t.id !== template.id));
    toast.success("Vorlage gelöscht.");
    focusRow(nextId);
  }

  // Bewusst auf drei Infos begrenzt (Art, Betrag, Notiz) — Kategorie steckt
  // im Farbpunkt neben dem Namen, alles Weitere steht im Bearbeiten-Dialog.
  function renderMetaPills(template) {
    const kind = KIND_LABELS[template.kind] ? template.kind : "expense";
    const note = (template.note || "").trim();
    return (
      <>
        <span className={`hb-tpl-pill hb-tpl-pill--${kind}`}>{KIND_LABELS[kind]}</span>
        {template.amount != null ? (
          <span className="hb-tpl-pill hb-tpl-pill--amount">{fmt(template.amount)}</span>
        ) : (
          <span
            className="hb-tpl-pill hb-tpl-pill--open"
            title="Der Betrag wird bei jeder Buchung neu erfasst."
          >
            Betrag frei
          </span>
        )}
        {note && (
          <span className="hb-tpl-pill hb-tpl-pill--note" title={note}>
            „{note}“
          </span>
        )}
      </>
    );
  }

  function renderEmptyState() {
    if (trimmedSearch) {
      return (
        <div className="hb-empty hb-empty--sm">
          <div className="hb-empty-icon"><IconSearch /></div>
          <div className="hb-empty-title">Keine Vorlagen gefunden</div>
          <div className="hb-empty-text">Für „{trimmedSearch}“ gibt es keine Vorlage.</div>
          <button
            type="button"
            className="hb-btn-ghost hb-btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setSearch("")}
          >
            Suche zurücksetzen
          </button>
        </div>
      );
    }
    return (
      <div className="hb-empty hb-empty--sm">
        <div className="hb-empty-icon"><IconTemplate /></div>
        <div className="hb-empty-title">Noch keine Vorlagen</div>
        <div className="hb-empty-text">
          Vorlagen füllen den Buchungsdialog mit häufig genutzten Angaben vor –
          z.B. „Wocheneinkauf“ oder „ÖV-Abo“.
        </div>
        <Button size="sm" onClick={openCreate}>
          <IconPlus width={14} height={14} /> Neue Vorlage
        </Button>
      </div>
    );
  }

  return (
    <>
      <EditDialog
        open={open}
        title={
          <span className="hb-title-with-help">
            Vorlagen bearbeiten
            <HbTooltip
              placement="bottom"
              text="Vorlagen erscheinen als Chips oben im Buchungsdialog und füllen Art, Kategorie, Notiz und optional den Betrag vor. Ohne Betrag bleibt das Betragsfeld leer und wird jedes Mal neu erfasst. Die Chips sind nach Häufigkeit sortiert."
            />
          </span>
        }
        onClose={onClose}
        onSave={null}
        canSave={false}
        saveLabel={null}
        size="wide"
        hideFooter
      >
        <div className="hb-tpl-manager">
          <div className="hb-cat-manager-header">
            <div className="hb-search-field">
              <span className="hb-search-icon"><IconSearch width={16} height={16} /></span>
              <input
                className="hb-input"
                type="text"
                placeholder="Vorlage suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button size="sm" ref={createBtnRef} onClick={openCreate}>
              + Neue Vorlage
            </Button>
          </div>

          <div className="hb-cat-list">
            {visibleTemplates.length === 0
              ? renderEmptyState()
              : visibleTemplates.map((template) => {
                  const issues = getTemplateIssues(template, ctx);
                  return (
                    <div key={template.id} className="hb-tpl-row">
                      <div className="hb-tpl-main">
                        <div className="hb-tpl-name">
                          <span
                            className="hb-cat-dot"
                            style={{ background: getTemplateColor(template, ctx) }}
                          />
                          <span>{template.name}</span>
                        </div>
                        <div className="hb-tpl-meta">
                          {renderMetaPills(template)}
                          {issues.length > 0 && (
                            <span className="hb-tpl-pill hb-tpl-pill--warn" title={issues.join("\n")}>
                              ⚠ {issues.length === 1 ? "1 Hinweis" : `${issues.length} Hinweise`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="hb-tpl-actions">
                        <button
                          type="button"
                          ref={(el) => {
                            editBtnRefs.current[template.id] = el;
                          }}
                          className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                          aria-label={`„${template.name}“ bearbeiten`}
                          title="Bearbeiten"
                          onClick={() => openEdit(template)}
                        >
                          <IconEdit />
                        </button>
                        <OverflowMenu
                          buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                          label={`Weitere Aktionen für „${template.name}“`}
                          items={[
                            {
                              label: "Löschen",
                              danger: true,
                              onClick: () => deleteTemplate(template),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </EditDialog>

      <EntryTemplateFormDialog
        open={formOpen}
        template={editTarget}
        existingTemplates={templates}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        transferCategories={transferCategories}
        pots={pots}
        onClose={closeForm}
        onSave={handleSaveTemplate}
      />
    </>
  );
}
