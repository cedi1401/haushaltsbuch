import React, { useRef, useLayoutEffect, useState } from "react";
import { IconAlertCircle } from "../../components/icons.jsx";

const TABS = [
  { id: "overview", label: "Überblick" },
  { id: "budget",   label: "Budget" },
  { id: "behavior", label: "Verhalten" },
  { id: "forecast", label: "Prognose" },
];

const ALERT_SUFFIX = { error: "Warnung", warning: "Hinweis" };

/**
 * Tab-Leiste der Insights. `alerts` ordnet einer Tab-ID eine Hinweis-Stufe zu
 * ("error" | "warning", siehe insightAlerts.js); dann steht hinter der
 * Bezeichnung ein Kreis mit Ausrufezeichen in der Farbe der AlertBar.
 */
export default function InsightTabs({ activeCard, onTabChange, alerts = {} }) {
  const tabRefs = useRef([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Ein Symbol verbreitert seinen Tab und verschiebt die folgenden: der
  // Unterstrich misst deshalb auch neu, wenn sich die Stufen ändern.
  const alertKey = TABS.map((t) => alerts[t.id] || "").join("|");
  useLayoutEffect(() => {
    const activeIdx = TABS.findIndex((t) => t.id === activeCard);
    const el = tabRefs.current[activeIdx];
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeCard, alertKey]);

  return (
    <div className="hb-insights-tabs" role="tablist">
      {TABS.map((tab, i) => {
        const alert = alerts[tab.id];
        return (
          <button
            key={tab.id}
            ref={(el) => (tabRefs.current[i] = el)}
            role="tab"
            aria-selected={activeCard === tab.id}
            aria-label={alert ? `${tab.label} — ${ALERT_SUFFIX[alert]}` : undefined}
            className={`hb-insights-tab${activeCard === tab.id ? " hb-insights-tab--active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            {alert && (
              <span className={`hb-insights-tab-alert hb-insights-tab-alert--${alert}`} aria-hidden="true">
                <IconAlertCircle />
              </span>
            )}
          </button>
        );
      })}
      <span
        className="hb-insights-tab-indicator"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
    </div>
  );
}
