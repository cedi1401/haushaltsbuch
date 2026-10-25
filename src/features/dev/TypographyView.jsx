import React, { useMemo } from "react";
import { Card, CardContent } from "../../components/ui.jsx";
import { useFmt } from "../../contexts/CurrencyContext.jsx";

// Dev-Tools: Nachschlage-Seite für die Type Ramp aus haushaltsbuch.css.
// Nur im Dev-Server sichtbar (siehe viewRegistry.js). Die Werte liest die
// Seite live aus den CSS-Variablen, damit sie nie vom Stylesheet abweicht.

const TEXT_STAGES = [
  { id: "title", name: "Title", sample: "Fixkosten", use: "Seitentitel in der Toolbar", classes: ".hb-title" },
  { id: "title-sm", name: "Title Small", sample: "Buchung bearbeiten", use: "Dialogtitel, Sparziel-Titel", classes: ".hb-modal-title, .hb-goal-title" },
  { id: "subtitle-lg", name: "Subtitle Large", sample: "Wohnen & Nebenkosten", use: "Gruppen- und Bereichsköpfe", classes: ".hb-fct-title, .hb-cg-group-trigger-name" },
  { id: "subtitle", name: "Subtitle", sample: "Ausgaben nach Kategorie", use: "Karten- und Abschnittstitel, Leerzustand-Titel", classes: ".hb-card-title, .hb-budget-section-title, .hb-empty-title" },
  { id: "row", name: "Row", sample: "Krankenkasse", amount: 412.5, use: "Listenzeilen in Tabellen, Fixkosten und Kostenrechner", classes: ".hb-dt-table, .hb-fct-overview-name, .hb-cg-planned-name" },
  { id: "body-strong", name: "Body Strong", sample: "Lebensmittel", use: "Buttons, Namen, Titel in Meldungen", classes: ".hb-btn, .hb-cat-name, .hb-infobar-title, .hb-toast-title" },
  { id: "body", name: "Body", sample: "Der Monatsbeginn bestimmt, welchem Finanzmonat eine Buchung zugeordnet wird.", use: "Standardtext, Eingabefelder, Listen, Legende", classes: "body, .hb-input, .hb-table, .hb-empty-text" },
  { id: "body-sm-strong", name: "Body Small Strong", sample: "Übersicht · Verhalten", use: "Tabs, Tag-Chips, Tabellenkopf der DataTable, Kachel-Labels", classes: ".hb-insights-tab, .hb-tag-chip, .hb-dt-table thead th" },
  { id: "body-sm", name: "Body Small", sample: "Zuletzt geändert am 24. Oktober", use: "Sekundärer Text im Lesefluss, Notizen, kleine Buttons", classes: ".hb-muted, .hb-note, .hb-btn-sm, .hb-infobar-message" },
  { id: "label", name: "Label", sample: "Betrag", use: "Formular-Labels, Tabellenköpfe, Namenslabels in Karten", classes: ".hb-label, .hb-table th, .hb-pot-card-name" },
  { id: "caption", name: "Caption", sample: "Wird beim Speichern auf zwei Stellen gerundet.", use: "Hinweise und Fehler unter Feldern, Meta, Unterzeilen", classes: ".hb-field-hint, .hb-field-error, .hb-muted--sm" },
  { id: "overline", name: "Overline", sample: "Alltag", use: "Labels in Großbuchstaben, Badges, Chips, Status- und Trend-Pills", classes: ".hb-badge, .hb-nav-group-title, .hb-trend-pill", upper: true },
];

const NUMBER_STAGES = [
  { id: "number-display", name: "Number Display", amount: 1240, use: "Budget-Gauge", classes: ".hb-budget-gauge-value" },
  { id: "number-xl", name: "Number XL", sample: "68 %", use: "Fortschritt eines Sparziels", classes: ".hb-goal-percent" },
  { id: "number-lg", name: "Number Large", amount: 4815.2, use: "KPI-Pills, Hero-Zahl im Insights-Panel", classes: ".hb-stat-pill-value, .hb-fct-kpi-value, .hb-insight-hero" },
  { id: "number-md", name: "Number Medium", amount: 2300, use: "Topf-Beträge, Insight-Kacheln, Donut-Mitte", classes: ".hb-pot-card-amount, .hb-insight-tile-value, .hb-pie-total-value" },
  { id: "number-sm", name: "Number Small", amount: 912.4, use: "Summen in Zeilen und Köpfen", classes: ".hb-goal-amount-current, .hb-cg-planned-total" },
];

const WEIGHTS = [
  { id: "regular", name: "Regular", note: "Normaler Text" },
  { id: "medium", name: "Medium", note: "Leichte Betonung: Navigation, Ghost-Buttons" },
  { id: "semibold", name: "Semibold", note: "Standard für Titel, Labels und Namen" },
  { id: "bold", name: "Bold", note: "Nur für große Zahlen und Status-Farben" },
];

const COLORS = [
  { id: "text", name: "Primär", note: "--text, normaler Text" },
  { id: "muted", name: "Sekundär", note: "--muted, gedämpfter Text (.hb-muted)" },
];

