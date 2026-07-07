import React, { useId, useRef, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts";
import { IconTrend } from "./icons.jsx";

const PANEL_W = 220;
const PANEL_H = 96;

// Kurze Richtungsbeschreibung des letzten Schritts — als Textalternative im
// aria-label des Triggers, da das SVG-Panel selbst keine Textalternative hat.
function trendDirection(data, dataKey) {
  const vals = (data || [])
    .filter((d) => d?.[dataKey] != null)
    .map((d) => Number(d[dataKey]));
  if (vals.length < 2) return "";
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  if (last > prev) return ", zuletzt steigend";
  if (last < prev) return ", zuletzt fallend";
  return ", zuletzt gleichbleibend";
}

/**
 * Graph-Icon, das bei Hover/Fokus eine Mini-Sparkline als überlappendes Overlay
 * einblendet — ohne die Höhe der umgebenden KPI-Karte zu verändern. Positioniert
 * wie HbTooltip via `position: fixed` (Viewport-Koordinaten), damit kein
 * `overflow: hidden` der Karten das Panel abschneidet.
 *
 * Rendert nichts, wenn weniger als zwei Datenpunkte vorliegen — so erscheint das
 * Icon nur, wenn es einen echten Verlauf zu zeigen gibt.
 *
 * @param {Array} data - Zeitreihe (Objekte mit `dataKey`)
 * @param {string} dataKey - Feld mit dem Wert je Datenpunkt
 * @param {string} color - Linien-/Flächenfarbe
 * @param {string} label - aria-label des Triggers
 * @param {string} [caption] - Kurzbeschriftung im Panel (z.B. "12 Monate");
 *   Default: Anzahl der Datenpunkte als "N Monate".
 */
export default function HbSparklineHover({
  data,
  dataKey = "value",
  color,
  label = "Verlauf anzeigen",
  caption,
}) {
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const gradientId = useId();

  const hasTrend =
    Array.isArray(data) && data.filter((d) => d?.[dataKey] != null).length > 1;

  function open() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    // Panel unter dem Trigger, rechtsbündig; bei zu wenig Platz unten → oberhalb.
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < PANEL_H + 16;
    const top = Math.max(8, above ? r.top - PANEL_H - 8 : r.bottom + 8);
    let left = r.right - PANEL_W;
    left = Math.max(8, Math.min(left, window.innerWidth - PANEL_W - 8));
    setCoords({ left, top });
  }

  function close() {
    setCoords(null);
  }

  if (!hasTrend) return null;

  const panelCaption = caption ?? `${data.length} Monate`;

  return (
    <span className="hb-spark-hover" onMouseLeave={close}>
      <button
        ref={triggerRef}
        type="button"
        className="hb-spark-trigger"
        aria-label={`${label}${trendDirection(data, dataKey)}`}
        onMouseEnter={open}
        onFocus={open}
        onBlur={close}
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <IconTrend width={15} height={15} />
      </button>
      {coords && (
        <span
          aria-hidden="true"
          className="hb-spark-panel"
          style={{ left: coords.left, top: coords.top, width: PANEL_W, height: PANEL_H }}
        >
          <span className="hb-spark-caption">{panelCaption}</span>
          <span className="hb-spark-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 2, left: 4 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  baseValue="dataMin"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </span>
        </span>
      )}
    </span>
  );
}
