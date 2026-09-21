// Schreibt den Tages-Snapshot des Depotwerts (Beschluss F).
//
// Die Verlaufskurve entsteht nicht aus einer Rückrechnung, sondern daraus, dass
// die App bei jeder vollständigen Bewertung den Tageswert wegschreibt. Der
// Hook ist deshalb absichtlich stumm: er hat keine sichtbare Rückmeldung und
// darf nie eine Aktion des Nutzers blockieren.
//
// Zwei Regeln halten das Ganze harmlos:
//   1. `buildSnapshot` verweigert unvollständige Tage. Eine einzige offene
//      Position ohne Kurs genügt — ein zu tiefer Punkt bliebe für immer in der
//      Kurve stehen und wäre später nicht mehr als Fehler erkennbar.
//   2. `sameSnapshot` vergleicht vor dem Schreiben. Ohne diesen Vergleich
//      löste jeder Schreibvorgang eine neue Berechnung aus, die wieder
//      schriebe — eine Endlosschleife über den Buch-Speicher.

import { useEffect } from "react";
import { todayISO } from "../utils/hbUtils.js";
import { buildSnapshot, sameSnapshot, upsertSnapshot } from "../utils/investmentUtils.js";

/**
 * @param {object} params
 * @param {object} params.investments book.investments
 * @param {Array<object>} params.depotSummaries Ergebnis von calcDepotSummaries
 * @param {string} params.baseCurrency Buchwährung
 * @param {boolean} params.enabled false, solange noch abgerufen wird oder es
 *   nichts zu sichern gibt
 * @param {(next: object) => void} params.onChange schreibt die neue Struktur ins Buch
 */
export function useSnapshotRecorder({
  investments,
  depotSummaries,
  baseCurrency,
  enabled,
  onChange,
}) {
  useEffect(() => {
    if (!enabled || typeof onChange !== "function") return;

    // Das lokale Datum, nicht UTC: um 00:30 Uhr MESZ ist in UTC noch gestern,
    // und der Punkt gehörte auf den falschen Tag.
    const date = todayISO();
    const snapshot = buildSnapshot(depotSummaries, { date, currency: baseCurrency });
    if (!snapshot) return;

    const existing = (investments?.snapshots || []).find((s) => s.date === date);
    if (sameSnapshot(existing, snapshot)) return;

    onChange({
      ...investments,
      snapshots: upsertSnapshot(investments?.snapshots, snapshot),
    });
  }, [enabled, investments, depotSummaries, baseCurrency, onChange]);
}

export default useSnapshotRecorder;
