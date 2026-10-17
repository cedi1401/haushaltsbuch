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
import { formatPercent, parseAmount, todayISO } from "../utils/formatUtils.js";
import {
  findTransferCategoryByName,
  getGoalPurposes,
  makeTransferCategory,
  MAX_TRANSFER_NAME_LENGTH,
  purposeHasEntries,
  purposeToGoal,
} from "../utils/transferCategoryUtils.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/toastContext.js";
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
  const pots = activeBook?.pots || EMPTY_ARRAY;
  const transferCategories = activeBook?.transferCategories || EMPTY_ARRAY;
  // Seit Schema 7 ist ein Sparziel ein Zweck mit der Regel „goal"; sein
  // Ist-Stand ist das Netto dieses Zwecks im Topf.
  const goals = useMemo(
    () => getGoalPurposes(transferCategories).map(purposeToGoal),
    [transferCategories]
  );
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
  });

  // Berechne Fortschritt und Prognose für alle Ziele
  const goalsWithProgress = useMemo(() => {
    return goals.map((goal) => ({
      ...goal,
      progress: calcGoalProgress(goal, entries),
      prognosis: calcGoalPrognosis(goal, entries, todayISO(), monthStartDay),
    }));
    // todayISO is a stable module import → intentionally not a dependency
  }, [goals, entries, monthStartDay]);

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
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingGoal(null);
  }

  // Schreibt in den Zweck des Ziels; alle Ziel-Aktionen laufen hierüber.
  function updatePurpose(id, patch) {
    const updated = transferCategories.map((c) => (c.id === id ? { ...c, ...patch } : c));
    onUpdateBook({ ...activeBook, transferCategories: updated });
  }

  function saveGoal() {
    if (!activeBook) return;
    if (!canSave) return;

    const goalData = {
      name: draft.name.trim(),
      targetAmount: parseAmount(draft.targetAmount),
      deadline: draft.deadline || null,
      potId: draft.potId,
    };

    if (editingGoal) {
      updatePurpose(editingGoal.id, goalData);
    } else if (adoptPurpose) {
      updatePurpose(adoptPurpose.id, {
        ...goalData,
        rule: "goal",
        createdAt: todayISO(),
        completedAt: null,
        completedAmount: null,
      });
    } else {
      const newPurpose = {
        ...makeTransferCategory(goalData.name, goalData.potId),
        ...goalData,
        rule: "goal",
        createdAt: todayISO(),
        completedAt: null,
        completedAmount: null,
      };
      onUpdateBook({ ...activeBook, transferCategories: [...transferCategories, newPurpose] });
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
    // Wie beim Löschen eines Zwecks: weich, damit bestehende Buchungen ihren
    // Namen behalten. Das Geld bleibt im Topf.
    updatePurpose(goalId, { deleted: true });
    toast.success("Sparziel gelöscht.");
  }

  // Erreichtes Ziel abschließen → wandert ins Archiv (Geld bleibt im Topf)
  function archiveGoal(goal) {
    if (!activeBook) return;
    updatePurpose(goal.id, { completedAt: todayISO(), completedAmount: goal.progress.current });
    toast.success(`Sparziel „${goal.name}“ abgeschlossen.`);
  }

  // Abgeschlossenes Ziel wieder aktivieren
  function reactivateGoal(goal) {
    if (!activeBook) return;
    updatePurpose(goal.id, { completedAt: null, completedAmount: null });
    toast.success(`Sparziel „${goal.name}“ wieder aktiviert.`);
  }

  // Ein Sparziel ist ein Zweck, und Zweck-Namen sind eindeutig. Beim Anlegen
  // darf der Name einen freien Zweck im selben Topf treffen: Der wird dann zum
  // Ziel, seine bisherigen Buchungen zählen mit.
  const sameNamePurpose = draft.name.trim()
    ? findTransferCategoryByName(transferCategories, draft.name, { excludeId: editingGoal?.id })
    : null;
  const adoptPurpose =
    !editingGoal && sameNamePurpose?.rule === "free" && sameNamePurpose.potId === draft.potId
      ? sameNamePurpose
      : null;
  let nameError = null;
  if (draft.name.trim().length > MAX_TRANSFER_NAME_LENGTH) {
    nameError = `Der Name ist zu lang (max. ${MAX_TRANSFER_NAME_LENGTH} Zeichen).`;
  } else if (sameNamePurpose && !adoptPurpose) {
    // Wie in den Fixkosten: Ein freier Zweck in einem anderen Topf ließe sich
    // übernehmen, wenn der Topf passt — darauf hinweisen.
    nameError =
      !editingGoal && sameNamePurpose.rule === "free" && sameNamePurpose.potId !== draft.potId
        ? "Es gibt bereits einen Transfer-Zweck mit diesem Namen, aber in einem anderen Topf."
        : "Es gibt bereits einen Transfer-Zweck mit diesem Namen.";
  }

  // Hat das Ziel schon Buchungen, steht sein Topf fest — ein Wechsel ließe sie
  // im alten Topf zurück.
  const potLocked = !!editingGoal && purposeHasEntries(entries, editingGoal.id);

  const draftTarget = parseAmount(draft.targetAmount);
  const canSave =
    !!draft.name.trim() &&
    !nameError &&
    Number.isFinite(draftTarget) &&
    draftTarget > 0 &&
    !!draft.potId;

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

  function deadlineStatusLabel(prognosis) {
    if (prognosis.deadlinePassed) return "Überschritten";
    return prognosis.isAchievable ? "Erreichbar" : "Nicht erreichbar";
  }

  // Zeigt, wie viel ab jetzt monatlich nötig wäre, um die Deadline zu halten.
  function renderRequiredMonthly(goal) {
    const p = goal.prognosis;
    if (!goal.deadline || goal.progress.remaining <= 0) return null;
    if (p.deadlinePassed || p.requiredMonthly == null || !p.monthsToDeadline) return null;

    const months = p.monthsToDeadline;
    return (
      <div className="hb-goal-prognosis-row">
        <span className="hb-goal-prognosis-label">Nötig pro Monat</span>
        <span
          className={
            p.isAchievable
              ? "hb-goal-prognosis-value"
              : "hb-goal-prognosis-value hb-goal-prognosis-value--warn"
          }
        >
          {fmt(p.requiredMonthly)}
          <span className="hb-muted" style={{ fontWeight: 500 }}>
            {" "}· noch {months} Monat{months !== 1 ? "e" : ""}
          </span>
        </span>
      </div>
    );
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
      <div className="hb-view-actions">
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
              <div className="hb-stat-pill-sub">{stats.activeThisYearCount} davon aktiv</div>
            </div>

            <div className="hb-stat-pill hb-stat-pill--ok">
              <div className="hb-stat-pill-label">Erreicht</div>
              <div className="hb-stat-pill-value hb-ok">{stats.completedCount}</div>
              <div className="hb-stat-pill-sub">{formatPercent(stats.successRate, { digits: 0, sign: false })} Erfolgsquote</div>
            </div>

            <div className="hb-stat-pill hb-stat-pill--accent">
              <div className="hb-stat-pill-label">Erfüllungsgrad aktiv</div>
              <div className="hb-stat-pill-value">{formatPercent(stats.avgActivePercent, { digits: 0, sign: false })}</div>
              <div className="hb-meter hb-meter--sm hb-meter--animated hb-stat-pill-gauge-track">
                <div
                  className="hb-meter-fill"
                  style={{ width: `${stats.avgActivePercent}%`, background: "var(--accent)" }}
                />
              </div>
            </div>

            <div className="hb-stat-pill hb-stat-pill--ok">
              <div className="hb-stat-pill-label">Gesamt angespart</div>
              <div className="hb-stat-pill-value hb-ok">{fmt(stats.totalSaved)}</div>
              <div className="hb-stat-pill-sub">von {fmt(stats.totalTarget)} Gesamtziel</div>
              <div className="hb-meter hb-meter--sm hb-meter--animated hb-stat-pill-gauge-track">
                <div
                  className="hb-meter-fill"
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
                      {goal.deadline && (
                        <span className="hb-goal-badge hb-goal-badge--deadline">
                          Bis {formatDate(goal.deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                  <OverflowMenu
                    buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
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
                    {formatPercent(goal.progress.percent, { digits: 0, sign: false })}
                  </div>
                </div>

                <div className="hb-meter hb-meter--lg hb-meter--animated hb-goal-progress-bg">
                  <div
                    className={"hb-meter-fill" + (goal.progress.percent > 0 ? " hb-meter-fill--min" : "")}
                    style={{ width: `${Math.min(goal.progress.percent, 100)}%` }}
                  />
                </div>

                {goal.progress.remaining > 0 && (
                  <div className="hb-muted hb-muted--sm" style={{ marginTop: 6 }}>
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
                              {deadlineStatusLabel(goal.prognosis)}
                            </span>
                          </div>
                        )}
                        {renderRequiredMonthly(goal)}
                      </>
                    ) : (
                      <>
                        <div className="hb-goal-prognosis-row">
                          <span className="hb-muted hb-muted--sm">
                            Noch keine Daten für Prognose. Buche Transfers, um eine Prognose zu erhalten.
                          </span>
                        </div>
                        {renderRequiredMonthly(goal)}
                      </>
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
                            </div>
                          </div>
                          <OverflowMenu
                            buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
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
          <div className="hb-form-stack">
            <div className="hb-field">
              <div className="hb-label">Name</div>
              <input
                className="hb-input"
                type="text"
                placeholder="z.B. Urlaub 2026"
                value={draft.name}
                aria-invalid={nameError ? "true" : undefined}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
              {nameError && <div className="hb-fixed-field-error">{nameError}</div>}
              {adoptPurpose && (
                <div className="hb-muted" style={{ marginTop: 4 }}>
                  Der bestehende Zweck „{adoptPurpose.name}“ wird zum Sparziel, seine Buchungen
                  zählen mit.
                </div>
              )}
            </div>

            {/* Zielbetrag + Deadline gehören logisch zusammen (Ziel + Zeitrahmen) */}
            <div className="hb-two hb-two--dialog">
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
                <HbDatePicker
                  value={draft.deadline}
                  onChange={(v) => setDraft((d) => ({ ...d, deadline: v }))}
                  placeholder="Kein Enddatum"
                  clearable
                />
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)" }} />

          {/* Bereich: Topf-Zuordnung. Das Ziel ist selbst ein Transfer-Zweck im
              Topf; es zählen alle Buchungen auf diesen Zweck. */}
          <div className="hb-form-stack">
            <div className="hb-field">
              <div className="hb-label">Spartopf</div>
              <select
                className="hb-input"
                value={draft.potId}
                disabled={potLocked}
                onChange={(e) => setDraft((d) => ({ ...d, potId: e.target.value }))}
              >
                {pots.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="hb-muted" style={{ marginTop: 4 }}>
                {potLocked
                  ? "Das Ziel hat schon Buchungen in diesem Topf, der Topf steht deshalb fest."
                  : `${editingGoal ? "Das Ziel ist ein Transfer-Zweck in diesem Topf." : "Das Ziel wird als Transfer-Zweck in diesem Topf angelegt."} Es zählen alle Transfers und Entnahmen mit diesem Zweck.`}
              </div>
            </div>
          </div>
        </div>
      </EditDialog>
    </div>
  );
}
