import React, { useMemo, useRef, useState } from "react";
import EditDialog from "../components/EditDialog.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { Button } from "../components/ui.jsx";
import { generateId } from "../utils/idUtils.js";
import { useUndo } from "../contexts/UndoContext.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { IconPlus, IconPots, IconEdit } from "../components/icons.jsx";
import PotFormDialog from "./PotFormDialog.jsx";

function usageLabel(count) {
  return count === 1 ? "1 Buchung" : `${count} Buchungen`;
}

/**
 * „Töpfe verwalten" — Liste mit Bearbeiten-Dialog, aufgebaut wie der
 * Vorlagen-Manager. Löschen und Bearbeiten wirken sofort (mit Undo), daher
 * ohne Fuß: geschlossen wird über das X.
 */
export default function PotsManagerDialog({ open, onClose, activeBook, onUpdateBook }) {
  const undo = useUndo();
  const { confirm } = useConfirm();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Fokus-Rückgabe nach Sub-Dialog und nach dem Löschen
  const editBtnRefs = useRef({});
  const createBtnRef = useRef(null);

  // Reset beim Schließen — abgeleitet aus dem open-Übergang statt via Effekt.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setFormOpen(false);
      setEditTarget(null);
    }
  }

  const pots = activeBook?.pots || [];
  const entries = activeBook?.entries;

  const usageCounts = useMemo(() => {
    const counts = {};
    (entries || []).forEach((e) => {
      if ((e.kind === "transfer" || e.kind === "withdrawal") && e.potId) {
        counts[e.potId] = (counts[e.potId] || 0) + 1;
      }
    });
    return counts;
  }, [entries]);

  function focusRow(potId) {
    requestAnimationFrame(() => {
      const el = potId ? editBtnRefs.current[potId] : null;
      (el || createBtnRef.current)?.focus();
    });
  }

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(pot) {
    setEditTarget(pot);
    setFormOpen(true);
  }

  function closeForm() {
    const targetId = editTarget?.id || null;
    setFormOpen(false);
    setEditTarget(null);
    focusRow(targetId);
  }

  function handleSavePot({ name, isSavings }) {
    if (editTarget) {
      const unchanged =
        name === editTarget.name && isSavings === (editTarget.isSavings ?? false);
      if (!unchanged) {
        onUpdateBook?.({
          ...activeBook,
          pots: pots.map((p) => (p.id === editTarget.id ? { ...p, name, isSavings } : p)),
        });
        undo.offer("Topf gespeichert.");
      }
    } else {
      onUpdateBook?.({
        ...activeBook,
        pots: [...pots, { id: generateId("pot"), name, isSavings }],
      });
      undo.offer(`Topf „${name}“ erstellt.`);
    }
    closeForm();
  }

  async function deletePot(pot) {
    if (pots.length <= 1) return;

    const usageCount = usageCounts[pot.id] || 0;
    const usageNote =
      usageCount === 0
        ? "Dieser Topf wird in keinen Einträgen verwendet."
        : usageCount === 1
        ? "Achtung: 1 Eintrag verwendet diesen Topf. Er bleibt erhalten, zeigt aber dann einen ungültigen Topf."
        : `Achtung: ${usageCount} Einträge verwenden diesen Topf. Sie bleiben erhalten, zeigen aber dann einen ungültigen Topf.`;

    const ok = await confirm({
      title: "Topf löschen",
      message: `Topf „${pot.name}“ wirklich löschen?\n\n${usageNote}`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;

    // Fokus auf die Folgezeile, sonst auf „Neuer Topf"
    const idx = pots.findIndex((p) => p.id === pot.id);
    const nextId = pots[idx + 1]?.id || pots[idx - 1]?.id || null;
    // Die Zwecke des Topfs gehen mit (weich, wie ihre Buchungen): ein Zweck
    // gehört genau einem Topf und ist ohne ihn nicht mehr buchbar.
    const transferCategories = (activeBook?.transferCategories || []).map((c) =>
      c.potId === pot.id ? { ...c, deleted: true } : c
    );
    onUpdateBook?.({ ...activeBook, pots: pots.filter((p) => p.id !== pot.id), transferCategories });
    undo.offer("Topf gelöscht.");
    focusRow(nextId);
  }

  return (
    <>
      <EditDialog
        open={open}
        title="Töpfe verwalten"
        onClose={onClose}
        onSave={null}
        canSave={false}
        saveLabel={null}
        size="medium"
        hideFooter
      >
        <div className="hb-tpl-manager">
          <div className="hb-cat-list">
            {pots.length === 0 ? (
              <div className="hb-empty hb-empty--sm">
                <div className="hb-empty-icon"><IconPots /></div>
                <div className="hb-empty-title">Noch keine Töpfe</div>
                <div className="hb-empty-text">
                  Töpfe sind Sparbehälter für Rücklagen oder bestimmte Sparziele.
                </div>
                <Button size="sm" ref={createBtnRef} onClick={openCreate}>
                  <IconPlus width={14} height={14} /> Neuer Topf
                </Button>
              </div>
            ) : (
              pots.map((pot) => {
                const count = usageCounts[pot.id] || 0;
                return (
                  <div key={pot.id} className="hb-tpl-row hb-potmgr-row">
                    <div className="hb-tpl-main">
                      <div className="hb-tpl-name">
                        <span title={pot.name}>{pot.name}</span>
                      </div>
                      {count > 0 && (
                        <div className="hb-tpl-meta">
                          <span className="hb-tpl-pill hb-tpl-pill--open">{usageLabel(count)}</span>
                        </div>
                      )}
                    </div>
                    {/* Rechts vor den Aktionen, damit die Markierungen
                        mehrerer Spar-Töpfe untereinander stehen. */}
                    <div className="hb-tpl-actions hb-potmgr-actions">
                      {pot.isSavings && <span className="hb-pot-savings-tag">Sparen</span>}
                      <button
                        type="button"
                        ref={(el) => {
                          editBtnRefs.current[pot.id] = el;
                        }}
                        className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                        aria-label={`„${pot.name}“ bearbeiten`}
                        title="Bearbeiten"
                        onClick={() => openEdit(pot)}
                      >
                        <IconEdit />
                      </button>
                      <OverflowMenu
                        buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                        label={`Weitere Aktionen für „${pot.name}“`}
                        items={[
                          {
                            label: "Löschen",
                            danger: true,
                            disabled: pots.length <= 1,
                            onClick: () => deletePot(pot),
                          },
                        ]}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {pots.length > 0 && (
            <div>
              <Button size="sm" ref={createBtnRef} onClick={openCreate}>
                + Neuer Topf
              </Button>
            </div>
          )}
        </div>
      </EditDialog>

      <PotFormDialog
        open={formOpen}
        pot={editTarget}
        pots={pots}
        onClose={closeForm}
        onSave={handleSavePot}
      />
    </>
  );
}
