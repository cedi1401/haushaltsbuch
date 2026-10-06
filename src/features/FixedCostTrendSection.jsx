import React, { memo, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, RangeTabs, ChartScrollNav } from "../components/ui.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import { ChartTooltip, ChartTooltipRow } from "../components/ChartTooltip.jsx";
import { ChartLegend } from "../components/ChartLegend.jsx";
import HbSparklineHover from "../components/HbSparklineHover.jsx";
import { IconTag, IconInfo } from "../components/icons.jsx";
import { useThemeColors } from "../hooks/themeColors.js";
import { getCategoryLabel, formatCurrencyCompact, formatPercent, fixedCostKind } from "../utils/hbUtils.js";
import { CHART_STROKE, AMOUNT_AXIS_WIDTH, axisProps, monthAxisProps } from "../utils/chartStyle.js";
import { FALLBACK_CATEGORY_COLOR } from "../utils/hbPalette.js";
import { monthlyRate, annualAmount, isSinkingFund } from "../utils/fixedCostUtils.js";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { MONTH_RANGE_OPTIONS } from "../utils/constants.js";

// Der zentrale Erklärtext der Kostenregel. Der letzte Satz löst auf, warum
// in der Übersichtsliste Zeilen stehen, die in keiner Summe auftauchen (D6).
const HELP_FCT =
  'Gebuchte Fixkosten über den gewählten Zeitraum (via „Jetzt buchen") und Übersicht aller ' +
  'konfigurierten Positionen. Als Belastung zählen Ausgaben-Fixkosten und Rückstellungen: ' +
  'Transfers mit Turnus gehen mit ihrer Monatsrate ein, nicht mit dem Rechnungsbetrag des ganzen ' +
  'Zyklus. Ein Transfer ohne Turnus ist eine Rücklage — er bleibt in der Übersicht, zählt aber ' +
  'in keiner Kennzahl der KPI-Kacheln mit. Die Übersichtsliste selbst zeigt alle drei Arten: ' +
  'Ausgaben, Rückstellungen und Rücklagen stehen dort als eigene Blöcke untereinander, und der ' +
  'Prozentwert ist der Anteil an der Summe genau dieser Liste — zusammen also 100 %.';

// Die drei Arten von Fixkosten, in der Reihenfolge, in der sie in der Übersicht
// als Blöcke untereinander stehen: erst die echten Ausgaben, dann die
// Rückstellungen (Transfer mit Turnus), zuletzt die Rücklagen (freies Sparen).
const GROUP_ORDER = ["expense", "sinking", "free"];

function groupOf(item) {
  if (!item.isTransfer) return "expense";
  return item.isFreeSaving ? "free" : "sinking";
}

function KpiCard({ label, value, sub, accent, spark }) {
  return (
    <div className="hb-fct-kpi" style={accent ? { "--pill-edge": accent } : undefined}>
      <div className="hb-fct-kpi-top">
        <div className="hb-fct-kpi-label">{label}</div>
        {spark && (
          <HbSparklineHover
            data={spark.data}
            dataKey={spark.dataKey}
            color={spark.color}
            caption={spark.caption}
            label={`Verlauf: ${label}`}
          />
        )}
      </div>
      <div className="hb-fct-kpi-value">{value}</div>
      {sub && <div className="hb-fct-kpi-sub">{sub}</div>}
    </div>
  );
}

// Nur Hex-Farben lassen sich mit einem Alpha-Suffix tönen. Die Kategoriefarben
// sind Hex, die Theme-Farben kommen aber aus getComputedStyle() und könnten als
// rgb() zurückkommen — dann bleibt die Pille neutral statt unsichtbar zu werden.
// Dasselbe Muster wie potTintStyle() in PotsView.
const isHex = (color) => typeof color === "string" && color.startsWith("#");

// Kategorie-Pille in der Farbe ihrer Kategorie: getönte Fläche, Rand und Text in
// der Vollfarbe. Ersetzt den früheren Farbpunkt vor dem Namen — die Farbe sitzt
// jetzt dort, wo auch die Bedeutung steht.
// Bewusste Entscheidung (UI-Audit 04.10.2026, Punkt A4): Der Text bleibt in der
// Kategoriefarbe, auch wenn dunkle Töne im Dark Mode kontrastarm sind. Nicht
// auf neutralen Text umstellen.
function tintedChipStyle(color) {
  if (!isHex(color)) return undefined;
  return { background: `${color}1f`, borderColor: `${color}59`, color };
}

