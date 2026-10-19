import React from "react";

// Kennzahl-Kachel im 2×2-Raster unter den Charts (Verhalten, Prognose)
export default function InsightTile({ label, value, sub }) {
  return (
    <div className="hb-insight-tile">
      <div className="hb-insight-tile-label">{label}</div>
      <div className="hb-insight-tile-value">{value}</div>
      {sub && <div className="hb-insight-tile-sub">{sub}</div>}
    </div>
  );
}
