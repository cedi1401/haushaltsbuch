import React from "react";

// Inline-SVG-Icons im WinUI-3 / Fluent-Stil (1.5px stroke, currentColor).
// Verwendung: <IconBook />, <IconTrend />, etc. Alle Icons übernehmen
// font-color via stroke="currentColor", sodass sie aus dem Parent geerbt werden.

const baseProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function IconMenu(props) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function IconBook(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5V4.5z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
    </svg>
  );
}

export function IconPots(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 9h16l-1 10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 9z" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconGoals(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconFixed(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="9" y1="3" x2="9" y2="7" />
      <line x1="15" y1="3" x2="15" y2="7" />
    </svg>
  );
}

// Münzstapel — Rücklagen-View. Deckel-Ellipse, Zylinder-Silhouette, ein
// Trennbogen: zwei Münzen (D10). Ein zweiter Trennbogen ließe bei 18 px und
// 1.6 Strichstärke nur ~1.5 px Luft zwischen den Bögen — auf einem Windows-
// Display ohne Skalierung verschmieren die drei Bögen dann zu einem Block.
//
// Ausdehnung y 4.0–20.0 (16 Einheiten) mit optischem Mittelpunkt exakt 12:
// vorher waren es 15 Einheiten um 11.8, das Icon saß damit sichtbar tiefer
// und kleiner als IconFixed (16) und IconCostGroups (18) daneben. Der
// Münzkörper misst 5.2 Einheiten, der Abstand zwischen Trenn- und Bodenbogen
// bleibt bei 18 px damit ~2.7 px — deutlich getrennt.
export function IconReserves(props) {
  return (
    <svg {...baseProps} {...props}>
      <ellipse cx="12" cy="6.8" rx="7" ry="2.8" />
      <path d="M5 6.8v10.4a7 2.8 0 0 0 14 0V6.8" />
      <path d="M5 12a7 2.8 0 0 0 14 0" />
    </svg>
  );
}

export function IconTrend(props) {
  return (
    <svg {...baseProps} {...props}>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  );
}

export function IconCostGroups(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="8" y2="11" />
      <line x1="12" y1="11" x2="12" y2="11" />
      <line x1="16" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="8" y2="15" />
      <line x1="12" y1="15" x2="12" y2="15" />
      <line x1="16" y1="15" x2="16" y2="18" />
    </svg>
  );
}

export function IconEdit(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M14.5 4.5l5 5L8 21H3v-5L14.5 4.5z" />
      <path d="M13 6l5 5" />
    </svg>
  );
}

export function IconDelete(props) {
  return (
    <svg {...baseProps} {...props}>
      <polyline points="4 7 20 7" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <line x1="10" y1="11" x2="10" y2="18" />
      <line x1="14" y1="11" x2="14" y2="18" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg {...baseProps} {...props}>
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

// Aufklapp-Pfeil (zeigt nach unten; die Drehung übernimmt CSS). Als einziges
// Icon hier NICHT auf baseProps: es hat ein 16er-Viewbox und ist bei 16–18 px
// gedacht. Aus baseProps (24er-Viewbox, strokeWidth 1.6) käme bei 18 px ein
// 1.2-px-Strich heraus und der Pfeil wäre sichtbar dünner als seine
// Nachbarschaft — die drei Stellen, die ihn benutzen, zeichneten ihn bisher
// genau deshalb inline mit 1.5–1.6 auf 16er-Viewbox.
export function IconChevron({ width = 16, height = 16, ...props }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4.5 6L8 9.5L11.5 6" />
    </svg>
  );
}

// Spaltenauswahl — Tabellenrahmen mit zwei senkrechten Trennern. Anders als
// IconFixed und IconCostGroups liegen die Linien hier vertikal; das Icon sitzt
// ohnehin auf einem beschrifteten Button und nicht im NavDrawer.
export function IconColumns(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </svg>
  );
}

export function IconInfo(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="12" y1="7.5" x2="12" y2="8" />
    </svg>
  );
}

export function IconHelp(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.5c-.8.4-1.2 1-1.2 1.9" />
      <line x1="12" y1="16.5" x2="12" y2="16.8" />
    </svg>
  );
}

export function IconWarning(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3l10 18H2L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12" y2="17.5" />
    </svg>
  );
}

export function IconSuccess(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

export function IconError(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

export function IconMore(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconPlus(props) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconInbox(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 13h5l1 3h6l1-3h5" />
      <path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2-8z" />
    </svg>
  );
}

export function IconWallet(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="2" y="8" width="20" height="12" rx="2" />
      <path d="M2 12h20" />
      <circle cx="17" cy="16" r="1.2" fill="currentColor" stroke="none" />
      <path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconTransfer(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 8h13" />
      <path d="M13 5l3 3-3 3" />
      <path d="M21 16H8" />
      <path d="M11 13l-3 3 3 3" />
    </svg>
  );
}

export function IconLock(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconSun(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function IconMoon(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconDrag(props) {
  return (
    <svg {...baseProps} {...props} stroke="none">
      <circle cx="9" cy="6" r="1.3" fill="currentColor" />
      <circle cx="15" cy="6" r="1.3" fill="currentColor" />
      <circle cx="9" cy="12" r="1.3" fill="currentColor" />
      <circle cx="15" cy="12" r="1.3" fill="currentColor" />
      <circle cx="9" cy="18" r="1.3" fill="currentColor" />
      <circle cx="15" cy="18" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function IconSearch(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16" y1="16" x2="21" y2="21" />
    </svg>
  );
}

export function IconTag(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M11.414 2.586A2 2 0 0 1 12.828 2H20a2 2 0 0 1 2 2v7.172a2 2 0 0 1-.586 1.414l-8.704 8.704a2.426 2.426 0 0 1-3.42 0l-6.58-6.58a2.426 2.426 0 0 1 0-3.42z" />
      <circle cx="16.5" cy="7.5" r="1.3" />
    </svg>
  );
}

// Zwei gestapelte Karten mit Inhaltszeilen — Buchungsvorlagen.
export function IconTemplate(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="7" y="3" width="14" height="14" rx="2" />
      <path d="M17 21H5a2 2 0 0 1-2-2V7" />
      <line x1="10.5" y1="8" x2="17.5" y2="8" />
      <line x1="10.5" y1="12" x2="15" y2="12" />
    </svg>
  );
}
