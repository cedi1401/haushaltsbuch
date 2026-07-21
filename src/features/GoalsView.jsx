import React, { useMemo, useState } from "react";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { Card, CardContent, Button } from "../components/ui.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
import EditDialog from "../components/EditDialog.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import {
  calcGoalProgress,
  calcGoalPrognosis,
  calcGoalArchiveStats,
} from "../utils/goalUtils.js";
import { parseAmount, todayISO } from "../utils/hbUtils.js";
import { generateId } from "../utils/idUtils.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { IconGoals, IconPlus, IconCheck } from "../components/icons.jsx";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";

export default function GoalsView({
  activeBook,
  entries,
  onUpdateBook,
  monthStartDay = 1,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
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
    // todayISO is a stable module import → intentionally not a dependency
  }, [goals, entries, pots, monthStartDay]);

  // Aktive vs. abgeschlossene (archivierte) Ziele
  const activeGoals = useMemo(
    () => goalsWithProgress.filter((g) => !g.completedAt),
    [goalsWithProgress]
  );
  const archivedGoals = useMemo(
    () =>
      goalsWithProgress
        .filter((g) => g.completedAt)
        .map((g) => ({ ...g, archive: calcGoalArchiveStats(g, entries) }))
        .toSorted((a, b) =>
          String(b.completedAt).localeCompare(String(a.completedAt))
        ),
    [goalsWithProgress, entries]
  );

  // KPIs über alle Ziele
  const stats = useMemo(() => {
    const all = goalsWithProgress;
    const currentYear = new Date().getFullYear();

    const createdThisYear = all.filter(
      (g) => g.createdAt && new Date(g.createdAt).getFullYear() === currentYear
    );
    const activeThisYear = createdThisYear.filter((g) => !g.completedAt);

    const completedCount = all.filter((g) => g.completedAt).length;
    const successRate =
      all.length > 0 ? Math.round((completedCount / all.length) * 100) : 0;

    const avgActivePercent =
      activeGoals.length > 0
        ? Math.round(
            activeGoals.reduce(
              (s, g) => s + Math.min(g.progress.percent, 100),
              0
            ) / activeGoals.length
          )
        : 0;

    const totalSaved = activeGoals.reduce((s, g) => s + g.progress.current, 0);
    const totalTarget = activeGoals.reduce((s, g) => s + g.progress.target, 0);
    const totalPercent =
      totalTarget > 0
        ? Math.min(100, Math.round((totalSaved / totalTarget) * 100))
        : 0;

    return {
      currentYear,
      createdThisYearCount: createdThisYear.length,
      activeThisYearCount: activeThisYear.length,
      completedCount,
      successRate,
      avgActivePercent,
      totalSaved,
      totalTarget,
      totalPercent,
    };
  }, [goalsWithProgress, activeGoals]);

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

  // Erreichtes Ziel abschließen → wandert ins Archiv (Geld bleibt im Topf)
  function archiveGoal(goal) {
    if (!activeBook) return;
    const updatedGoals = goals.map((g) =>
      g.id === goal.id
        ? { ...g, completedAt: todayISO(), completedAmount: goal.progress.current }
        : g
    );
    onUpdateBook({ ...activeBook, goals: updatedGoals });
    toast.success(`Sparziel „${goal.name}“ abgeschlossen.`);
  }

  // Abgeschlossenes Ziel wieder aktivieren
  function reactivateGoal(goal) {
    if (!activeBook) return;
    const updatedGoals = goals.map((g) =>
      g.id === goal.id ? { ...g, completedAt: null, completedAmount: null } : g
    );
    onUpdateBook({ ...activeBook, goals: updatedGoals });
    toast.success(`Sparziel „${goal.name}“ wieder aktiviert.`);
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

  function formatPeriod(arch) {
    if (!arch) return "—";
    if (arch.durationMonths != null && arch.durationMonths >= 1) {
      return `${arch.durationMonths} Monat${arch.durationMonths !== 1 ? "e" : ""}`;
    }
    if (arch.durationDays != null) {
      return `${arch.durationDays} Tag${arch.durationDays !== 1 ? "e" : ""}`;
    }
    return "—";
  }

  function deadlineLabel(delta) {
    if (delta == null) return null;
    if (delta > 0) return `${delta} Tag${delta !== 1 ? "e" : ""} vor Deadline`;
    if (delta === 0) return "Pünktlich zur Deadline";
    const abs = Math.abs(delta);
    return `${abs} Tag${abs !== 1 ? "e" : ""} nach Deadline`;
  }

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <div className="hb-section-title">Definiere Ziele und verfolge deinen Fortschritt</div>
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
        <>
          {/* KPI-Übersicht */}
          <div
            className="hb-stat-pills"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            <div className="hb-stat-pill hb-stat-pill--accent">
              <div className="hb-stat-pill-label">Angelegt {stats.currentYear}</div>
              <div className="hb-stat-pill-value">{stats.createdThisYearCount}</div>
              <div className="hb-stat-pill-sub hb-stat-pill-sub--lg">{stats.activeThisYearCount} davon aktiv</div>
            </div>

            <div className="hb-stat-pill hb-stat-pill--ok">
              <div className="hb-stat-pill-label">Erreicht</div>
              <div className="hb-stat-pill-value hb-ok">{stats.completedCount}</div>
              <div className="hb-stat-pill-sub hb-stat-pill-sub--lg">{stats.successRate}% Erfolgsquote</div>
            </div>

            <div className="hb-stat-pill hb-stat-pill--accent">
              <div className="hb-stat-pill-label">Erfüllungsgrad aktiv</div>
              <div className="hb-stat-pill-value">{stats.avgActivePercent}%</div>
              <div className="hb-stat-pill-gauge-track">
                <div
                  className="hb-stat-pill-gauge-fill"
                  style={{ width: `${stats.avgActivePercent}%`, background: "var(--accent)" }}
                />
              </div>
            </div>

            <div className="hb-stat-pill hb-stat-pill--ok">
              <div className="hb-stat-pill-label">Gesamt angespart</div>
              <div className="hb-stat-pill-value">{fmt(stats.totalSaved)}</div>
              <div className="hb-stat-pill-sub">von {fmt(stats.totalTarget)} Gesamtziel</div>
              <div className="hb-stat-pill-gauge-track">
                <div
                  className="hb-stat-pill-gauge-fill"
                  style={{ width: `${stats.totalPercent}%`, background: "var(--green)" }}
                />
              </div>
            </div>
          </div>

          {activeGoals.length === 0 ? (
            <Card>
              <CardContent>
                <div className="hb-empty">
                  <div className="hb-empty-icon"><IconCheck /></div>
                  <div className="hb-empty-title">Alle Ziele abgeschlossen</div>
                  <div className="hb-empty-text">
                    Du hast aktuell keine aktiven Sparziele. Lege ein neues an oder
                    sieh dir deine erreichten Ziele unten an.
                  </div>
                  <Button onClick={openCreateDialog}>
                    <IconPlus /> Neues Sparziel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="hb-two">
              {activeGoals.map((goal) => (
                <Card key={goal.id} style={{ display: "flex", flexDirection: "column" }}>
                  <CardContent style={{ flex: 1, display: "flex", flexDirection: "column" }}>

                {/* Header: Name + Badges + Actions */}
                <div className="hb-goal-header">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="hb-goal-title">{goal.name}</h3>
                    <div className="hb-goal-badges">
                      <span className="hb-goal-badge">Topf: {getPotName(goal)}</span>
                      {goal.transferCategory && (
                        <span className="hb-goal-badge hb-goal-badge--accent">
                          Zweck: {goal.transferCategory}
                        </span>
                      )}
                      {goal.deadline && (
                        <span className="hb-goal-badge hb-goal-badge--deadline">
                          Bis {formatDate(goal.deadline)}
                        </span>
                      )}
                      <span className="hb-goal-badge">{getStartModeLabel(goal)}</span>
                    </div>
                  </div>
                  <OverflowMenu
                    items={[
                      { label: "Bearbeiten", onClick: () => openEditDialog(goal) },
                      { label: "Löschen", danger: true, onClick: () => deleteGoal(goal.id) },
                    ]}
                  />
                </div>

                {/* Fortschritt */}
                <div className="hb-goal-progress-header">
                  <div className="hb-goal-amounts">
                    <div className="hb-goal-amount-current">{fmt(goal.progress.current)}</div>
                    <div className="hb-goal-amount-target">von {fmt(goal.progress.target)}</div>
                  </div>
                  <div className={goal.progress.percent >= 100
                    ? "hb-goal-percent hb-goal-percent--done"
                    : "hb-goal-percent"}>
                    {goal.progress.percent}%
                  </div>
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

                {/* Prognose */}
                {goal.progress.percent < 100 && (
                  <div className="hb-goal-prognosis">
                    {goal.prognosis.avgMonthly > 0 ? (
                      <>
                        <div className="hb-goal-prognosis-row">
                          <span className="hb-goal-prognosis-label">Ø pro Monat</span>
                          <span className="hb-goal-prognosis-value">
                            {fmt(goal.prognosis.avgMonthly)}
                          </span>
                        </div>
                        <div className="hb-goal-prognosis-row">
                          <span className="hb-goal-prognosis-label">Fertig in ca.</span>
                          <span className="hb-goal-prognosis-value">
                            {goal.prognosis.monthsRemaining === Infinity
                              ? "unbekannt"
                              : `${goal.prognosis.monthsRemaining} Monat${
                                  goal.prognosis.monthsRemaining !== 1 ? "en" : ""
                                }`}
                            {goal.prognosis.estimatedDate && (
                              <> ({formatDate(goal.prognosis.estimatedDate)})</>
                            )}
                          </span>
                        </div>
                        {goal.deadline && (
                          <div className="hb-goal-prognosis-row">
                            <span className="hb-goal-prognosis-label">Deadline</span>
                            <span className={goal.prognosis.isAchievable
                              ? "hb-goal-prognosis-value hb-goal-prognosis-value--ok"
                              : "hb-goal-prognosis-value hb-goal-prognosis-value--bad"}>
                              {goal.prognosis.isAchievable ? "Erreichbar" : "Nicht erreichbar"}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="hb-goal-prognosis-row">
                        <span className="hb-muted" style={{ fontSize: 12 }}>
                          Noch keine Daten für Prognose. Buche Transfers, um eine Prognose zu erhalten.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Ziel erreicht */}
                {goal.progress.percent >= 100 && (
                  <div className="hb-goal-success-wrap">
                    <div className="hb-goal-success-row">
                      <div className="hb-goal-success">
                        Ziel erreicht! Herzlichen Glückwunsch!
                      </div>
                      <Button variant="outline" size="sm" onClick={() => archiveGoal(goal)}>
                        <IconCheck strokeWidth={3} /> Abschließen
                      </Button>
                    </div>
                  </div>
                )}

                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Archiv: abgeschlossene Sparziele */}
          {archivedGoals.length > 0 && (
            <div className="hb-goal-archive">
              <div className="hb-row" style={{ alignItems: "center", margin: "28px 0 12px" }}>
                <div className="hb-title-group">
                  <h3 className="hb-card-title">Geschafft</h3>
                  <span className="hb-info-pill hb-info-pill--title">
                    {archivedGoals.length} {archivedGoals.length === 1 ? "Ziel" : "Ziele"}
                  </span>
                </div>
              </div>

              <div className="hb-two">
                {archivedGoals.map((goal) => {
                  const arch = goal.archive;
                  const dl = deadlineLabel(arch?.deadlineDelta);
                  return (
                    <Card key={goal.id} className="hb-goal-card--archived">
                      <CardContent>
                        <div className="hb-goal-header">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <h3 className="hb-goal-title">{goal.name}</h3>
                            <div className="hb-goal-badges">
                              <span className="hb-goal-badge hb-goal-badge--done">
                                Erreicht am {formatDate(goal.completedAt)}
                              </span>
                              <span className="hb-goal-badge">Topf: {getPotName(goal)}</span>
                              {goal.transferCategory && (
                                <span className="hb-goal-badge hb-goal-badge--accent">
                                  Zweck: {goal.transferCategory}
                                </span>
                              )}
                            </div>
                          </div>
                          <OverflowMenu
                            items={[
                              { label: "Wieder aktivieren", onClick: () => reactivateGoal(goal) },
                              { label: "Entfernen", danger: true, onClick: () => deleteGoal(goal.id) },
                            ]}
                          />
                        </div>

                        <div className="hb-goal-archive-stats">
                          <div className="hb-goal-archive-stat">
                            <span className="hb-goal-archive-stat-label">Angespart</span>
                            <span className="hb-goal-archive-stat-value">
                              {fmt(arch?.savedAmount ?? 0)}
                              <span className="hb-muted" style={{ fontWeight: 500 }}>
                                {" "}von {fmt(arch?.target ?? 0)}
                              </span>
                            </span>
                          </div>
                          <div className="hb-goal-archive-stat">
                            <span className="hb-goal-archive-stat-label">Sparzeitraum</span>
                            <span className="hb-goal-archive-stat-value">{formatPeriod(arch)}</span>
                          </div>
                          <div className="hb-goal-archive-stat">
                            <span className="hb-goal-archive-stat-label">Ø pro Monat</span>
                            <span className="hb-goal-archive-stat-value">{fmt(arch?.avgMonthly ?? 0)}</span>
                          </div>
                          <div className="hb-goal-archive-stat">
                            <span className="hb-goal-archive-stat-label">Einzahlungen</span>
                            <span className="hb-goal-archive-stat-value">{arch?.depositCount ?? 0}</span>
                          </div>
                          {dl && (
                            <div className="hb-goal-archive-stat">
                              <span className="hb-goal-archive-stat-label">Deadline</span>
                              <span
                                className={`hb-goal-archive-stat-value ${
                                  arch.deadlineDelta >= 0 ? "hb-ok" : "hb-bad"
                                }`}
                              >
                                {dl}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialog: Sparziel erstellen/bearbeiten */}
      <EditDialog
        open={dialogOpen}
        title={editingGoal ? "Sparziel bearbeiten" : "Neues Sparziel"}
        onClose={closeDialog}
        onSave={saveGoal}
        canSave={canSave}
        saveLabel={editingGoal ? "Speichern" : "Erstellen"}
        bodyScroll={false}
      >
        <div
          className="hb-form"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 20,
            alignItems: "stretch",
          }}
        >
          {/* Bereich: Grunddaten */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div className="hb-field" style={{ minWidth: 0 }}>
              <div className="hb-label">Name</div>
              <input
                className="hb-input"
                style={{ minWidth: 0, width: "100%" }}
                type="text"
                placeholder="z.B. Urlaub 2026"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            {/* Zielbetrag + Deadline gehören logisch zusammen (Ziel + Zeitrahmen) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <div className="hb-field" style={{ minWidth: 0 }}>
                <div className="hb-label">Zielbetrag ({baseCurrency})</div>
                <input
                  className="hb-input"
                  style={{ minWidth: 0, width: "100%" }}
                  type="text"
                  inputMode="decimal"
                  placeholder="z.B. 10000"
                  value={draft.targetAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, targetAmount: e.target.value }))}
                />
              </div>

              <div className="hb-field" style={{ minWidth: 0 }}>
                <div className="hb-label">Deadline (optional)</div>
                <HbDatePicker
                  value={draft.deadline}
                  onChange={(v) => setDraft((d) => ({ ...d, deadline: v }))}
                  style={{ minWidth: 0, width: "100%" }}
                  placeholder="Kein Enddatum"
                />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)" }} />

          {/* Bereich: Topf-Zuordnung (was und wie gemessen wird) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div className="hb-field" style={{ minWidth: 0 }}>
              <div className="hb-label">Spartopf</div>
              <select
                className="hb-input"
                style={{ minWidth: 0, width: "100%" }}
                value={draft.potId}
                onChange={(e) => setDraft((d) => ({ ...d, potId: e.target.value }))}
              >
                {pots.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="hb-field" style={{ minWidth: 0 }}>
              <div className="hb-label">Transfer-Zweck (optional)</div>
              <select
                className="hb-input"
                style={{ minWidth: 0, width: "100%" }}
                value={draft.transferCategory}
                onChange={(e) => setDraft((d) => ({ ...d, transferCategory: e.target.value }))}
              >
                <option value="">Alle (Topf-Gesamtstand)</option>
                {transferCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {draft.transferCategory && (
                <div className="hb-muted" style={{ marginTop: 4 }}>
                  Nur Transfers mit diesem Zweck werden gezählt
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)" }} />

          {/* Bereich: Startpunkt */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div className="hb-field" style={{ minWidth: 0 }}>
              <div className="hb-label">Startpunkt</div>
              <select
                className="hb-input"
                style={{ minWidth: 0, width: "100%" }}
                value={draft.startMode}
                onChange={(e) => setDraft((d) => ({ ...d, startMode: e.target.value }))}
              >
                <option value="zero">Ab Null (alle Buchungen zählen)</option>
                <option value="date">Ab bestimmtem Datum</option>
                <option value="custom">Manueller Anfangsbetrag</option>
              </select>
            </div>

            {draft.startMode === "date" && (
              <div className="hb-field" style={{ minWidth: 0 }}>
                <div className="hb-label">Startdatum</div>
                <HbDatePicker
                  value={draft.startDate}
                  onChange={(v) => setDraft((d) => ({ ...d, startDate: v }))}
                  style={{ minWidth: 0, width: "100%" }}
                />
                <div className="hb-muted" style={{ marginTop: 4 }}>
                  Nur Buchungen ab diesem Datum werden berücksichtigt
                </div>
              </div>
            )}

            {draft.startMode === "custom" && (
              <div className="hb-field" style={{ minWidth: 0 }}>
                <div className="hb-label">Anfangsbetrag ({baseCurrency})</div>
                <input
                  className="hb-input"
                  style={{ minWidth: 0, width: "100%" }}
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
        </div>
      </EditDialog>
    </div>
  );
}
