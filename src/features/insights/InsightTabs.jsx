import React, { useRef, useLayoutEffect, useState } from "react";

const TABS = [
  { id: "overview", label: "Überblick" },
  { id: "budget",   label: "Budget" },
  { id: "behavior", label: "Verhalten" },
  { id: "forecast", label: "Prognose" },
];

export default function InsightTabs({ activeCard, onTabChange }) {
  const tabRefs = useRef([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const activeIdx = TABS.findIndex((t) => t.id === activeCard);
    const el = tabRefs.current[activeIdx];
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeCard]);

  return (
    <div className="hb-insights-tabs" role="tablist">
      {TABS.map((tab, i) => (
        <button
          key={tab.id}
          ref={(el) => (tabRefs.current[i] = el)}
          role="tab"
          aria-selected={activeCard === tab.id}
          className={`hb-insights-tab${activeCard === tab.id ? " hb-insights-tab--active" : ""}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <span
        className="hb-insights-tab-indicator"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
    </div>
  );
}
