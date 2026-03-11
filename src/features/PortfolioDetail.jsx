import React, { useMemo, useState, useCallback } from "react";
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
import { parseAmount, formatCurrency } from "../utils/hbUtils.js";
import { fetchMarketPrices } from "../dal/storage.js";
import { isElectron } from "../dal/storage.js";

// Market asset type options for the dispatcher routing
const MARKET_ASSET_TYPES = [
  { value: "crypto", label: "Kryptowährung", placeholder: "z.B. bitcoin, ethereum" },
  { value: "stock", label: "Aktie", placeholder: "z.B. AAPL, MSFT, NESN.SW" },
  { value: "etf", label: "ETF", placeholder: "z.B. SPY, VWRL.L, IUSQ.DE" },
  { value: "metal", label: "Edelmetall", placeholder: "z.B. XAU, XAG, XPT" },
];

function formatRelativeTime(isoString) {
  if (!isoString) return null;
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "gerade eben";
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(hours / 24);
    return `vor ${days} Tag${days !== 1 ? "en" : ""}`;
  } catch {
    return null;
  }
}

function PriceStatusBadge({ asset }) {
  if (asset.priceError) {
    return (
      <span
        title={asset.priceError}
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "var(--radius-sm, 4px)",
          fontSize: 11,
          fontWeight: 600,
          background: "var(--red-soft)",
          color: "var(--red)",
          border: "1px solid var(--red)",
          cursor: "help",
        }}
      >
        Fehler
      </span>
    );
  }
  if (!asset.lastUpdated) {
    return (
      <span style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: 11,
        fontWeight: 600,
        background: "var(--bg-subtle)",
        color: "var(--muted)",
        border: "1px solid var(--border)",
      }}>
        Manuell
      </span>
    );
  }
  const diffHours = (Date.now() - new Date(asset.lastUpdated).getTime()) / 3600000;
  const isStale = diffHours > 24;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "var(--radius-sm, 4px)",
      fontSize: 11,
      fontWeight: 600,
      background: isStale ? "var(--yellow-soft)" : "var(--green-soft)",
      color: isStale ? "var(--yellow)" : "var(--green)",
      border: `1px solid ${isStale ? "var(--yellow)" : "var(--green)"}`,
    }}>
      {isStale ? "Veraltet" : "Aktuell"}
    </span>
  );
}

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
  const baseCurrency = activeBook?.baseCurrency || "CHF";

  // Currency formatter using the book's baseCurrency
  const fmt = useCallback((n) => formatCurrency(n, baseCurrency), [baseCurrency]);

  // Autocomplete tags from all portfolios
  const allTags = useMemo(() => collectAllTags(portfolios), [portfolios]);

  // Chart tab
  const [chartTab, setChartTab] = useState("type"); // "type" | "region" | "tags"

  // Price update state
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceStatus, setPriceStatus] = useState(null); // { updated: number, errors: number } | null

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
    marketSymbol: "",
    marketAssetType: "",
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

  // --- Market Price Update ---
  async function updatePrices() {
    const assetsWithSymbol = assets.filter((a) => a.marketSymbol && a.marketAssetType);
    if (assetsWithSymbol.length === 0) return;

    setPriceLoading(true);
    setPriceStatus(null);

    try {
      const results = await fetchMarketPrices(assetsWithSymbol, baseCurrency);
      if (!results) {
        setPriceStatus({ updated: 0, errors: 0, unavailable: true });
        return;
      }

      let updated = 0;
      let errors = 0;

      patchPortfolio((p) => ({
        ...p,
        assets: (p.assets || []).map((asset) => {
          const result = results.find((r) => r.assetId === asset.id);
          if (!result) return asset;

          if (result.success) {
            updated++;
            return {
              ...asset,
              currentPrice: result.price,
              originalPrice: result.originalPrice,
              originalCurrency: result.originalCurrency,
              fxRate: result.fxRate,
              priceSource: result.source,
              lastUpdated: result.lastUpdated,
              priceError: null,
            };
          } else {
            errors++;
            return {
              ...asset,
              priceError: result.error,
              lastUpdated: result.lastUpdated,
            };
          }
        }),
      }));

      setPriceStatus({ updated, errors });
    } catch (err) {
      setPriceStatus({ updated: 0, errors: 1, message: err.message });
    } finally {
      setPriceLoading(false);
    }
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
      marketSymbol: "",
      marketAssetType: "",
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
      marketSymbol: asset.marketSymbol || "",
      marketAssetType: asset.marketAssetType || "",
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
                marketSymbol: assetDraft.marketSymbol.trim() || null,
                marketAssetType: assetDraft.marketAssetType || null,
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
        marketSymbol: assetDraft.marketSymbol.trim() || null,
        marketAssetType: assetDraft.marketAssetType || null,
        currentPrice: null,
        originalPrice: null,
        originalCurrency: null,
        fxRate: null,
        priceSource: null,
        lastUpdated: null,
        priceError: null,
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

  // Assets that have market config (for enabling the update button)
  const assetsWithMarketConfig = assets.filter((a) => a.marketSymbol && a.marketAssetType);

  // Placeholder text for the market symbol input
  const selectedMarketType = MARKET_ASSET_TYPES.find((t) => t.value === assetDraft.marketAssetType);
  const marketSymbolPlaceholder = selectedMarketType?.placeholder || "z.B. bitcoin, AAPL, XAU";

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
          {isElectron && assetsWithMarketConfig.length > 0 && (
            <Button
              variant="outline"
              onClick={updatePrices}
              disabled={priceLoading}
              style={{ minWidth: 140 }}
            >
              {priceLoading ? "Aktualisiere..." : "Preise aktualisieren"}
            </Button>
          )}
          <Button onClick={openAssetCreateDialog}>+ Asset hinzufugen</Button>
          <Button variant="outline" onClick={openPortfolioEditDialog}>Portfolio bearbeiten</Button>
        </div>
      </div>

      {/* Price update status */}
      {priceStatus && (
        <div style={{
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: "var(--radius-sm, 4px)",
          fontSize: 13,
          background: priceStatus.errors > 0 ? "var(--yellow-soft)" : "var(--green-soft)",
          color: priceStatus.errors > 0 ? "var(--yellow)" : "var(--green)",
          border: `1px solid ${priceStatus.errors > 0 ? "var(--yellow)" : "var(--green)"}`,
        }}>
          {priceStatus.unavailable
            ? "Marktpreise sind nur in der Desktop-App verfugbar."
            : `${priceStatus.updated} Preis${priceStatus.updated !== 1 ? "e" : ""} aktualisiert${priceStatus.errors > 0 ? `, ${priceStatus.errors} Fehler` : ""}.`}
        </div>
      )}

      {/* Portfolio value */}
      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <div className="hb-stat-title">Gesamtwert ({baseCurrency})</div>
          <div className="hb-stat-val" style={{ fontSize: 28 }}>{fmt(portfolioValue)}</div>
          <div className="hb-muted" style={{ marginTop: 4 }}>
            {assets.length} Asset{assets.length !== 1 ? "s" : ""}
            {assetsWithMarketConfig.length > 0 && (
              <> · {assetsWithMarketConfig.length} mit Marktpreis-Tracking</>
            )}
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
                    <Tooltip formatter={(val) => fmt(val)} />
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
                      <span className="hb-muted">{fmt(d.value)} ({pct}%)</span>
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
                      <Tooltip formatter={(val) => fmt(val)} />
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
                        <span className="hb-muted">{fmt(d.value)} ({pct}%)</span>
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
                    <th style={{ textAlign: "right" }}>Kaufpreis</th>
                    <th style={{ textAlign: "right" }}>Marktpreis</th>
                    <th style={{ textAlign: "right" }}>Gesamtwert</th>
                    <th style={{ textAlign: "right" }}>Anteil</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => {
                    const val = calcAssetValue(a);
                    const pct = portfolioValue > 0 ? ((val / portfolioValue) * 100).toFixed(1) : "0.0";
                    const hasMarket = a.marketSymbol && a.marketAssetType;
                    const relTime = formatRelativeTime(a.lastUpdated);
                    return (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{a.name}</div>
                          {(a.ticker || a.isin) && (
                            <div className="hb-muted" style={{ fontSize: 11 }}>
                              {[a.ticker, a.isin].filter(Boolean).join(" | ")}
                            </div>
                          )}
                          {hasMarket && (
                            <div className="hb-muted" style={{ fontSize: 11, marginTop: 1 }}>
                              {a.marketSymbol} · {a.marketAssetType}
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
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{ marginRight: 8 }}>{a.quantity} {a.unitLabel || "Anteile"}</span>
                          <Button
                            variant="outline"
                            onClick={() => openBuySellDialog(a)}
                            title="Kaufen / Verkaufen"
                            style={{
                              fontSize: 11,
                              padding: "2px 6px",
                              minHeight: "auto",
                              lineHeight: 1.4,
                              borderRadius: "var(--radius-sm, 4px)",
                              verticalAlign: "middle",
                            }}
                          >K/V</Button>
                        </td>
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>{fmt(a.pricePerUnit)}</td>
                        <td style={{ textAlign: "right" }}>
                          {hasMarket ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>
                                {a.currentPrice != null ? fmt(a.currentPrice) : "—"}
                              </div>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", marginTop: 3 }}>
                                <PriceStatusBadge asset={a} />
                                {relTime && (
                                  <span className="hb-muted" style={{ fontSize: 11 }}>{relTime}</span>
                                )}
                              </div>
                              {a.originalCurrency && a.originalCurrency !== baseCurrency && a.originalPrice != null && (
                                <div className="hb-muted" style={{ fontSize: 11, marginTop: 2 }}>
                                  {a.originalPrice.toFixed(2)} {a.originalCurrency}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="hb-muted" style={{ fontSize: 12 }}>Kein Tracking</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(val)}</td>
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
            <div className="hb-label">Kaufpreis/Einheit ({baseCurrency}) *</div>
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

          {/* Market data tracking section */}
          <div style={{
            gridColumn: "1 / -1",
            borderTop: "1px solid var(--border)",
            paddingTop: 12,
            marginTop: 4,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>
              Automatisches Marktpreis-Tracking
            </div>
          </div>

          <div className="hb-field">
            <div className="hb-label">API-Typ (optional)</div>
            <select
              className="hb-input"
              value={assetDraft.marketAssetType}
              onChange={(e) => setAssetDraft((d) => ({ ...d, marketAssetType: e.target.value, marketSymbol: "" }))}
            >
              <option value="">— Kein Tracking —</option>
              {MARKET_ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="hb-field">
            <div className="hb-label">Markt-Symbol (optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder={marketSymbolPlaceholder}
              value={assetDraft.marketSymbol}
              onChange={(e) => setAssetDraft((d) => ({ ...d, marketSymbol: e.target.value }))}
              disabled={!assetDraft.marketAssetType}
            />
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
