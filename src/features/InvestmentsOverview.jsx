import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { PIE_PALETTE, makeCategoryColorMap } from "../utils/hbPalette.js";
import {
  generatePortfolioId,
  calcPortfolioValue,
  calcAllPortfoliosValue,
  groupByAssetType,
} from "../utils/investmentUtils.js";

export default function InvestmentsOverview({
  activeBook,
  toCHF,
  onUpdateBook,
  todayISO,
  onOpenPortfolio,
}) {
  const portfolios = activeBook?.investmentPortfolios || [];

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState(null);
  const [draft, setDraft] = useState({ name: "", description: "" });

  // Stats
  const totalValue = useMemo(() => calcAllPortfoliosValue(portfolios), [portfolios]);
  const totalAssets = useMemo(
    () => portfolios.reduce((sum, p) => sum + (p.assets || []).length, 0),
    [portfolios]
  );

  // Chart data: by portfolio
  const portfolioChartData = useMemo(() => {
    return portfolios
      .map((p) => ({ name: p.name, value: calcPortfolioValue(p) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [portfolios]);

  const portfolioColorMap = useMemo(
    () => makeCategoryColorMap(portfolioChartData.map((d) => d.name), PIE_PALETTE),
    [portfolioChartData]
  );

  // Chart data: by asset type (all portfolios)
  const allAssets = useMemo(
    () => portfolios.flatMap((p) => p.assets || []),
    [portfolios]
  );
  const assetTypeData = useMemo(() => groupByAssetType(allAssets), [allAssets]);
  const assetTypeColorMap = useMemo(
    () => makeCategoryColorMap(assetTypeData.map((d) => d.name), PIE_PALETTE),
    [assetTypeData]
  );

  function openCreateDialog() {
    setEditingPortfolio(null);
    setDraft({ name: "", description: "" });
    setDialogOpen(true);
  }

  function openEditDialog(portfolio, e) {
    e.stopPropagation();
    setEditingPortfolio(portfolio);
    setDraft({ name: portfolio.name, description: portfolio.description || "" });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingPortfolio(null);
  }

  function savePortfolio() {
    if (!activeBook) return;
    if (!draft.name.trim()) return;

    if (editingPortfolio) {
      const updated = portfolios.map((p) =>
        p.id === editingPortfolio.id
          ? { ...p, name: draft.name.trim(), description: draft.description.trim() }
          : p
      );
      onUpdateBook({ ...activeBook, investmentPortfolios: updated });
    } else {
      const newPortfolio = {
        id: generatePortfolioId(),
        name: draft.name.trim(),
        description: draft.description.trim(),
        createdAt: todayISO(),
        assets: [],
      };
      onUpdateBook({
        ...activeBook,
        investmentPortfolios: [...portfolios, newPortfolio],
      });
    }
    closeDialog();
  }

  function deletePortfolio(portfolio, e) {
    e.stopPropagation();
    const msg = `Portfolio "${portfolio.name}" wirklich loschen? Alle Assets darin werden ebenfalls geloscht.`;
    if (!window.confirm(msg)) return;
    onUpdateBook({
      ...activeBook,
      investmentPortfolios: portfolios.filter((p) => p.id !== portfolio.id),
    });
  }

  const canSave = draft.name.trim().length > 0;

  return (
    <div>
      {/* Header */}
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Investment-Portfolios</h2>
          <div className="hb-muted">Verwalte deine Investments und analysiere die Verteilung</div>
        </div>
        <Button onClick={openCreateDialog}>+ Neues Portfolio</Button>
      </div>

      {/* Gesamt-Statistik */}
      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <div className="hb-grid-3">
            <div>
              <div className="hb-stat-title">Gesamtwert</div>
              <div className="hb-stat-val">{toCHF(totalValue)}</div>
            </div>
            <div>
              <div className="hb-stat-title">Portfolios</div>
              <div className="hb-stat-val">{portfolios.length}</div>
            </div>
            <div>
              <div className="hb-stat-title">Assets</div>
              <div className="hb-stat-val">{totalAssets}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      {portfolioChartData.length > 0 && (
        <div className="hb-two" style={{ marginBottom: 16 }}>
          {/* Verteilung nach Portfolio */}
          <Card>
            <CardContent>
              <h3 style={{ margin: 0, fontSize: 16, marginBottom: 8 }}>Nach Portfolio</h3>
              <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ minHeight: 240 }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={portfolioChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {portfolioChartData.map((d) => (
                          <Cell key={d.name} fill={portfolioColorMap.get(d.name)} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => toCHF(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="hb-legend">
                  {portfolioChartData.map((d) => {
                    const pct = totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={d.name} className="hb-legend-row">
                        <div className="hb-legend-left">
                          <span className="hb-dot" style={{ background: portfolioColorMap.get(d.name) }} />
                          <span className="hb-small">{d.name}</span>
                        </div>
                        <span className="hb-muted">{toCHF(d.value)} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Verteilung nach Asset-Typ */}
          <Card>
            <CardContent>
              <h3 style={{ margin: 0, fontSize: 16, marginBottom: 8 }}>Nach Asset-Typ</h3>
              <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ minHeight: 240 }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={assetTypeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {assetTypeData.map((d) => (
                          <Cell key={d.name} fill={assetTypeColorMap.get(d.name)} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => toCHF(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="hb-legend">
                  {assetTypeData.map((d) => {
                    const pct = totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={d.name} className="hb-legend-row">
                        <div className="hb-legend-left">
                          <span className="hb-dot" style={{ background: assetTypeColorMap.get(d.name) }} />
                          <span className="hb-small">{d.name}</span>
                        </div>
                        <span className="hb-muted">{toCHF(d.value)} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Portfolio-Liste */}
      {portfolios.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-muted" style={{ textAlign: "center", padding: "20px 0" }}>
              Noch keine Portfolios erstellt. Erstelle dein erstes Portfolio, um Investments zu verwalten.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {portfolios.map((p) => {
            const val = calcPortfolioValue(p);
            const assetCount = (p.assets || []).length;
            return (
              <Card
                key={p.id}
                style={{ cursor: "pointer" }}
              >
                <CardContent>
                  <div
                    onClick={() => onOpenPortfolio(p.id)}
                    className="hb-row"
                    style={{ alignItems: "center" }}
                  >
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{p.name}</h3>
                      {p.description && (
                        <div className="hb-muted" style={{ marginTop: 2 }}>{p.description}</div>
                      )}
                      <div className="hb-muted" style={{ marginTop: 4, fontSize: 12 }}>
                        {assetCount} Asset{assetCount !== 1 ? "s" : ""} | Erstellt: {p.createdAt}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", marginRight: 12 }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{toCHF(val)}</div>
                    </div>
                    <div className="hb-actions" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" onClick={(e) => openEditDialog(p, e)}>
                        Bearbeiten
                      </Button>
                      <Button variant="outline" onClick={(e) => deletePortfolio(p, e)}>
                        Loschen
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Portfolio erstellen/bearbeiten */}
      <EditDialog
        open={dialogOpen}
        title={editingPortfolio ? "Portfolio bearbeiten" : "Neues Portfolio"}
        onClose={closeDialog}
        onSave={savePortfolio}
        canSave={canSave}
        saveLabel={editingPortfolio ? "Speichern" : "Erstellen"}
      >
        <div className="hb-form" style={{ flexDirection: "column", gap: 14 }}>
          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. ETF-Depot, Krypto, ..."
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="hb-field">
            <div className="hb-label">Beschreibung (optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Langfristiges Depot bei Swissquote"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </div>
        </div>
      </EditDialog>
    </div>
  );
}
