// src/utils/investmentUtils.js

export const DEFAULT_ASSET_TYPES = [
  "ETF", "Aktie", "Anleihe", "ETC", "Fonds", "Edelmetall", "Krypto", "Immobilie", "Sonstiges",
];

export const DEFAULT_REGIONS = [
  "Welt", "Europa", "USA", "Schweiz", "Emerging Markets", "Asien", "Deutschland",
];

export function generatePortfolioId() {
  return `portfolio_${Date.now()}`;
}

export function generateAssetId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function calcAssetValue(asset) {
  // Prefer currentPrice (live market price) over pricePerUnit (manual entry)
  const price = asset.currentPrice != null ? asset.currentPrice : asset.pricePerUnit;
  return (Number(asset.quantity) || 0) * (Number(price) || 0);
}

export function calcPortfolioValue(portfolio) {
  return (portfolio.assets || []).reduce((sum, a) => sum + calcAssetValue(a), 0);
}

export function calcAllPortfoliosValue(portfolios) {
  return (portfolios || []).reduce((sum, p) => sum + calcPortfolioValue(p), 0);
}

export function groupByAssetType(assets) {
  const map = {};
  for (const a of assets || []) {
    const type = a.assetType || "Sonstiges";
    map[type] = (map[type] || 0) + calcAssetValue(a);
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function groupByRegion(assets) {
  const map = {};
  for (const a of assets || []) {
    const region = a.region || "Keine";
    map[region] = (map[region] || 0) + calcAssetValue(a);
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function groupByTags(assets) {
  const map = {};
  for (const a of assets || []) {
    const tags = Array.isArray(a.tags) && a.tags.length ? a.tags : ["Ohne Tag"];
    const val = calcAssetValue(a);
    for (const tag of tags) {
      map[tag] = (map[tag] || 0) + val;
    }
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function collectAllTags(portfolios) {
  const set = new Set();
  for (const p of portfolios || []) {
    for (const a of p.assets || []) {
      for (const t of a.tags || []) {
        if (t.trim()) set.add(t.trim());
      }
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
}

// Market data field defaults for each asset
const MARKET_DATA_DEFAULTS = {
  marketSymbol: null,      // API symbol (e.g. 'bitcoin', 'AAPL', 'XAU')
  marketAssetType: null,   // Routing type: 'crypto' | 'stock' | 'etf' | 'metal'
  currentPrice: null,      // Current price in book's baseCurrency
  originalPrice: null,     // Price in provider's native currency
  originalCurrency: null,  // Provider's currency (e.g. 'USD')
  fxRate: null,            // FX conversion rate used
  priceSource: null,       // Provider name (e.g. 'coingecko', 'yahoo')
  lastUpdated: null,       // ISO-8601 timestamp of last price update
  priceError: null,        // Error message if last fetch failed, otherwise null
};

export function normalizeInvestmentData(book) {
  const b = { ...book };
  if (!Array.isArray(b.investmentPortfolios)) {
    b.investmentPortfolios = [];
  } else {
    // Normalize assets: add market data fields with null defaults if missing
    b.investmentPortfolios = b.investmentPortfolios.map((portfolio) => ({
      ...portfolio,
      assets: (portfolio.assets || []).map((asset) => ({
        ...MARKET_DATA_DEFAULTS,
        ...asset, // existing values override the defaults
      })),
    }));
  }
  if (!Array.isArray(b.investmentAssetTypes)) {
    b.investmentAssetTypes = [...DEFAULT_ASSET_TYPES];
  }
  if (!Array.isArray(b.investmentRegions)) {
    b.investmentRegions = [...DEFAULT_REGIONS];
  }
  if (!Array.isArray(b.investmentTags)) {
    b.investmentTags = [];
  }
  return b;
}
