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
 * Prognose: rot, wenn der laufende Monat überzogen wird. Vergangene Monate
 * sind abgeschlossen, zukünftige haben noch keine Ist-Daten.
 */
export function forecastAlert(forecast) {
  if (!forecast?.hasMonth || !forecast.isCurrentMonth) return null;
  return forecastHeroState(forecast) === "over" ? "error" : null;
}
