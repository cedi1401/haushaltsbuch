import React, { useMemo, useState } from "react";
import EditDialog from "./EditDialog.jsx";
import { EMPTY_ARRAY } from "../utils/constants.js";
import {
  MAX_TRANSFER_NAME_LENGTH,
  findTransferCategoryByName,
  isReservedPurposeName,
  NO_PURPOSE_LABEL,
} from "../utils/transferCategoryUtils.js";

/**
 * Anlegen und Umbenennen einer Sparposition im Kategorien-Manager — analog zu
 * PotFormDialog. Raten, Ziele und Fälligkeiten gehören in die Rücklagen.
 * Der Topf ist nur beim Anlegen wählbar: die Buchungen eines Zwecks liegen in
 * seinem Topf, ein Wechsel würde sie auseinanderreißen.
 */
export default function SavingsPositionFormDialog({
  open,
  position,
  transferCategories = EMPTY_ARRAY,
  pots = EMPTY_ARRAY,
  onClose,
  onSave,
}) {
  const [name, setName] = useState(position?.name || "");
  const [potId, setPotId] = useState(position?.potId || pots[0]?.id || "");

  // Draft beim Öffnen ableiten — aus dem open/position-Übergang statt via Effekt.
  const [prevKey, setPrevKey] = useState(open ? position?.id ?? "__new__" : null);
  const key = open ? position?.id ?? "__new__" : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setName(position?.name || "");
      setPotId(position?.potId || pots[0]?.id || "");
    }
  }

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return null; // leerer Name blockiert still über canSave
    if (trimmed.length > MAX_TRANSFER_NAME_LENGTH)
      return `Name ist zu lang (max. ${MAX_TRANSFER_NAME_LENGTH} Zeichen).`;
    if (isReservedPurposeName(trimmed))
      return `„${NO_PURPOSE_LABEL}“ ist für Geld ohne Sparposition reserviert.`;
    if (findTransferCategoryByName(transferCategories, trimmed, { excludeId: position?.id }))
      return "Diese Sparposition existiert bereits.";
    return null;
  }, [name, transferCategories, position?.id]);

  const canSave = Boolean(name.trim()) && !nameError && Boolean(potId);

  function handleSave() {
    if (!canSave) return;
    onSave({ name: name.trim(), potId });
  }

  return (
    <EditDialog
      open={open}
      title={position ? "Sparposition bearbeiten" : "Neue Sparposition"}
      onClose={onClose}
      onSave={handleSave}
      canSave={canSave}
      saveLabel={position ? "Speichern" : "Erstellen"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
        <div className="hb-field">
          <div className="hb-label">Name</div>
          <input
            className={`hb-input hb-full${nameError ? " hb-input--invalid" : ""}`}
            type="text"
            maxLength={MAX_TRANSFER_NAME_LENGTH}
            placeholder="z.B. Ferien, Steuern"
            value={name}
            aria-invalid={nameError ? "true" : undefined}
            aria-describedby={nameError ? "hb-purpose-name-error" : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            autoFocus
          />
          {nameError && <div id="hb-purpose-name-error" className="hb-field-error">{nameError}</div>}
        </div>

        <div className="hb-field">
          <div className="hb-label">Topf</div>
          <select
            className="hb-input hb-full"
            value={potId}
            disabled={Boolean(position)}
            onChange={(e) => setPotId(e.target.value)}
          >
            {pots.length === 0 && <option value="">Kein Topf vorhanden</option>}
            {/* Ein unbekannter Topf bleibt sichtbar statt still auf den ersten zu springen */}
            {potId && !pots.some((p) => p.id === potId) && <option value={potId}>Unbekannter Topf</option>}
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>{pot.name}</option>
            ))}
          </select>
          <div className="hb-field-hint">
            {position
              ? "Der Topf lässt sich nachträglich nicht ändern, weil die Buchungen der Sparposition in ihm liegen."
              : pots.length === 0
                ? "Lege zuerst einen Topf an."
                : "Raten, Ziele und Fälligkeiten legst du danach in den Rücklagen fest."}
          </div>
        </div>
      </div>
    </EditDialog>
  );
}
