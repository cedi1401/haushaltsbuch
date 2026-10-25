import React, { useEffect, useId, useState, useSyncExternalStore } from "react";
import HbTooltip from "../components/HbTooltip.jsx";
import { IconMenu, IconSettings } from "../components/icons.jsx";
import { VIEWS, VIEW_GROUPS } from "./viewRegistry.js";

// Die Seite reserviert links immer nur die eingeklappte Leiste (48 px), der
// Inhalt bleibt beim Aufklappen stehen. Ab dieser Fensterbreite passt die
// ausgeklappte Leiste in den freien Rand links neben den zentrierten Inhalt,
// mit demselben Abstand von 24 px wie eingeklappt:
//   Inhaltsrand = 72 + (Breite − 16 Scrollleiste − 96 Padding − 1744) / 2 ≥ 240 + 24
//   → Breite ≥ 2240 px.
// Darunter überlagert die ausgeklappte Leiste den Inhalt (Overlay).
const WIDE_QUERY = "(min-width: 2240px)";

function subscribeWide(onChange) {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getWide() {
  return window.matchMedia(WIDE_QUERY).matches;
}

function NavItem({ label, icon, active, collapsed, onClick, ariaCurrent }) {
  const NavIcon = icon;
  const button = (
    <button
      type="button"
      className={`hb-nav-item ${active ? "hb-nav-item-active" : ""}`}
      aria-current={ariaCurrent}
      onClick={onClick}
    >
      <span className="hb-nav-item-icon"><NavIcon /></span>
      <span className="hb-nav-item-label">{label}</span>
    </button>
  );
  if (!collapsed) return button;
  return (
    <HbTooltip text={label} placement="right" focusable={false} className="hb-nav-tooltip">
      {button}
    </HbTooltip>
  );
}

/**
 * Navigationsleiste links (WinUI NavigationView). Eingeklappt nur Icons,
 * ausgeklappt mit Labels und Gruppenüberschriften. Passt die ausgeklappte
 * Leiste neben den Inhalt, gilt der gespeicherte Wunsch `expanded`; sonst
 * klappt der Button sie nur vorübergehend als Overlay auf (Light-Dismiss).
 * Der Inhalt verschiebt sich in keinem Fall.
 */
export default function NavPane({ view, onChangeView, expanded, onExpandedChange, settingsOpen, onOpenSettings }) {
  const wide = useSyncExternalStore(subscribeWide, getWide);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const idPrefix = useId();

  const isOverlay = !wide && overlayOpen;
  const isExpanded = wide ? expanded : overlayOpen;
  const collapsed = !isExpanded;

  // Wird das Fenster breit, während das Overlay offen ist, gilt wieder der Wunsch.
  if (wide && overlayOpen) setOverlayOpen(false);

  useEffect(() => {
    if (!isOverlay) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOverlayOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOverlay]);

  function toggle() {
    if (wide) onExpandedChange(!expanded);
    else setOverlayOpen((v) => !v);
  }

  function choose(action) {
    setOverlayOpen(false);
    action();
  }

  const cls = [
    "hb-nav-pane",
    collapsed ? "hb-nav-pane--collapsed" : "hb-nav-pane--expanded",
    isOverlay && "hb-nav-pane--overlay",
  ].filter(Boolean).join(" ");

  return (
    <>
      {isOverlay && (
        // react-doctor-disable-next-line react-doctor/no-static-element-interactions -- Backdrop schließt per Maus, Escape und Menü-Button decken die Tastatur ab
        <div className="hb-nav-pane-backdrop" onMouseDown={() => setOverlayOpen(false)} />
      )}
      <nav className={cls} aria-label="Hauptnavigation">
        <button
          type="button"
          className="hb-icon-btn hb-nav-toggle"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Navigation einklappen" : "Navigation ausklappen"}
          title={isExpanded ? "Navigation einklappen" : "Navigation ausklappen"}
          onClick={toggle}
        >
          <IconMenu />
        </button>

        <div className="hb-nav-pane-body">
          {VIEW_GROUPS.map((group, groupIndex) => {
            const items = VIEWS.filter((v) => v.group === group.id);
            if (!items.length) return null;
            const headingId = `${idPrefix}-${group.id}`;
            return (
              <div key={group.id} className="hb-nav-group">
                {collapsed ? (
                  groupIndex > 0 && <div className="hb-nav-group-sep" role="separator" />
                ) : (
                  <h2 id={headingId} className="hb-nav-group-title">{group.label}</h2>
                )}
                <ul className="hb-nav-list" aria-labelledby={collapsed ? undefined : headingId} aria-label={collapsed ? group.label : undefined}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <NavItem
                        label={item.label}
                        icon={item.Icon}
                        active={view === item.id}
                        ariaCurrent={view === item.id ? "page" : undefined}
                        collapsed={collapsed}
                        onClick={() => choose(() => onChangeView(item.id))}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="hb-nav-pane-foot">
          <NavItem
            label="Einstellungen"
            icon={IconSettings}
            active={settingsOpen}
            collapsed={collapsed}
            onClick={() => choose(onOpenSettings)}
          />
        </div>
      </nav>
    </>
  );
}