// Horizontaler Balken: Anteil des Items an der Summe der Liste.
// Der Track wird in der Item-Hue getönt (Hue-auf-Hue statt neutralem Grau).
function ProportionBar({ pct, color }) {
  return (
    <div
      className="hb-meter hb-meter--lg hb-meter--tinted hb-meter--animated"
      style={color ? { "--meter-tone": color } : undefined}
    >
      <div
        className="hb-meter-fill"
        // minWidth: Die kleinste Position der Liste liegt schnell unter 1 % und
        // hätte sonst gar keinen sichtbaren Balken mehr.
        style={{ width: `${Math.min(pct, 100)}%`, minWidth: pct > 0 ? 3 : 0 }}
      />
    </div>
  );
}

const FixedCostTrendSection = memo(function FixedCostTrendSection({
  fixedMonthly,
  kpis,
  recurringExpenses,
  expenseCategories,
  pots = [],
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const themeColors = useThemeColors();
  const [fctRangeOption, setFctRangeOption] = useState("12");
  const [fctScrollOffset, setFctScrollOffset] = useState(0);
  const [selectedTags, setSelectedTags] = useState(new Set());

  const fctRangePool = useMemo(() => {
    if (fctRangeOption === "12") return fixedMonthly.slice(-12);
    if (fctRangeOption === "24") return fixedMonthly.slice(-24);
    return fixedMonthly;
  }, [fixedMonthly, fctRangeOption]);

  const fctMaxOffset = Math.max(0, fctRangePool.length - 12);

  const fctWindowData = useMemo(() => {
    const start = Math.max(0, fctRangePool.length - 12 - fctScrollOffset);
    return fctRangePool.slice(start, start + 12);
  }, [fctRangePool, fctScrollOffset]);

  const fctWindowLabel = useMemo(() => {
    if (!fctWindowData.length) return "";
    const first = fctWindowData[0].label;
    const last = fctWindowData[fctWindowData.length - 1].label;
    return first === last ? first : `${first} – ${last}`;
  }, [fctWindowData]);

  // Die Bewertung gilt der Veränderung, nicht dem Betrag: Rot/Grün sitzt am
  // Prozentwert der Unterzeile, Kante und Wert der Kachel bleiben neutral.
  const momLabel =
    kpis.momDelta == null ? null : (
      <>
        <span className={kpis.momDelta > 0 ? "hb-bad" : kpis.momDelta < 0 ? "hb-ok" : undefined}>
          {formatPercent(kpis.momDelta)}
        </span>{" "}
        ggü. Vormonat
      </>
    );

  const availableTags = useMemo(() => {
    const set = new Set();
    (recurringExpenses || [])
      .filter((r) => r.showInOverview !== false)
      .forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [recurringExpenses]);

  const totalOverviewCount = useMemo(
    () => (recurringExpenses || []).filter((r) => r.showInOverview !== false).length,
    [recurringExpenses]
  );

  // Items nach Art gruppiert, innerhalb der Gruppe nach Betrag sortiert — nur
  // mit showInOverview, nur Hauptkategorie.
  // Transfer-Positionen tragen kein `categoryId`; ihr Label ist Zweck → Topf
  // (dasselbe Muster wie die Fixkosten-Card) und ihre Farbe eine feste,
  // vom Chart-Akzent unterscheidbare (D8).
  const activeItems = useMemo(() => {
    const allOverviewItems = (recurringExpenses || [])
      .filter((r) => r.showInOverview !== false)
      .map((r) => {
        const isTransfer = fixedCostKind(r) === "transfer";
        const cat = isTransfer ? null : (expenseCategories || []).find((c) => c.id === r.categoryId);
        const potName = isTransfer
          ? ((pots || []).find((p) => p.id === r.potId)?.name || r.potId)
          : null;
        return {
          ...r,
          // `amount` ist ab hier die Monatsrate, `annual` der Jahresbetrag.
          // Beide werden aus `r` abgeleitet, bevor `amount` überschrieben wird —
          // sonst ginge der Zyklusbetrag der Rückstellungen verloren.
          amount: monthlyRate(r),
          annual: annualAmount(r),
          isTransfer,
          // Rücklage (freies Sparen): bleibt sichtbar, zählt aber in keine Kennzahl der
          // Karte (D6). Die Pille ist der sichtbare Träger der Kostenregel.
          isFreeSaving: isTransfer && !isSinkingFund(r),
          categoryLabel: isTransfer
            ? `${r.transferCategory || "Transfer"} → ${potName}`
            : getCategoryLabel(expenseCategories || [], [], r.categoryId, null),
          color: isTransfer ? themeColors.teal : (cat?.color || FALLBACK_CATEGORY_COLOR),
        };
      })
      // Primär die Art, sekundär der Betrag: Die drei Blöcke der Liste entstehen
      // allein aus dieser Sortierung — der Renderer setzt nur noch den Abstand,
      // wo sich `group` von Zeile zu Zeile ändert.
      .sort((a, b) => {
        const delta = GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b));
        return delta !== 0 ? delta : b.amount - a.amount;
      });

    const items = selectedTags.size === 0
      ? allOverviewItems
      : allOverviewItems.filter((r) => (r.tags || []).some((t) => selectedTags.has(t)));

    // Bezugsgröße ist die Summe der sichtbaren Liste, nicht die durchschnittliche
    // Gesamtbelastung: Im Zähler stand die KONFIGURIERTE Monatsrate, im Nenner die
    // GEBUCHTE Ø-Belastung der Historie — zwei verschiedene Größen, deren Quotient
    // sich zu weit über 100 % aufsummieren konnte, sobald erst wenige Monate gebucht
    // waren. Gegen die Listensumme gerechnet ergeben alle Zeilen zusammen exakt
    // 100 %, und der Balken wird zur Rangfolge innerhalb der Fixkosten. Die
    // Beziehung zur Gesamtbelastung trägt weiterhin die KPI-Kachel darüber.
    //
    // Freies Sparen bekommt hier ebenfalls einen Anteil: Es steckt in der
    // Listensumme, also wäre ein „—" in der Zeile jetzt die Lücke, die die 100 %
    // nicht mehr aufgehen lässt. Dass es in keine Kennzahl eingeht, sagt die Pille.
    const base = items.reduce((s, r) => s + r.amount, 0) || 1;
    return items.map((r) => ({ ...r, group: groupOf(r), pct: (r.amount / base) * 100 }));
  }, [recurringExpenses, expenseCategories, pots, themeColors, selectedTags]);

  // Beide Summen beziehen sich auf dieselbe Menge — die sichtbaren Zeilen der
  // Liste (showInOverview plus Tag-Filter). `annualTotal` ist per Konstruktion
  // das Zwölffache von `visibleMonthlyTotal`, weil annualAmount() über die
  // gerundete Monatsrate rechnet. Die buchweite Fixkostenbelastung steht
  // weiterhin in der KPI-Kachel "Konfiguriert pro Monat", die als einzige
  // Kennzahl die Kostenregel anwendet.
  const visibleMonthlyTotal = useMemo(
    () => activeItems.reduce((s, r) => s + r.amount, 0),
    [activeItems]
  );

  const annualTotal = useMemo(
    () => activeItems.reduce((s, r) => s + r.annual, 0),
    [activeItems]
  );

  // Der Hinweisstreifen hängt an der ungefilterten Liste: Die Kostenregel gilt
  // buchweit, der Streifen darf nicht durch einen Filterklick verschwinden.
  const showTurnusHint = useMemo(() => {
    const list = recurringExpenses || [];
    return list.some((r) => fixedCostKind(r) === "transfer") && !list.some(isSinkingFund);
  }, [recurringExpenses]);

  return (
    <div className="hb-fct-section">
      <div className="hb-fct-header">
        <div className="hb-title-with-help">
          <h3 className="hb-fct-title">Fixkosten-Entwicklung</h3>
          <HbTooltip text={HELP_FCT} />
        </div>
      </div>

      {showTurnusHint && (
        <div className="hb-infobar" role="status">
          <div className="hb-infobar-icon"><IconInfo /></div>
          <div className="hb-infobar-content">
            <div className="hb-infobar-title">Noch keine Position mit Turnus</div>
            <div className="hb-infobar-message">
              Transfer-Fixkosten zählen nur dann als Belastung, wenn ein Turnus hinterlegt ist —
              die Gebucht-Linie und der Anteil an der Gesamtbelastung fallen deshalb niedriger aus
              als bisher. Trag in der Fixkosten-Ansicht bei einer Transfer-Position Turnus und
              nächste Fälligkeit nach, dann fließt ihre Monatsrate wieder in Kurve und Kennzahlen
              ein. Ohne Turnus gilt eine Position als freies Sparen.
            </div>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <div className="hb-fct-kpis">
        <KpiCard
          label="Konfiguriert pro Monat"
          value={fmt(kpis.configuredTotal)}
          sub={`${kpis.activeCount} Position${kpis.activeCount !== 1 ? "en" : ""}`}
          accent="var(--accent)"
        />
        <KpiCard
          label="Gebucht (letzter Monat)"
          value={fmt(kpis.bookedLast)}
          sub={momLabel}
          accent="var(--accent)"
          spark={{ data: fctWindowData, dataKey: "fixedTotal", color: themeColors.accent, caption: fctWindowLabel }}
        />
        <KpiCard
          label="Ø Anteil an der Gesamtbelastung"
          value={formatPercent(kpis.avgShare, { sign: false })}
          sub="über den Zeitraum"
          accent="var(--purple)"
          spark={{ data: fctWindowData, dataKey: "share", color: themeColors.purple, caption: fctWindowLabel }}
        />
        <KpiCard
          label="Teuerste Position"
          value={kpis.mostExpensive ? fmt(kpis.mostExpensive.monthlyAmount) : "—"}
          sub={kpis.mostExpensive ? `${kpis.mostExpensive.name} · pro Monat` : null}
          accent="var(--accent)"
        />
      </div>

      {/* Hauptchart: Verlauf Gesamtbetrag + %-Anteil */}
      <Card>
        <CardContent>
          <div className="hb-card-head hb-card-head--legend">
            <h3 className="hb-card-title">Verlauf über Zeit</h3>
            <div className="hb-chart-range" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ChartScrollNav
                offset={fctScrollOffset}
                maxOffset={fctMaxOffset}
                onOffsetChange={setFctScrollOffset}
                label={fctWindowLabel}
                style={{ visibility: fctMaxOffset > 0 ? "visible" : "hidden" }}
              />
              {fixedMonthly.length > 12 && (
                <RangeTabs
                  options={MONTH_RANGE_OPTIONS}
                  value={fctRangeOption}
                  onChange={(val) => { setFctRangeOption(val); setFctScrollOffset(0); }}
                  ariaLabel="Zeitraum wählen"
                />
              )}
            </div>
          </div>
          <ChartLegend style={{ marginBottom: 16 }} items={[{ label: "Gebucht", type: "line", color: themeColors.accent }]} />

          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={fctWindowData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
              <XAxis dataKey="label" {...monthAxisProps(themeColors)} />
              <YAxis {...axisProps(themeColors)} tickFormatter={(v) => formatCurrencyCompact(v, baseCurrency)} width={AMOUNT_AXIS_WIDTH} />
              <Tooltip
                wrapperStyle={{ zIndex: 10 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <ChartTooltip title={label}>
                      {payload.filter((p) => p.value != null).map((p) => (
                        <ChartTooltipRow key={p.dataKey} label="Gebucht" color={themeColors.accent} value={fmt(p.value)} />
                      ))}
                    </ChartTooltip>
                  );
                }}
              />
              <Line type="monotone" dataKey="fixedTotal" stroke={themeColors.accent} strokeWidth={CHART_STROKE.main} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Fixkosten-Übersicht: 3 gleiche Spalten */}
      {activeItems.length > 0 && (
        <Card>
          <CardContent>
            <div className="hb-card-head" style={{ alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h3 className="hb-card-title">Übersicht</h3>
                  {selectedTags.size > 0 && (
                    <span className="hb-fct-filter-hint">{activeItems.length} von {totalOverviewCount}</span>
                  )}
                </div>
                {availableTags.length > 0 && (
                  <div className="hb-segmented hb-segmented--wrap" role="group" aria-label="Nach Tag filtern">
                    <button
                      type="button"
                      aria-pressed={selectedTags.size === 0}
                      className={`hb-segmented__item${selectedTags.size === 0 ? " hb-segmented__item--active" : ""}`}
                      onClick={() => setSelectedTags(new Set())}
                    >
                      Alle
                    </button>
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={selectedTags.has(tag)}
                        className={`hb-segmented__item${selectedTags.has(tag) ? " hb-segmented__item--active" : ""}`}
                        onClick={() => setSelectedTags((prev) => {
                          const next = new Set(prev);
                          if (next.has(tag)) next.delete(tag); else next.add(tag);
                          return next;
                        })}
                      >
                        <IconTag width={13} height={13} />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="hb-muted" style={{ fontSize: 12, alignSelf: "flex-start", paddingTop: 2 }}>
                Summe der Liste: {fmt(visibleMonthlyTotal)} pro Monat
              </span>
            </div>

            {/* CSS-Grid, fünf Spalten: Position │ pro Monat │ Balken │ Anteil │ Jahr.
                Alle Zellen liegen im Auto-Flow — pro Item werden die fünf Zellen
                nacheinander gerendert, deshalb braucht keine davon eine explizite
                Zeile. Nur das Jahres-Total unten bekommt seine Spalte gesetzt. */}
            <div className="hb-fct-five-grid">
              {/* Spalten-Header */}
              <div className="hb-fct-col-head">Position</div>
              <div className="hb-fct-col-head hb-fct-col-head--right">Pro Monat</div>
              <div className="hb-fct-col-head" style={{ gridColumn: "span 2" }}>Anteil an Fixkosten</div>
              <div className="hb-fct-col-head hb-fct-col-head--right">Jahresbetrag</div>

              {activeItems.map((item, i) => {
                // Der Blockabstand hängt am Wechsel der Art, nicht an einer festen
                // Position: Fällt eine Gruppe durch den Tag-Filter ganz weg, fällt
                // ihr Abstand mit weg.
                const startsGroup = i > 0 && activeItems[i - 1].group !== item.group;
                const rowClass = startsGroup ? " hb-fct-row--group-start" : "";
                return (
                  <React.Fragment key={item.id}>
                    <div className={`hb-fct-name-cell${rowClass}`}>
                      <span className="hb-fct-index">{i + 1}</span>
                      <div className="hb-fct-name-block">
                        <span className="hb-fct-overview-name">{item.name}</span>
                        <div className="hb-fct-name-pills">
                          <span className="hb-fct-overview-cat" style={tintedChipStyle(item.color)}>
                            {item.categoryLabel}
                          </span>
                          {item.isFreeSaving && (
                            <HbTooltip text="Ohne Turnus — zählt nicht in die Fixkostenbelastung">
                              <span className="hb-fct-overview-cat hb-fct-overview-cat--free">
                                Freies Sparen
                              </span>
                            </HbTooltip>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`hb-fct-month-cell${rowClass}`}>
                      <span className="hb-fct-overview-amount">{fmt(item.amount)}</span>
                    </div>

                    <div className={`hb-fct-bar-cell${rowClass}`}>
                      <ProportionBar pct={item.pct} color={item.color} />
                    </div>

                    <div className={`hb-fct-pct-cell${rowClass}`}>
                      <span className="hb-fct-overview-pct">{item.pct.toFixed(1)}&nbsp;%</span>
                    </div>

                    <div className={`hb-fct-annual-cell${rowClass}`}>
                      <span className="hb-fct-annual-amount">{fmt(item.annual)}</span>
                      <span className="hb-fct-annual-label">pro Jahr</span>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Jahres-Total unter allen Items */}
              {annualTotal > 0 && (
                <div
                  className="hb-fct-annual-total"
                  // Die einzige Zelle mit expliziter Position: Sie gehört in die
                  // Jahresspalte der Zeile NACH dem letzten Item (Kopfzeile + n Items).
                  style={{ gridColumn: 5, gridRow: activeItems.length + 2 }}
                >
                  <span className="hb-fct-annual-total-label">Total</span>
                  <span className="hb-fct-annual-total-value">{fmt(annualTotal)} pro Jahr</span>
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      )}
    </div>
  );
});

export default FixedCostTrendSection;
