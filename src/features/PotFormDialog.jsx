import React, { useMemo, useState } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { EMPTY_ARRAY } from "../utils/constants.js";

export const POT_NAME_MAX = 50;

/**
 * Ein Dialog für Anlegen und Bearbeiten eines Topfs — analog zu
 * EntryTemplateFormDialog. Kein Löschen: das macht der Kebab in der
 * Manager-Zeile (sonst zwei Löschpfade).
 */
export default function PotFormDialog({ open, pot, pots = EMPTY_ARRAY, onClose, onSave }) {
  const [name, setName] = useState(pot?.name || "");
  const [isSavings, setIsSavings] = useState(pot?.isSavings ?? false);

  // Draft beim Öffnen aus dem Topf ableiten — aus dem open/pot-Übergang
  // statt via Effekt (vermeidet set-state-in-effect).
  const [prevKey, setPrevKey] = useState(open ? pot?.id ?? "__new__" : null);
  const key = open ? pot?.id ?? "__new__" : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setName(pot?.name || "");
      setIsSavings(pot?.isSavings ?? false);
    }
  }

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return null; // leerer Name blockiert still über canSave
    if (trimmed.length > POT_NAME_MAX) return `Name ist zu lang (max. ${POT_NAME_MAX} Zeichen).`;
    const normalized = trimmed.toLocaleLowerCase("de");
    const isDuplicate = pots.some(
      (p) => p.id !== pot?.id && (p.name || "").trim().toLocaleLowerCase("de") === normalized
    );
    if (isDuplicate) return "Ein Topf mit diesem Namen existiert bereits.";
    return null;
  }, [name, pots, pot?.id]);

  const canSave = Boolean(name.trim()) && !nameError;

  function handleSave() {
    if (!canSave) return;
    onSave({ name: name.trim(), isSavings });
  }

  return (
    <EditDialog
      open={open}
      title={pot ? "Topf bearbeiten" : "Neuer Topf"}
      onClose={onClose}
      onSave={handleSave}
      canSave={canSave}
      saveLabel={pot ? "Speichern" : "Erstellen"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
        <div className="hb-field">
          <div className="hb-label">Name</div>
          <input
            className={`hb-input hb-full${nameError ? " hb-input--invalid" : ""}`}
            type="text"
            maxLength={POT_NAME_MAX}
            placeholder="z.B. Notgroschen, Auto"
            value={name}
            aria-invalid={nameError ? "true" : undefined}
            aria-describedby={nameError ? "hb-pot-name-error" : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            autoFocus
          />
          {nameError && <div id="hb-pot-name-error" className="hb-field-error">{nameError}</div>}
        </div>

        <label className="hb-fct-annual-toggle">
          <input
            type="checkbox"
            checked={isSavings}
            onChange={(e) => setIsSavings(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Als Spar-Topf zählen</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              Einzahlungen in diesen Topf zählen als Sparbetrag und fließen in die Sparquote ein.
              Ausgenommen sind Rückstellungen: Sie sind für eine feste Rechnung zurückgelegt und
              zählen deshalb unter Rücklagen.
            </div>
          </div>
        </label>
      </div>
    </EditDialog>
  );
}
