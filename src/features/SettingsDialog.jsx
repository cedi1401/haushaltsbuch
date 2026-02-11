import React, { useRef, useState, useEffect } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { Button } from "../components/ui.jsx";
import { exportBackupFile, importBackupFile as importBackupNative, isElectron } from "../dal/storage.js";
import { exportBackup, importBackupFile as importBackupLegacy } from "../backup.js";

export default function SettingsDialog({
  open,
  onClose,

  // State needed for backup
  books,
  activeBookId,
  monthFilter,

  // callback to apply restored data in parent
  onRestoreAll,

  // NEU: für Töpfe-Verwaltung
  activeBook,
  onUpdateBook,
}) {
  const backupInputRef = useRef(null);

  // NEU: State für Töpfe-Verwaltung
  const [potDrafts, setPotDrafts] = useState({});
  const [isAddingPot, setIsAddingPot] = useState(false);
  const [newPotName, setNewPotName] = useState("");

  // State für Kategorie-Budgets
  const [budgetDrafts, setBudgetDrafts] = useState({});

  // Initialisiere potDrafts und budgetDrafts wenn Dialog öffnet
  useEffect(() => {
    if (open && activeBook?.pots) {
      const drafts = {};
      activeBook.pots.forEach((pot) => {
        drafts[pot.id] = {
          name: pot.name,
        };
      });
      setPotDrafts(drafts);
    }

    // Budget-Drafts initialisieren
    if (open && activeBook?.categories) {
      const bDrafts = {};
      activeBook.categories.forEach((cat) => {
        const name = typeof cat === "string" ? cat : cat.name;
        const budget = typeof cat === "object" ? cat.budget : null;
        bDrafts[name] = budget ?? "";
      });
      setBudgetDrafts(bDrafts);
    }
  }, [open, activeBook]);

  async function doExportBackup() {
    if (isElectron) {
      await exportBackupFile({ books, activeBookId, monthFilter });
    } else {
      exportBackup({ books, activeBookId, monthFilter });
    }
  }

  async function triggerImportBackup() {
    if (isElectron) {
      // Electron: native file dialog via IPC
      try {
        const ok = window.confirm(
          "Backup importieren?\n\nAchtung: Das überschreibt deine aktuellen Daten."
        );
        if (!ok) return;

        const result = await importBackupNative();
        if (result.canceled) return;

        const obj = result.data;
        if (!obj || obj.format !== 'haushaltsbuch-backup' || obj.version !== 1 || !Array.isArray(obj.books)) {
          window.alert("Ungültiges Backup-Format.");
          return;
        }

        onRestoreAll?.({
          books: obj.books,
          activeBookId: obj.activeBookId || obj.books[0]?.id || null,
          monthFilter: obj.monthFilter || '',
        });

        window.alert("Erfolgreich: Backup importiert.");
        onClose?.();
      } catch (e) {
        console.error(e);
        window.alert("Import fehlgeschlagen.");
      }
    } else {
      // Browser: hidden file input
      backupInputRef.current?.click();
    }
  }

  async function onPickBackupFile(file) {
    if (!file) return;

    try {
      const ok = window.confirm(
        "Backup importieren?\n\nAchtung: Das überschreibt deine aktuellen Daten."
      );
      if (!ok) return;

      const restored = await importBackupLegacy(file);
      onRestoreAll?.(restored);

      window.alert("Erfolgreich: Backup importiert.");
      onClose?.();
    } catch (e) {
      console.error(e);
      window.alert(
        "Import fehlgeschlagen. Ist es wirklich ein gültiges Haushaltsbuch-Backup (.json)?"
      );
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  // === TÖPFE-VERWALTUNG ===

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
      window.alert("Topf-Name darf nicht leer sein.");
      return;
    }

    if (trimmedName.length > 50) {
      window.alert("Name ist zu lang (max. 50 Zeichen).");
      return;
    }

    // Prüfe auf Duplikate (außer der aktuelle Topf)
    const isDuplicate = activeBook.pots.some(
      (p) => p.id !== potId && p.name === trimmedName
    );
    if (isDuplicate) {
      window.alert("Ein Topf mit diesem Namen existiert bereits.");
      return;
    }

    // Aktualisiere Buch
    const updatedPots = activeBook.pots.map((pot) =>
      pot.id === potId
        ? { ...pot, name: trimmedName }
        : pot
    );

    onUpdateBook?.({ ...activeBook, pots: updatedPots });
    window.alert("Erfolgreich: Topf gespeichert.");
  }

  function addNewPot() {
    const trimmedName = newPotName.trim();
    if (!trimmedName) {
      window.alert("Topf-Name darf nicht leer sein.");
      return;
    }

    if (trimmedName.length > 50) {
      window.alert("Name ist zu lang (max. 50 Zeichen).");
      return;
    }

    const isDuplicate = activeBook.pots.some((p) => p.name === trimmedName);
    if (isDuplicate) {
      window.alert("Ein Topf mit diesem Namen existiert bereits.");
      return;
    }

    // Erstelle neuen Topf
    const newPot = {
      id: `pot_${Date.now()}`,
      name: trimmedName,
    };

    onUpdateBook?.({ ...activeBook, pots: [...activeBook.pots, newPot] });

    // Reset
    setNewPotName("");
    setIsAddingPot(false);

    window.alert(`Erfolgreich: Topf "${trimmedName}" erstellt.`);
  }

  function deletePot(potId) {
    if (activeBook.pots.length <= 1) {
      window.alert("Du brauchst mindestens einen Topf.");
      return;
    }

    const pot = activeBook.pots.find((p) => p.id === potId);
    if (!pot) return;

    // Zähle Verwendungen
    const usageCount = activeBook.entries.filter(
      (e) => (e.kind === "transfer" || e.source === "pot") && e.potId === potId
    ).length;

    const ok = window.confirm(
      `Topf "${pot.name}" wirklich löschen?\n\n` +
      (usageCount > 0
        ? `Achtung: ${usageCount} Einträge verwenden diesen Topf. Diese bleiben erhalten, zeigen aber dann einen ungültigen Topf.`
        : `Dieser Topf wird in keinen Einträgen verwendet.`)
    );
    if (!ok) return;

    const updatedPots = activeBook.pots.filter((p) => p.id !== potId);
    onUpdateBook?.({ ...activeBook, pots: updatedPots });

    // Entferne aus potDrafts
    setPotDrafts((prev) => {
      const next = { ...prev };
      delete next[potId];
      return next;
    });

    window.alert("Erfolgreich: Topf gelöscht.");
  }

  // === KATEGORIE-BUDGETS ===

  function updateBudgetDraft(categoryName, value) {
    setBudgetDrafts((prev) => ({
      ...prev,
      [categoryName]: value,
    }));
  }

  function saveBudgets() {
    if (!activeBook?.categories) return;

    const updatedCategories = activeBook.categories.map((cat) => {
      const name = typeof cat === "string" ? cat : cat.name;
      const draftValue = budgetDrafts[name];
      const budget =
        draftValue === "" || draftValue == null
          ? null
          : Math.max(0, Number(draftValue));

      return {
        name,
        budget: Number.isFinite(budget) && budget > 0 ? budget : null,
      };
    });

    onUpdateBook?.({ ...activeBook, categories: updatedCategories });
    window.alert("Budgets gespeichert.");
  }

  return (
    <EditDialog
      open={open}
      title="Einstellungen"
      onClose={onClose}
      onSave={onClose}
      canSave={true}
      saveLabel="Schließen"
    >
      <div className="hb-field">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Backup</div>
        <div className="hb-muted" style={{ marginBottom: 10 }}>
          Export erstellt eine .json Datei. Import überschreibt alle aktuellen Daten.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={doExportBackup}>
            Backup exportieren
          </Button>
          <Button variant="outline" onClick={triggerImportBackup}>
            Backup importieren
          </Button>
        </div>

        <input
          ref={backupInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickBackupFile(f);
          }}
        />

        <div className="hb-note">Tipp: Bewahre dein Backup z.B. in OneDrive/Dropbox/USB auf.</div>
      </div>

      {/* NEU: TÖPFE-VERWALTUNG */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Töpfe verwalten</div>
        <div className="hb-muted" style={{ marginBottom: 12 }}>
          Bearbeite die Namen deiner Töpfe.
        </div>

        {activeBook?.pots?.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activeBook.pots.map((pot) => {
              const draft = potDrafts[pot.id] || { name: pot.name };
              return (
                <div
                  key={pot.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 12,
                    background: "var(--hover-bg)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Name */}
                    <div className="hb-field">
                      <label className="hb-label">Name</label>
                      <input
                        className="hb-input"
                        type="text"
                        value={draft.name}
                        onChange={(e) => updatePotDraft(pot.id, "name", e.target.value)}
                        placeholder="z.B. Rücklagen, Urlaub"
                      />
                    </div>

                    {/* Aktionen */}
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

        {/* Neuen Topf hinzufügen */}
        <div style={{ marginTop: 16 }}>
          {isAddingPot ? (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                background: "var(--hover-bg)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="hb-field">
                  <label className="hb-label">Name</label>
                  <input
                    className="hb-input"
                    type="text"
                    value={newPotName}
                    onChange={(e) => setNewPotName(e.target.value)}
                    placeholder="z.B. Notgroschen, Auto"
                    autoFocus
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <Button variant="solid" onClick={addNewPot}>
                    Topf erstellen
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setIsAddingPot(false);
                    setNewPotName("");
                  }}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setIsAddingPot(true)}>
              + Neuer Topf
            </Button>
          )}
        </div>
      </div>

      {/* KATEGORIE-BUDGETS */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Kategorie-Budgets</div>
        <div className="hb-muted" style={{ marginBottom: 12 }}>
          Setze optionale monatliche Limits für deine Ausgaben-Kategorien.
        </div>

        {activeBook?.categories?.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeBook.categories.map((cat) => {
              const name = typeof cat === "string" ? cat : cat.name;
              const draftValue = budgetDrafts[name] ?? "";

              return (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 12px",
                    background: "var(--hover-bg)",
                    borderRadius: 6,
                  }}
                >
                  <span style={{ flex: 1, fontWeight: 500 }}>{name}</span>
                  <input
                    className="hb-input"
                    type="number"
                    min="0"
                    step="50"
                    placeholder="kein Limit"
                    value={draftValue}
                    onChange={(e) => updateBudgetDraft(name, e.target.value)}
                    style={{ width: 120, textAlign: "right" }}
                  />
                  <span className="hb-muted">CHF</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="hb-muted">Keine Kategorien vorhanden.</div>
        )}

        <Button variant="solid" onClick={saveBudgets} style={{ marginTop: 12 }}>
          Budgets speichern
        </Button>
      </div>
    </EditDialog>
  );
}
