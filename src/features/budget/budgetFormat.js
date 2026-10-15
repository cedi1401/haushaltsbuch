// Beträge ohne Nachkommastellen. Vorher runden: sonst wird aus einer
// Überschreitung um ein paar Rappen eine „−0".
export function budgetMoney(fmt, value) {
  return value == null ? null : fmt(Math.round(value) || 0, 0);
}
