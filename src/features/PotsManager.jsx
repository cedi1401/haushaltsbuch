import React, { useState } from "react";
import { Button } from "../components/ui.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import { generateId } from "../utils/idUtils.js";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { IconPlus, IconPots } from "../components/icons.jsx";

function buildPotDrafts(pots) {
  const drafts = {};
  (pots || []).forEach((pot) => { drafts[pot.id] = { name: pot.name, isSavings: pot.isSavings ?? false }; });
  return drafts;
}

export default function PotsManager({ activeBook, onUpdateBook }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [potDrafts, setPotDrafts] = useState(() => buildPotDrafts(activeBook?.pots));
  const [prevPots, setPrevPots] = useState(activeBook?.pots);
  const [isAddingPot, setIsAddingPot] = useState(false);
  const [newPotName, setNewPotName] = useState("");

  // React-sanctioned pattern: update derived state during render when source changes
  if (activeBook?.pots !== prevPots) {
    setPrevPots(activeBook?.pots);
    setPotDrafts(buildPotDrafts(activeBook?.pots));
  }

  function updatePotDraft(potId, field, value) {
    setPotDrafts((prev) => ({
      ...prev,
      [potId]: { ...(prev[potId] || {}), [field]: value },
    }));
  }

  function savePot(potId) {
    const draft = potDrafts[potId];
    if (!draft) return;

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      toast.warning("Topf-Name darf nicht leer sein.");
      return;
    }
    if (trimmedName.length > 50) {
      toast.warning("Name ist zu lang (max. 50 Zeichen).");
      return;
    }
    const isDuplicate = activeBook.pots.some(
      (p) => p.id !== potId && p.name === trimmedName
    );
    if (isDuplicate) {
      toast.warning("Ein Topf mit diesem Namen existiert bereits.");
      return;
    }

    const updatedPots = activeBook.pots.map((pot) =>
      pot.id === potId ? { ...pot, name: trimmedName, isSavings: draft.isSavings ?? false } : pot
    );
    onUpdateBook?.({ ...activeBook, pots: updatedPots });
    toast.success("Topf gespeichert.");
  }

  function addNewPot() {
    const trimmedName = newPotName.trim();
    if (!trimmedName) {
      toast.warning("Topf-Name darf nicht leer sein.");
      return;
    }
    if (trimmedName.length > 50) {
      toast.warning("Name ist zu lang (max. 50 Zeichen).");
      return;
    }
    const isDuplicate = activeBook.pots.some((p) => p.name === trimmedName);
    if (isDuplicate) {
      toast.warning("Ein Topf mit diesem Namen existiert bereits.");
      return;
    }

    const newPot = { id: generateId("pot"), name: trimmedName, isSavings: false };
    onUpdateBook?.({ ...activeBook, pots: [...activeBook.pots, newPot] });
    setNewPotName("");
    setIsAddingPot(false);
    toast.success(`Topf „${trimmedName}" erstellt.`);
  }

  async function deletePot(potId) {
    if (activeBook.pots.length <= 1) {
      toast.warning("Du brauchst mindestens einen Topf.");
      return;
    }

    const pot = activeBook.pots.find((p) => p.id === potId);
    if (!pot) return;

    const usageCount = activeBook.entries.filter(
      (e) => (e.kind === "transfer" || e.kind === "withdrawal") && e.potId === potId
    ).length;

    const ok = await confirm({
      title: "Topf löschen",
      message:
        `Topf „${pot.name}" wirklich löschen?\n\n` +
        (usageCount > 0
          ? `Achtung: ${usageCount} Einträge verwenden diesen Topf. Diese bleiben erhalten, zeigen aber dann einen ungültigen Topf.`
          : `Dieser Topf wird in keinen Einträgen verwendet.`),
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;

    const updatedPots = activeBook.pots.filter((p) => p.id !== potId);
    onUpdateBook?.({ ...activeBook, pots: updatedPots });
    setPotDrafts((prev) => {
      const next = { ...prev };
      delete next[potId];
      return next;
    });
    toast.success("Topf gelöscht.");
  }

  return (
    <div>
      {activeBook?.pots?.length > 0 ? (
        <div className="hb-stack hb-stack--lg">
          {activeBook.pots.map((pot) => {
            const draft = potDrafts[pot.id] || { name: pot.name };
            return (
              <div
                key={pot.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: 12,
                  background: "var(--hover-bg)",
                }}
              >
                <div className="hb-stack" style={{ gap: 10 }}>
                  <div className="hb-field">
                    <label className="hb-label" htmlFor={`pot-name-${pot.id}`}>Name</label>
                    <input
                      id={`pot-name-${pot.id}`}
                      className="hb-input"
                      type="text"
                      value={draft.name}
                      onChange={(e) => updatePotDraft(pot.id, "name", e.target.value)}
                      placeholder="z.B. Rücklagen, Urlaub"
                    />
                  </div>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
                  >
                    <input
                      type="checkbox"
                      checked={draft.isSavings ?? false}
                      onChange={(e) => updatePotDraft(pot.id, "isSavings", e.target.checked)}
                    />
                    <span style={{ fontSize: 13 }}>Spar-Topf</span>
                    <HbTooltip
                      text="Einzahlungen in diesen Topf werden als Sparbetrag gezählt und fließen in die Berechnung der Sparquote ein."
                      placement="right"
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <Button variant="solid" onClick={() => savePot(pot.id)}>
                      Speichern
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => deletePot(pot.id)}
                      disabled={activeBook.pots.length <= 1}
                    >
                      Löschen
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hb-empty hb-empty--sm">
          <div className="hb-empty-icon"><IconPots /></div>
          <div className="hb-empty-title">Noch keine Töpfe</div>
          <div className="hb-empty-text">Erstelle deinen ersten Topf mit dem Button unten.</div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {isAddingPot ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 12,
              background: "var(--hover-bg)",
            }}
          >
            <div className="hb-stack" style={{ gap: 10 }}>
              <div className="hb-field">
                <label className="hb-label" htmlFor="new-pot-name">Name</label>
                <input
                  id="new-pot-name"
                  className="hb-input"
                  type="text"
                  value={newPotName}
                  onChange={(e) => setNewPotName(e.target.value)}
                  placeholder="z.B. Notgroschen, Auto"
                />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <Button variant="solid" onClick={addNewPot}>
                  Topf erstellen
                </Button>
                <Button variant="outline" onClick={() => { setIsAddingPot(false); setNewPotName(""); }}>
                  Abbrechen
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setIsAddingPot(true)}>
            <IconPlus /> Neuer Topf
          </Button>
        )}
      </div>
    </div>
  );
}
