import React from "react";

export const BAR_RADIUS = 3;

// Rundet nur das äußere Ende eines Balkens (weg von der Nulllinie). Recharts
// normalisiert für negative Werte nicht zuverlässig über die radius-Prop, daher
// als deterministische Custom-Shape: "top" für nach oben (Zuflüsse), "bottom"
// für nach unten (Abflüsse).
function makeOuterRoundedBar(corner) {
  return function RoundedBar({ x, y, width, height, fill }) {
    if (!height || !width) return null;
    const left = x;
    const right = x + width;
    const top = Math.min(y, y + height);
    const bottom = top + Math.abs(height);
    const r = Math.min(BAR_RADIUS, Math.abs(height), width / 2);
    const d = corner === "top"
      ? `M${left},${bottom} L${left},${top + r} Q${left},${top} ${left + r},${top} L${right - r},${top} Q${right},${top} ${right},${top + r} L${right},${bottom} Z`
      : `M${left},${top} L${right},${top} L${right},${bottom - r} Q${right},${bottom} ${right - r},${bottom} L${left + r},${bottom} Q${left},${bottom} ${left},${bottom - r} Z`;
    return <path d={d} fill={fill} />;
  };
}

// Balken mit gerundetem oberen Ende (Zuflüsse nach oben).
export const IncomeBarShape = makeOuterRoundedBar("top");
// Balken mit gerundetem unteren Ende (Abflüsse nach unten).
export const OutflowBarShape = makeOuterRoundedBar("bottom");
