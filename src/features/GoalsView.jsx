import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { calcGoalProgress, calcGoalPrognosis, generateGoalId } from "../utils/goalUtils.js";

export default function GoalsView({
  activeBook,
  entries,
  toCHF,
  onUpdateBook,
  todayISO,
}) {
  const goals = activeBook?.goals || [];
  const pots = activeBook?.pots || [];
  const transferCategories = activeBook?.transferCategories || [];

  // Dialog-State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [draft, setDraft] = useState({
    name: "",
    targetAmount: "",
    deadline: "",
    potId: pots[0]?.id || "",
    transferCategory: "",       // "" = Topf-Gesamtstand
    startMode: "zero",          // "zero" | "date" | "custom"
    startDate: "",
    startAmount: "",
  });

  // Berechne Fortschritt und Prognose für alle Ziele
  const goalsWithProgress = useMemo(() => {
    return goals.map((goal) => ({
      ...goal,
      progress: calcGoalProgress(goal, entries, pots),
      prognosis: calcGoalPrognosis(goal, entries, todayISO()),
    }));
  }, [goals, entries, pots, todayISO]);

  function openCreateDialog() {
    setEditingGoal(null);
    setDraft({
      name: "",
      targetAmount: "",
      deadline: "",
      potId: pots[0]?.id || "",
      transferCategory: "",
      startMode: "zero",
      startDate: "",
      startAmount: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(goal) {
    setEditingGoal(goal);
    setDraft({
      name: goal.name || "",
      targetAmount: String(goal.targetAmount || ""),
      deadline: goal.deadline || "",
      potId: goal.potId || pots[0]?.id || "",
      transferCategory: goal.transferCategory || "",
      startMode: goal.startMode || "zero",
      startDate: goal.startDate || "",
      startAmount: String(goal.startAmount || ""),
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingGoal(null);
  }

  function saveGoal() {
    if (!activeBook) return;

    const numericAmount = parseFloat(draft.targetAmount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (!draft.name.trim()) return;
    if (!draft.potId) return;

    const goalData = {
      name: draft.name.trim(),
      targetAmount: numericAmount,
      deadline: draft.deadline || null,
      potId: draft.potId,
      transferCategory: draft.transferCategory || null,
      startMode: draft.startMode,
      startDate: draft.startMode === "date" ? (draft.startDate || null) : null,
      startAmount: draft.startMode === "custom"
        ? (parseFloat(String(draft.startAmount).replace(",", ".")) || 0)
        : 0,
    };

    if (editingGoal) {
      const updatedGoals = goals.map((g) =>
        g.id === editingGoal.id ? { ...g, ...goalData } : g
      );
      onUpdateBook({ ...activeBook, goals: updatedGoals });
    } else {
      const newGoal = {
        id: generateGoalId(),
        ...goalData,
        createdAt: todayISO(),
      };
      onUpdateBook({ ...activeBook, goals: [...goals, newGoal] });
    }

    closeDialog();
  }

  function deleteGoal(goalId) {
    if (!activeBook) return;
    const goal = goals.find((g) => g.id === goalId);
    const msg = goal
      ? `Sparziel "${goal.name}" wirklich löschen?`
      : "Sparziel wirklich löschen?";
    if (!window.confirm(msg)) return;
    const updatedGoals = goals.filter((g) => g.id !== goalId);
    onUpdateBook({ ...activeBook, goals: updatedGoals });
  }

  const canSave = useMemo(() => {
    if (!draft.name.trim()) return false;
    const n = parseFloat(draft.targetAmount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return false;
    if (!draft.potId) return false;
    if (draft.startMode === "date" && !draft.startDate) return false;
    return true;
  }, [draft]);

  function getPotName(goal) {
    const pot = pots.find((p) => p.id === goal.potId);
    return pot ? pot.name : goal.potId || "—";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function getStartModeLabel(goal) {
    switch (goal.startMode) {
      case "date":
        return `Ab ${formatDate(goal.startDate)}`;
      case "custom":
        return `Anfangsbetrag: ${toCHF(goal.startAmount || 0)}`;
      case "zero":
      default:
        return "Ab Null (alle Buchungen)";
    }
  }

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Sparziele</h2>
          <div className="hb-muted">Definiere Ziele und verfolge deinen Fortschritt</div>
        </div>

        <Button onClick={openCreateDialog}>+ Neues Sparziel</Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-muted" style={{ textAlign: "center", padding: "20px 0" }}>
              Noch keine Sparziele definiert. Erstelle dein erstes Sparziel, um deinen
              Fortschritt zu verfolgen.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {goalsWithProgress.map((goal) => (
            <Card key={goal.id}>
              <CardContent>
                <div
                  className="hb-row"
                  style={{ marginBottom: 12, alignItems: "flex-start" }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{goal.name}</h3>
                    <div className="hb-muted" style={{ marginTop: 4 }}>
                      Topf: <strong>{getPotName(goal)}</strong>
                      {goal.transferCategory && (
                        <>
                          {" "} | Zweck: <strong>{goal.transferCategory}</strong>
                        </>
                      )}
                      {goal.deadline && (
                        <>
                          {" "} | Deadline: <strong>{formatDate(goal.deadline)}</strong>
                        </>
                      )}
                    </div>
                    <div className="hb-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {getStartModeLabel(goal)}
                    </div>
                  </div>

                  <div className="hb-actions">
                    <Button variant="outline" onClick={() => openEditDialog(goal)}>
                      Bearbeiten
                    </Button>
                    <Button variant="outline" onClick={() => deleteGoal(goal.id)}>
                      Löschen
                    </Button>
                  </div>
                </div>

                {/* Fortschritt */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    className="hb-row"
                    style={{ marginBottom: 6, fontSize: 14 }}
                  >
                    <span>
                      <strong>{toCHF(goal.progress.current)}</strong> von{" "}
                      <strong>{toCHF(goal.progress.target)}</strong>
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          goal.progress.percent >= 100
                            ? "var(--green)"
                            : "var(--text)",
                      }}
                    >
                      {goal.progress.percent}%
                    </span>
                  </div>

                  <div className="hb-goal-progress-bg">
                    <div
                      className="hb-goal-progress-bar"
                      style={{ width: `${Math.min(goal.progress.percent, 100)}%` }}
                    />
                  </div>

                  {goal.progress.remaining > 0 && (
                    <div className="hb-muted" style={{ marginTop: 6, fontSize: 12 }}>
                      Noch {toCHF(goal.progress.remaining)} bis zum Ziel
                    </div>
                  )}
                </div>

                {/* Prognose */}
                {goal.progress.percent < 100 && (
                  <div
                    className="hb-note"
                    style={{
                      padding: "10px 12px",
                      background: "var(--hover-bg)",
                      borderRadius: 6,
                      marginTop: 8,
                    }}
                  >
                    <strong>Prognose:</strong>{" "}
                    {goal.prognosis.avgMonthly > 0 ? (
                      <>
                        Bei durchschnittlich{" "}
                        <strong>{toCHF(goal.prognosis.avgMonthly)}</strong> pro Monat
                        erreichst du dein Ziel in ca.{" "}
                        <strong>
                          {goal.prognosis.monthsRemaining === Infinity
                            ? "unbekannt"
                            : `${goal.prognosis.monthsRemaining} Monat${
                                goal.prognosis.monthsRemaining !== 1 ? "en" : ""
                              }`}
                        </strong>
                        {goal.prognosis.estimatedDate && (
                          <>
                            {" "}
                            (ca. <strong>{formatDate(goal.prognosis.estimatedDate)}</strong>)
                          </>
                        )}
                        .
                        {goal.deadline && (
                          <span
                            style={{
                              marginLeft: 8,
                              color: goal.prognosis.isAchievable
                                ? "var(--green)"
                                : "var(--red)",
                              fontWeight: 600,
                            }}
                          >
                            {goal.prognosis.isAchievable
                              ? "Deadline erreichbar!"
                              : "Deadline wird voraussichtlich nicht erreicht."}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="hb-muted">
                        Noch keine Daten für Prognose vorhanden. Buche Transfers, um eine
                        Prognose zu erhalten.
                      </span>
                    )}
                  </div>
                )}

                {goal.progress.percent >= 100 && (
                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--green-soft)",
                      borderRadius: 6,
                      marginTop: 8,
                      color: "var(--green)",
                      fontWeight: 600,
                    }}
                  >
                    Ziel erreicht! Herzlichen Glückwunsch!
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Sparziel erstellen/bearbeiten */}
      <EditDialog
        open={dialogOpen}
        title={editingGoal ? "Sparziel bearbeiten" : "Neues Sparziel"}
        onClose={closeDialog}
        onSave={saveGoal}
        canSave={canSave}
        saveLabel={editingGoal ? "Speichern" : "Erstellen"}
      >
        <div className="hb-form" style={{ flexDirection: "column", gap: 14 }}>
          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Urlaub 2026"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Zielbetrag (CHF)</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 10000"
              value={draft.targetAmount}
              onChange={(e) => setDraft((d) => ({ ...d, targetAmount: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Deadline (optional)</div>
            <input
              className="hb-input"
              type="date"
              value={draft.deadline}
              onChange={(e) => setDraft((d) => ({ ...d, deadline: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Spartopf</div>
            <select
              className="hb-input"
              value={draft.potId}
              onChange={(e) => setDraft((d) => ({ ...d, potId: e.target.value }))}
            >
              {pots.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="hb-field">
            <div className="hb-label">Transfer-Zweck (optional)</div>
            <select
              className="hb-input"
              value={draft.transferCategory}
              onChange={(e) => setDraft((d) => ({ ...d, transferCategory: e.target.value }))}
            >
              <option value="">Alle (Topf-Gesamtstand)</option>
              {transferCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <div className="hb-muted" style={{ marginTop: 4 }}>
              {draft.transferCategory
                ? "Nur Transfers mit diesem Zweck werden gezählt"
                : "Der gesamte Topf-Stand wird gemessen (Einzahlungen - Entnahmen)"}
            </div>
          </div>

          <div className="hb-field">
            <div className="hb-label">Startpunkt</div>
            <select
              className="hb-input"
              value={draft.startMode}
              onChange={(e) => setDraft((d) => ({ ...d, startMode: e.target.value }))}
            >
              <option value="zero">Ab Null (alle Buchungen zählen)</option>
              <option value="date">Ab bestimmtem Datum</option>
              <option value="custom">Manueller Anfangsbetrag</option>
            </select>
          </div>

          {draft.startMode === "date" && (
            <div className="hb-field">
              <div className="hb-label">Startdatum</div>
              <input
                className="hb-input"
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
              />
              <div className="hb-muted" style={{ marginTop: 4 }}>
                Nur Buchungen ab diesem Datum werden berücksichtigt
              </div>
            </div>
          )}

          {draft.startMode === "custom" && (
            <div className="hb-field">
              <div className="hb-label">Anfangsbetrag (CHF)</div>
              <input
                className="hb-input"
                type="text"
                inputMode="decimal"
                placeholder="z.B. 500"
                value={draft.startAmount}
                onChange={(e) => setDraft((d) => ({ ...d, startAmount: e.target.value }))}
              />
              <div className="hb-muted" style={{ marginTop: 4 }}>
                Dieser Betrag wird als Startbasis zum berechneten Fortschritt addiert
              </div>
            </div>
          )}
        </div>
      </EditDialog>
    </div>
  );
}
