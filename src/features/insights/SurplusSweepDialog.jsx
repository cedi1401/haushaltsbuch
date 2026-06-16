import React, { useState } from "react";
import EditDialog from "../../components/EditDialog.jsx";
import HbTooltip from "../../components/HbTooltip.jsx";
import { useFmt, useBaseCurrency } from "../../contexts/CurrencyContext.jsx";
import { parseAmount } from "../../utils/hbUtils.js";

// Sentinel: kein eigener Spar-Topf vorhanden → Fallback-„Überschuss"-Topf
// wird beim Buchen angelegt.
export const SWEEP_FALLBACK_POT = "__fallback__";

// Wird vom Parent nur bei geöffnetem Dialog gerendert (Remount), daher genügen
// Lazy-Initializer für die Vorbelegung — kein setState-im-Effect nötig.
export default function SurplusSweepDialog({
  open,
  defaultAmount,
  savingsPots = [],
  onClose,
  onConfirm,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const hasSavingsPots = savingsPots.length > 0;
  const [amount, setAmount] = useState(() =>
    defaultAmount != null ? String(Math.round(defaultAmount * 100) / 100) : ""
  );
  const [potId, setPotId] = useState(() =>
    hasSavingsPots ? savingsPots[0].id : SWEEP_FALLBACK_POT
  );

  const numericAmount = parseAmount(amount);
  const canSave = Number.isFinite(numericAmount) && numericAmount > 0 && Boolean(potId);

  const selectedPot = hasSavingsPots ? savingsPots.find((p) => p.id === potId) : null;
  const showProjectedBalance =
    selectedPot && typeof selectedPot.balance === "number" && canSave;

  return (
    <EditDialog
      open={open}
      title={
        <span className="hb-title-with-help">
          Überschuss sparen
          <HbTooltip
            placement="bottom"
            text='Bucht den am Monatsende übrig gebliebenen Frei-Betrag als Sparen-Transfer auf den gewählten Topf, datiert auf den letzten Tag des Monats. So zählt der Überschuss zur Sparquote und das Frei-Budget des Monats geht auf 0. Ohne eigenen Spar-Topf wird automatisch ein „Überschuss"-Topf angelegt.'
          />
        </span>
      }
      onClose={onClose}
      onSave={() => {
        if (canSave) onConfirm({ potId, amount: numericAmount });
      }}
      canSave={canSave}
      saveLabel="Sparen"
      size="medium"
      bodyScroll={false}
    >
      <div className="hb-form" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <div className="hb-field" style={{ minWidth: 0 }}>
          <div className="hb-label">Betrag ({baseCurrency})</div>
          <input
            className="hb-input"
            style={{ minWidth: 0, width: "100%" }}
            type="text"
            inputMode="decimal"
            placeholder="z.B. 100.50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {defaultAmount != null && (
            <div style={{ fontSize: 15, marginTop: 8, color: "var(--muted)" }}>
              Verfügbarer Überschuss:{" "}
              <span style={{ fontWeight: 600, color: "var(--text)" }}>
                {fmt(defaultAmount)}
              </span>
            </div>
          )}
        </div>

        <div className="hb-field" style={{ minWidth: 0 }}>
          <div className="hb-label">Spar-Topf</div>
          <select
            className="hb-input"
            style={{ minWidth: 0, width: "100%" }}
            value={potId}
            onChange={(e) => setPotId(e.target.value)}
          >
            {hasSavingsPots ? (
              savingsPots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            ) : (
              <option value={SWEEP_FALLBACK_POT}>Neuer Topf „Überschuss"</option>
            )}
          </select>
          {showProjectedBalance && (
            <div style={{ fontSize: 15, marginTop: 8, color: "var(--muted)" }}>
              Topf-Stand nachher:{" "}
              <span style={{ fontWeight: 600, color: "var(--text)" }}>
                {fmt(selectedPot.balance + numericAmount)}
              </span>
            </div>
          )}
        </div>
      </div>
    </EditDialog>
  );
}
