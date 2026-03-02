import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { PIE_PALETTE, makeCategoryColorMap } from "../utils/hbPalette.js";
import {
  generateAssetId,
  calcAssetValue,
  calcPortfolioValue,
  groupByAssetType,
  groupByRegion,
  groupByTags,
  collectAllTags,
} from "../utils/investmentUtils.js";
import { parseAmount } from "../utils/hbUtils.js";

export default function PortfolioDetail({
  activeBook,
  portfolio,
  toCHF,
  onUpdateBook,
  todayISO,
  onBack,
}) {
  const portfolios = activeBook?.investmentPortfolios || [];
  const assets = portfolio.assets || [];
  const assetTypes = activeBook?.investmentAssetTypes || [];
  const regions = activeBook?.investmentRegions || [];

  // Autocomplete tags from all portfolios
  const allTags = useMemo(() => collectAllTags(portfolios), [portfolios]);

  // Chart tab
  const [chartTab, setChartTab] = useState("type"); // "type" | "region" | "tags"

  // Asset dialog
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetDraft, setAssetDraft] = useState({
    name: "",
    ticker: "",
    isin: "",
    quantity: "",
    unitLabel: "Anteile",
    pricePerUnit: "",
    assetType: assetTypes[0] || "ETF",
    region: "Welt",
    tags: "",
    note: "",
  });

  // Buy/Sell dialog
  const [buySellOpen, setBuySellOpen] = useState(false);
  const [buySellAsset, setBuySellAsset] = useState(null);
  const [buySellDraft, setBuySellDraft] = useState({ action: "buy", quantity: "" });

  // Portfolio edit dialog
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [portfolioDraft, setPortfolioDraft] = useState({ name: "", description: "" });

  // Calculations
  const portfolioValue = useMemo(() => calcPortfolioValue(portfolio), [portfolio]);
  const assetTypeData = useMemo(() => groupByAssetType(assets), [assets]);
  const regionData = useMemo(() => groupByRegion(assets), [assets]);
  const tagData = useMemo(() => groupByTags(assets), [assets]);

  // Asset allocation chart (by individual asset)
  const allocationData = useMemo(() => {
    return assets
      .map((a) => ({ name: a.name, value: calcAssetValue(a) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  const allocationColorMap = useMemo(
    () => makeCategoryColorMap(allocationData.map((d) => d.name), PIE_PALETTE),
    [allocationData]
  );

  // Breakdown chart data based on selected tab
  const breakdownData = chartTab === "type" ? assetTypeData : chartTab === "region" ? regionData : tagData;
  const breakdownColorMap = useMemo(
    () => makeCategoryColorMap(breakdownData.map((d) => d.name), PIE_PALETTE),
    [breakdownData]
  );

  // Helper: update this portfolio in the book
  function patchPortfolio(patchFn) {
    const updated = portfolios.map((p) =>
      p.id === portfolio.id ? patchFn(p) : p
    );
    onUpdateBook({ ...activeBook, investmentPortfolios: updated });
  }

  // --- Asset CRUD ---
  function openAssetCreateDialog() {
    setEditingAsset(null);
    setAssetDraft({
      name: "",
      ticker: "",
      isin: "",
      quantity: "",
      unitLabel: "Anteile",
      pricePerUnit: "",
      assetType: assetTypes[0] || "ETF",
      region: "Welt",
      tags: "",
      note: "",
    });
    setAssetDialogOpen(true);
  }

  function openAssetEditDialog(asset) {
    setEditingAsset(asset);
    setAssetDraft({
      name: asset.name || "",
      ticker: asset.ticker || "",
      isin: asset.isin || "",
      quantity: String(asset.quantity ?? ""),
      unitLabel: asset.unitLabel || "Anteile",
      pricePerUnit: String(asset.pricePerUnit ?? ""),
      assetType: asset.assetType || "ETF",
      region: asset.region || "",
      tags: (asset.tags || []).join(", "),
      note: asset.note || "",
    });
    setAssetDialogOpen(true);
  }

  function closeAssetDialog() {
    setAssetDialogOpen(false);
    setEditingAsset(null);
  }

  function saveAsset() {
    const qty = parseAmount(assetDraft.quantity);
    const price = parseAmount(assetDraft.pricePerUnit);
    if (!assetDraft.name.trim()) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!Number.isFinite(price) || price < 0) return;
    if (!assetDraft.assetType) return;

    const parsedTags = assetDraft.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingAsset) {
      patchPortfolio((p) => ({
        ...p,
        assets: (p.assets || []).map((a) =>
          a.id === editingAsset.id
            ? {
                ...a,
                name: assetDraft.name.trim(),
                ticker: assetDraft.ticker.trim(),
                isin: assetDraft.isin.trim(),
                quantity: qty,
                unitLabel: assetDraft.unitLabel || "Anteile",
                pricePerUnit: price,
                assetType: assetDraft.assetType,
                region: assetDraft.region || "",
                tags: parsedTags,
                note: assetDraft.note.trim(),
              }
            : a
        ),
      }));
    } else {
      const newAsset = {
        id: generateAssetId(),
        name: assetDraft.name.trim(),
        ticker: assetDraft.ticker.trim(),
        isin: assetDraft.isin.trim(),
        quantity: qty,
        unitLabel: assetDraft.unitLabel || "Anteile",
        pricePerUnit: price,
        assetType: assetDraft.assetType,
        region: assetDraft.region || "",
        tags: parsedTags,
        note: assetDraft.note.trim(),
        addedAt: todayISO(),
      };
      patchPortfolio((p) => ({
        ...p,
        assets: [...(p.assets || []), newAsset],
      }));
    }

    closeAssetDialog();
  }

  // --- Buy/Sell ---
  function openBuySellDialog(asset) {
    setBuySellAsset(asset);
    setBuySellDraft({ action: "buy", quantity: "" });
    setBuySellOpen(true);
  }

  function saveBuySell() {
    if (!buySellAsset) return;
    const delta = parseAmount(buySellDraft.quantity);
    if (!Number.isFinite(delta) || delta <= 0) return;
    if (buySellDraft.action === "sell" && delta > buySellAsset.quantity) return;

    const newQty = buySellDraft.action === "buy"
      ? buySellAsset.quantity + delta
      : buySellAsset.quantity - delta;

    patchPortfolio((p) => ({
      ...p,
      assets: (p.assets || []).map((a) =>
        a.id === buySellAsset.id ? { ...a, quantity: newQty } : a
      ),
    }));
    setBuySellOpen(false);
    setBuySellAsset(null);
  }

  const canSaveBuySell = useMemo(() => {
    if (!buySellAsset) return false;
    const delta = parseAmount(buySellDraft.quantity);
    if (!Number.isFinite(delta) || delta <= 0) return false;
    if (buySellDraft.action === "sell" && delta > buySellAsset.quantity) return false;
    return true;
  }, [buySellDraft, buySellAsset]);

  const buySellPreview = useMemo(() => {
    if (!buySellAsset) return null;
    const delta = parseAmount(buySellDraft.quantity);
    if (!Number.isFinite(delta) || delta <= 0) return null;
    const newQty = buySellDraft.action === "buy"
      ? buySellAsset.quantity + delta
      : buySellAsset.quantity - delta;
    return { oldQty: buySellAsset.quantity, newQty, unit: buySellAsset.unitLabel || "Anteile" };
  }, [buySellDraft, buySellAsset]);

  function deleteAsset(asset) {
    const msg = `Asset "${asset.name}" wirklich loschen?`;
    if (!window.confirm(msg)) return;
    patchPortfolio((p) => ({
      ...p,
      assets: (p.assets || []).filter((a) => a.id !== asset.id),
    }));
  }

  const canSaveAsset = useMemo(() => {
    if (!assetDraft.name.trim()) return false;
    const qty = parseAmount(assetDraft.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return false;
    const price = parseAmount(assetDraft.pricePerUnit);
    if (!Number.isFinite(price) || price < 0) return false;
    if (!assetDraft.assetType) return false;
    return true;
  }, [assetDraft]);

  // --- Portfolio edit ---
  function openPortfolioEditDialog() {
    setPortfolioDraft({ name: portfolio.name, description: portfolio.description || "" });
    setPortfolioDialogOpen(true);
  }

  function savePortfolioEdit() {
    if (!portfolioDraft.name.trim()) return;
    patchPortfolio((p) => ({
      ...p,
      name: portfolioDraft.name.trim(),
      description: portfolioDraft.description.trim(),
    }));
    setPortfolioDialogOpen(false);
  }

  const tabLabels = { type: "Nach Asset-Typ", region: "Nach Region", tags: "Nach Tags" };

  return (
    <div>
      {/* Header */}
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{portfolio.name}</h2>
          {portfolio.description && (
            <div className="hb-muted" style={{ marginTop: 2 }}>{portfolio.description}</div>
          )}
        </div>
        <div className="hb-actions">
          <Button variant="outline" onClick={onBack}>Zuruck</Button>
          <Button onClick={openAssetCreateDialog}>+ Asset hinzufugen</Button>
          <Button variant="outline" onClick={openPortfolioEditDialog}>Portfolio bearbeiten</Button>
        </div>
      </div>

      {/* Portfolio value */}
      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <div className="hb-stat-title">Gesamtwert</div>
          <div className="hb-stat-val" style={{ fontSize: 28 }}>{toCHF(portfolioValue)}</div>
          <div className="hb-muted" style={{ marginTop: 4 }}>
            {assets.length} Asset{assets.length !== 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      {/* Asset Allocation Donut */}
      {allocationData.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardContent>
            <h3 style={{ margin: 0, fontSize: 16, marginBottom: 8 }}>Asset-Allocation</h3>
            <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ minHeight: 260 }}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={allocationData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {allocationData.map((d) => (
                        <Cell key={d.name} fill={allocationColorMap.get(d.name)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => toCHF(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="hb-legend">
                {allocationData.map((d) => {
                  const pct = portfolioValue > 0 ? ((d.value / portfolioValue) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={d.name} className="hb-legend-row">
                      <div className="hb-legend-left">
                        <span className="hb-dot" style={{ background: allocationColorMap.get(d.name) }} />
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
      )}

      {/* Breakdown Charts (Tabs) */}
      {assets.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardContent>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["type", "region", "tags"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`hb-btn ${chartTab === tab ? "" : "hb-btn-outline"}`}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => setChartTab(tab)}
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </div>

            {breakdownData.length > 0 ? (
              <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ minHeight: 240 }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={breakdownData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {breakdownData.map((d) => (
                          <Cell key={d.name} fill={breakdownColorMap.get(d.name)} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => toCHF(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="hb-legend">
                  {breakdownData.map((d) => {
                    const pct = portfolioValue > 0 ? ((d.value / portfolioValue) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={d.name} className="hb-legend-row">
                        <div className="hb-legend-left">
                          <span className="hb-dot" style={{ background: breakdownColorMap.get(d.name) }} />
                          <span className="hb-small">{d.name}</span>
                        </div>
                        <span className="hb-muted">{toCHF(d.value)} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="hb-muted">Keine Daten fur diese Ansicht.</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Asset-Tabelle */}
      <Card>
        <CardContent>
          <h3 style={{ margin: 0, fontSize: 16, marginBottom: 12 }}>Assets</h3>
          {assets.length === 0 ? (
            <div className="hb-muted" style={{ textAlign: "center", padding: "20px 0" }}>
              Noch keine Assets. Fuege dein erstes Asset hinzu.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="hb-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Typ</th>
                    <th>Region</th>
                    <th style={{ textAlign: "right" }}>Menge</th>
                    <th style={{ textAlign: "right" }}>Preis/Einheit</th>
                    <th style={{ textAlign: "right" }}>Gesamtwert</th>
                    <th style={{ textAlign: "right" }}>Anteil</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => {
                    const val = calcAssetValue(a);
                    const pct = portfolioValue > 0 ? ((val / portfolioValue) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{a.name}</div>
                          {(a.ticker || a.isin) && (
                            <div className="hb-muted" style={{ fontSize: 11 }}>
                              {[a.ticker, a.isin].filter(Boolean).join(" | ")}
                            </div>
                          )}
                          {a.tags && a.tags.length > 0 && (
                            <div style={{ marginTop: 2 }}>
                              {a.tags.map((t) => (
                                <span key={t} className="hb-badge" style={{ marginRight: 4, fontSize: 10 }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>{a.assetType}</td>
                        <td>{a.region || "-"}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap", padding: "14px 14px" }}>
                          <span style={{ marginRight: 12 }}>{a.quantity} {a.unitLabel || "Anteile"}</span>
                          <Button
                            variant="outline"
                            onClick={() => openBuySellDialog(a)}
                            style={{
                              fontSize: 13,
                              padding: "4px 8px",
                              minHeight: "auto",
                              lineHeight: 1.4,
                              borderRadius: 4,
                              verticalAlign: "middle",
                            }}
                          >K/V</Button>
                        </td>
                        <td style={{ textAlign: "right" }}>{toCHF(a.pricePerUnit)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{toCHF(val)}</td>
                        <td style={{ textAlign: "right" }}>{pct}%</td>
                        <td>
                          <div className="hb-actions" style={{ justifyContent: "flex-end" }}>
                            <Button variant="outline" onClick={() => openAssetEditDialog(a)}>
                              Bearbeiten
                            </Button>
                            <Button variant="outline" onClick={() => deleteAsset(a)}>
                              Loschen
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Asset erstellen/bearbeiten */}
      <EditDialog
        open={assetDialogOpen}
        title={editingAsset ? "Asset bearbeiten" : "Neues Asset"}
        onClose={closeAssetDialog}
        onSave={saveAsset}
        canSave={canSaveAsset}
        saveLabel={editingAsset ? "Speichern" : "Hinzufugen"}
      >
        <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="hb-field" style={{ gridColumn: "1 / -1" }}>
            <div className="hb-label">Name *</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Vanguard FTSE All-World"
              value={assetDraft.name}
              onChange={(e) => setAssetDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Ticker (optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. VWRL"
              value={assetDraft.ticker}
              onChange={(e) => setAssetDraft((d) => ({ ...d, ticker: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">ISIN (optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. IE00B3RBWM25"
              value={assetDraft.isin}
              onChange={(e) => setAssetDraft((d) => ({ ...d, isin: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Menge *</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 8"
              value={assetDraft.quantity}
              onChange={(e) => setAssetDraft((d) => ({ ...d, quantity: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Einheit</div>
            <select
              className="hb-input"
              value={assetDraft.unitLabel}
              onChange={(e) => setAssetDraft((d) => ({ ...d, unitLabel: e.target.value }))}
            >
              <option value="Anteile">Anteile</option>
              <option value="Stuck">Stuck</option>
              <option value="g">g (Gramm)</option>
              <option value="oz">oz (Unze)</option>
            </select>
          </div>

          <div className="hb-field">
            <div className="hb-label">Preis/Einheit (CHF) *</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 105.50"
              value={assetDraft.pricePerUnit}
              onChange={(e) => setAssetDraft((d) => ({ ...d, pricePerUnit: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Asset-Typ *</div>
            <select
              className="hb-input"
              value={assetDraft.assetType}
              onChange={(e) => setAssetDraft((d) => ({ ...d, assetType: e.target.value }))}
            >
              {assetTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="hb-field">
            <div className="hb-label">Region (optional)</div>
            <select
              className="hb-input"
              value={assetDraft.region}
              onChange={(e) => setAssetDraft((d) => ({ ...d, region: e.target.value }))}
            >
              <option value="">Keine</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="hb-field" style={{ gridColumn: "1 / -1" }}>
            <div className="hb-label">Tags (komma-getrennt, optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Thesaurierend, Core"
              value={assetDraft.tags}
              onChange={(e) => setAssetDraft((d) => ({ ...d, tags: e.target.value }))}
            />
            {allTags.length > 0 && (
              <div className="hb-muted" style={{ marginTop: 4, fontSize: 11 }}>
                Vorhandene Tags: {allTags.join(", ")}
              </div>
            )}
          </div>

          <div className="hb-field" style={{ gridColumn: "1 / -1" }}>
            <div className="hb-label">Notiz (optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Kaufdatum, Broker, ..."
              value={assetDraft.note}
              onChange={(e) => setAssetDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </div>
        </div>
      </EditDialog>

      {/* Dialog: Kaufen/Verkaufen */}
      <EditDialog
        open={buySellOpen}
        title={buySellAsset ? `${buySellAsset.name} – Kaufen/Verkaufen` : "Kaufen/Verkaufen"}
        onClose={() => { setBuySellOpen(false); setBuySellAsset(null); }}
        onSave={saveBuySell}
        canSave={canSaveBuySell}
        saveLabel={buySellDraft.action === "buy" ? "Kaufen" : "Verkaufen"}
      >
        <div className="hb-form" style={{ flexDirection: "column", gap: 14 }}>
          <div className="hb-field">
            <div className="hb-label">Aktion</div>
            <select
              className="hb-input"
              value={buySellDraft.action}
              onChange={(e) => setBuySellDraft((d) => ({ ...d, action: e.target.value }))}
            >
              <option value="buy">Kaufen</option>
              <option value="sell">Verkaufen</option>
            </select>
          </div>
          <div className="hb-field">
            <div className="hb-label">Menge</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 2"
              value={buySellDraft.quantity}
              onChange={(e) => setBuySellDraft((d) => ({ ...d, quantity: e.target.value }))}
              autoFocus
            />
          </div>
          {buySellPreview && (
            <div className="hb-muted" style={{ fontSize: 13 }}>
              {buySellPreview.oldQty} {buySellPreview.unit} → {buySellPreview.newQty} {buySellPreview.unit}
            </div>
          )}
          {buySellDraft.action === "sell" && buySellAsset && parseAmount(buySellDraft.quantity) > buySellAsset.quantity && (
            <div style={{ color: "var(--red)", fontSize: 12 }}>Verkaufsmenge übersteigt Bestand.</div>
          )}
        </div>
      </EditDialog>

      {/* Dialog: Portfolio bearbeiten */}
      <EditDialog
        open={portfolioDialogOpen}
        title="Portfolio bearbeiten"
        onClose={() => setPortfolioDialogOpen(false)}
        onSave={savePortfolioEdit}
        canSave={portfolioDraft.name.trim().length > 0}
      >
        <div className="hb-form" style={{ flexDirection: "column", gap: 14 }}>
          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className="hb-input"
              type="text"
              value={portfolioDraft.name}
              onChange={(e) => setPortfolioDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="hb-field">
            <div className="hb-label">Beschreibung (optional)</div>
            <input
              className="hb-input"
              type="text"
              value={portfolioDraft.description}
              onChange={(e) => setPortfolioDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </div>
        </div>
      </EditDialog>
    </div>
  );
}
