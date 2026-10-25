/**
 * Hinweis-Stufen der Insights-Tabs. Das Symbol hinter der Tab-Bezeichnung
 * meldet ein Problem, ohne dass man den Tab öffnen muss; die Bedingungen
 * stehen hier, damit Tab-Symbol und Inhalt des Tabs dasselbe sagen.
 *
 * Stufen: "error" (rot), "warning" (gelb), null (kein Symbol).
 */

/**
 * Ampel der Prognose: wie steht das voraussichtliche/tatsächliche Frei am
 * Monatsende? Logik „erst ausgeben, dann fegen": ein positiver Rest ist der
 * erwünschte Überschuss (wird gespart), nur ein Minus ist schlecht. Schwellen
 * relativ zum Frei-Budget. Für zukünftige Monate und ohne Frei-Budget null.
 */
export function forecastHeroState({ projectedBalance, freiBudget, isFutureMonth }) {
  if (isFutureMonth || !(freiBudget > 0)) return null;
  if (projectedBalance < -0.05 * freiBudget) return "over";
  if (projectedBalance > 0.1 * freiBudget) return "surplus";
  return "good";
}

/** Budget: rot, sobald ein Budget überschritten ist (wie die rote AlertBar). */
export function budgetAlert(budgetItems) {
  return (budgetItems || []).some((item) => item.status === "over") ? "error" : null;
}

/**
 * Prognose: rot, wenn der Monat überzogen wird (laufend) oder überzogen wurde
 * (abgeschlossen). Zukünftige Monate haben noch keine Ist-Daten.
 */
export function forecastAlert(forecast) {
  if (!forecast?.hasMonth) return null;
  return forecastHeroState(forecast) === "over" ? "error" : null;
}

/**
 * Rücklagen: rot bei einer überfälligen Rückstellung, gelb bei Rückstand.
 * „Fällig" bleibt ohne Symbol — am Zyklusende ist die Rechnung der Normalfall.
 */
export function reservesAlert(kpis) {
  if (kpis?.overdue > 0) return "error";
  if (kpis?.behind > 0) return "warning";
  return null;
}

// So viele Positionen nennt die Rücklagen-Warnung beim Namen.
const RESERVES_ALERT_NAMES = 3;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Text der Warnung im Rücklagen-Tab, zu `reservesAlert` passend: überfällige
 * Rückstellungen (rot) gehen vor Rückstand (gelb). Überfällig: die älteste
 * Fälligkeit zuerst. Rückstand: die größte Lücke zuerst, mit Betrag.
 * Liefert { title, message, tone } oder null.
 */
export function reservesAlertText(rows, fmt) {
  const name = (row) => row.purpose?.name || "Ohne Namen";
  const overdueRows = (rows || [])
    .filter((r) => r.status === "overdue")
    .sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));
  const behindRows = (rows || []).filter((r) => r.status === "behind").sort((a, b) => a.delta - b.delta);

  const isOverdue = overdueRows.length > 0;
  const alertRows = isOverdue ? overdueRows : behindRows;
  if (alertRows.length === 0) return null;

  const names = alertRows
    .slice(0, RESERVES_ALERT_NAMES)
    .map((r) => (isOverdue ? name(r) : `${name(r)} −${fmt(-r.delta)}`))
    .join(", ");
  const rest = alertRows.length - RESERVES_ALERT_NAMES;
  const count = plural(alertRows.length, "Rückstellung", "Rückstellungen");
  return {
    title: isOverdue ? `${count} überfällig` : `${count} im Rückstand`,
    message: rest > 0 ? `${names} und ${rest} weitere` : names,
    tone: isOverdue ? undefined : "warning",
  };
}
