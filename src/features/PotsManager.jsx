import React, { useEffect, useState } from "react";
import { Button } from "../components/ui.jsx";
import { generateId } from "../utils/idUtils.js";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { IconPlus } from "../components/icons.jsx";

export default function PotsManager({ activeBook, onUpdateBook }) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [potDrafts, setPotDrafts] = useState({});
  const [isAddingPot, setIsAddingPot] = useState(false);
  const [newPotName, setNewPotName] = useState("");

  useEffect(() => {
    if (activeBook?.pots) {
      const drafts = {};
      activeBook.pots.forEach((pot) => {
        drafts[pot.id] = { name: pot.name };
      });
      setPotDrafts(drafts);
    }
  }, [activeBook]);

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
      pot.id === potId ? { ...pot, name: trimmedName } : pot
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

    const newPot = { id: generateId("pot"), name: trimmedName };
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
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Töpfe verwalten</div>
      <div className="hb-muted" style={{ marginBottom: 12 }}>
        Bearbeite die Namen deiner Töpfe.
      </div>

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
        <div className="hb-muted">Keine Töpfe vorhanden.</div>
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
