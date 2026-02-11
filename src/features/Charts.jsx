import React from "react";
import { Card, CardContent } from "../components/ui.jsx";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS } from "../utils/hbPalette.js";

export default function Charts({ expenseByCategory, catColor, toCHF, barData }) {
  
  return (
    <div className="hb-two">
      <Card>
        <CardContent>
          <h2 style={{ margin: 0, fontSize: 18 }}>Ausgaben nach Kategorie</h2>

          {expenseByCategory.length === 0 ? (
            <p className="hb-muted">Keine Ausgaben vorhanden.</p>
          ) : (
            <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ minHeight: 260 }}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={expenseByCategory}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {expenseByCategory.map((d) => (
                        <Cell key={d.name} fill={catColor.get(d.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => toCHF(val)}
                      labelFormatter={(label) => `Kategorie: ${label}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="hb-legend">
                <div className="hb-legend-title">Legende</div>
                {expenseByCategory.map((d) => (
                  <div key={d.name} className="hb-legend-row">
                    <div className="hb-legend-left">
                      <span
                        className="hb-dot"
                        style={{ background: catColor.get(d.name) }}
                      />
                      <span className="hb-small">{d.name}</span>
                    </div>
                    <span className="hb-muted">{toCHF(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 style={{ margin: 0, fontSize: 18, marginBottom: 12 }}>
            Einnahmen vs. Ausgaben
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} barCategoryGap={16}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(val) => toCHF(val)} />
              <Bar dataKey="value" barSize={22}>
                {barData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="hb-note">Einnahmen werden in Gruen, Ausgaben in Rot dargestellt.</div>
        </CardContent>
      </Card>
    </div>
  );
}
