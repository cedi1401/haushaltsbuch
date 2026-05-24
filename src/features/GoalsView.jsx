import React, { useMemo, useState } from "react";

const EMPTY_ARRAY = [];
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { calcGoalProgress, calcGoalPrognosis } from "../utils/goalUtils.js";
import { parseAmount } from "../utils/hbUtils.js";
import { generateId } from "../utils/idUtils.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { IconEdit, IconDelete, IconGoals, IconPlus } from "../components/icons.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";

export default function GoalsView({
  activeBook,
  entries,
  baseCurrency = "CHF",
  onUpdateBook,
  todayISO,
  monthStartDay = 1,
}) {
  const fmt = useFmt();
  const goals = activeBook?.goals || EMPTY_ARRAY;
  const pots = activeBook?.pots || EMPTY_ARRAY;
  const transferCategories = activeBook?.transferCategories || [];
  const { confirm } = useConfirm();
  const toast = useToast();

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
      prognosis: calcGoalPrognosis(goal, entries, todayISO(), monthStartDay),
    }));
  }, [goals, entries, pots, todayISO, monthStartDay]);

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

    const numericAmount = parseAmount(draft.targetAmount);
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
        ? (parseAmount(draft.startAmount) || 0)
        : 0,
    };

    if (editingGoal) {
      const updatedGoals = goals.map((g) =>
        g.id === editingGoal.id ? { ...g, ...goalData } : g
      );
      onUpdateBook({ ...activeBook, goals: updatedGoals });
    } else {
      const newGoal = {
        id: generateId("goal"),
        ...goalData,
        createdAt: todayISO(),
      };
      onUpdateBook({ ...activeBook, goals: [...goals, newGoal] });
    }

    closeDialog();
  }

  async function deleteGoal(goalId) {
    if (!activeBook) return;
    const goal = goals.find((g) => g.id === goalId);
    const msg = goal
      ? `Sparziel „${goal.name}“ wirklich löschen?`
      : "Sparziel wirklich löschen?";
    const ok = await confirm({
      title: "Sparziel löschen",
      message: msg,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    const updatedGoals = goals.filter((g) => g.id !== goalId);
    onUpdateBook({ ...activeBook, goals: updatedGoals });
    toast.success("Sparziel gelöscht.");
  }

  const canSave = useMemo(() => {
    if (!draft.name.trim()) return false;
    const n = parseAmount(draft.targetAmount);
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
        return `Anfangsbetrag: ${fmt(goal.startAmount || 0)}`;
      case "zero":
      default:
        return "Ab Null (alle Buchungen)";
    }
  }

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Definiere Ziele und verfolge deinen Fortschritt</div>
        </div>

        <Button onClick={openCreateDialog}><IconPlus /> Neues Sparziel</Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconGoals /></div>
              <div className="hb-empty-title">Noch keine Sparziele</div>
              <div className="hb-empty-text">
                Definiere dein erstes Sparziel, um deinen Fortschritt im Blick zu behalten
                und eine realistische Prognose zu erhalten.
              </div>
              <Button onClick={openCreateDialog}>
                <IconPlus /> Neues Sparziel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="hb-stack hb-stack--lg">
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
                    <div className="hb-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {getStartModeLabel(goal)}
                    </div>
                  </div>

                  <div className="hb-actions">
                    <button
                      type="button"
                      className="hb-icon-btn"
                      onClick={() => openEditDialog(goal)}
                      title="Bearbeiten"
                      aria-label="Bearbeiten"
                    >
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      className="hb-icon-btn"
                      onClick={() => deleteGoal(goal.id)}
                      title="Löschen"
                      aria-label="Löschen"
                    >
                      <IconDelete />
                    </button>
                  </div>
                </div>

                {/* Fortschritt */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    className="hb-row"
                    style={{ marginBottom: 6, fontSize: 14 }}
                  >
                    <span>
                      <strong>{fmt(goal.progress.current)}</strong> von{" "}
                      <strong>{fmt(goal.progress.target)}</strong>
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
                      Noch {fmt(goal.progress.remaining)} bis zum Ziel
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
                      borderRadius: "var(--radius-md)",
                      marginTop: 8,
                    }}
                  >
                    <strong>Prognose:</strong>{" "}
                    {goal.prognosis.avgMonthly > 0 ? (
                      <>
                        Bei durchschnittlich{" "}
                        <strong>{fmt(goal.prognosis.avgMonthly)}</strong> pro Monat
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
                      borderRadius: "var(--radius-md)",
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
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Zielbetrag ({baseCurrency})</div>
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
              <div className="hb-label">Anfangsbetrag ({baseCurrency})</div>
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