const PHRASES = [
  ["Mach die Schrift 2 px größer", "Hebe das von Caption auf Body Small"],
  ["Mach die Schrift dicker", "Das soll Semibold statt Regular sein"],
  ["Der Titel soll wie die anderen aussehen", "Das soll ein Subtitle sein"],
  ["Mach den Text grau", "Das soll sekundäre Textfarbe haben"],
  ["Die Zahl soll mehr auffallen", "Nimm Number Large statt Number Medium"],
];

function readStage(rootStyle, id) {
  const get = (k) => rootStyle.getPropertyValue(`--type-${id}-${k}`).trim();
  return { size: get("size"), weight: get("weight"), lh: get("lh") };
}

function StageRow({ stage, values }) {
  const fmt = useFmt();
  let sample = stage.sample;
  if (stage.amount != null) sample = sample ? `${sample} · ${fmt(stage.amount)}` : fmt(stage.amount);
  const style = {
    fontSize: `var(--type-${stage.id}-size)`,
    fontWeight: `var(--type-${stage.id}-weight)`,
    lineHeight: `var(--type-${stage.id}-lh)`,
    textTransform: stage.upper ? "uppercase" : undefined,
    letterSpacing: stage.upper ? "0.04em" : undefined,
  };
  return (
    <div className="hb-dev-type-row">
      <div className="hb-dev-type-meta">
        <div className="hb-dev-type-name">{stage.name}</div>
        <code className="hb-dev-type-token">--type-{stage.id}-*</code>
        <div className="hb-dev-type-values">
          {values.size} · {values.weight} · lh {values.lh}
        </div>
      </div>
      <div className="hb-dev-type-sample-cell">
        <div className="hb-dev-type-sample" style={style}>{sample}</div>
        <div className="hb-dev-type-use">{stage.use}</div>
        <code className="hb-dev-type-classes">{stage.classes}</code>
      </div>
    </div>
  );
}

export default function TypographyView() {
  const fmt = useFmt();
  const values = useMemo(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const out = {};
    for (const s of [...TEXT_STAGES, ...NUMBER_STAGES]) out[s.id] = readStage(rootStyle, s.id);
    for (const w of WEIGHTS) out[`fw-${w.id}`] = rootStyle.getPropertyValue(`--fw-${w.id}`).trim();
    return out;
  }, []);

  return (
    <div className="hb-stack hb-stack--lg">
      <Card>
        <CardContent>
          <div className="hb-card-head">
            <h3 className="hb-card-title">Textstufen</h3>
          </div>
          <p className="hb-muted hb-dev-type-intro">
            Jede Stufe besteht aus Größe, Gewicht und Zeilenhöhe, definiert in <code>:root</code> von
            {" "}<code>haushaltsbuch.css</code>. In Klassen immer die Variablen verwenden, keine Pixelwerte.
          </p>
          {TEXT_STAGES.map((s) => <StageRow key={s.id} stage={s} values={values[s.id]} />)}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="hb-card-head">
            <h3 className="hb-card-title">Zahlenstufen</h3>
          </div>
          <p className="hb-muted hb-dev-type-intro">
            Für Beträge und Kennzahlen, immer Bold. Alle Ziffern sind gleich breit (tabular-nums),
            damit Beträge sauber untereinander stehen.
          </p>
          {NUMBER_STAGES.map((s) => <StageRow key={s.id} stage={s} values={values[s.id]} />)}
        </CardContent>
      </Card>

      <div className="hb-two">
        <Card>
          <CardContent>
            <div className="hb-card-head">
              <h3 className="hb-card-title">Schriftgewichte</h3>
            </div>
            {WEIGHTS.map((w) => (
              <div key={w.id} className="hb-dev-type-row hb-dev-type-row--compact">
                <div className="hb-dev-type-meta">
                  <code className="hb-dev-type-token">--fw-{w.id}</code>
                  <div className="hb-dev-type-values">{values[`fw-${w.id}`]}</div>
                </div>
                <div className="hb-dev-type-sample-cell">
                  <div className="hb-dev-type-sample" style={{ fontSize: "var(--type-subtitle-lg-size)", fontWeight: `var(--fw-${w.id})` }}>
                    {w.name} · {fmt(1234.5)}
                  </div>
                  <div className="hb-dev-type-use">{w.note}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="hb-card-head">
              <h3 className="hb-card-title">Textfarben</h3>
            </div>
            {COLORS.map((c) => (
              <div key={c.id} className="hb-dev-type-row hb-dev-type-row--compact">
                <div className="hb-dev-type-meta">
                  <div className="hb-dev-type-name">{c.name}</div>
                </div>
                <div className="hb-dev-type-sample-cell">
                  <div className="hb-dev-type-sample" style={{ color: `var(--${c.id})` }}>
                    Der schnelle Überblick über jeden Monat
                  </div>
                  <div className="hb-dev-type-use">{c.note}</div>
                </div>
              </div>
            ))}

            <div className="hb-card-head hb-dev-type-subhead">
              <h3 className="hb-card-title">So formulierst du es</h3>
            </div>
            <table className="hb-table hb-dev-type-phrases">
              <thead>
                <tr><th>Statt</th><th>Besser</th></tr>
              </thead>
              <tbody>
                {PHRASES.map(([before, after]) => (
                  <tr key={before}>
                    <td className="hb-muted">„{before}“</td>
                    <td>„{after}“</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
