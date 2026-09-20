import React, { useEffect, useMemo, useRef, useState } from "react";
import EditDialog from "../../components/EditDialog.jsx";
import { Button, RangeTabs } from "../../components/ui.jsx";
import { HbDatePicker } from "../../components/HbDatePicker.jsx";
import { IconSearch, IconClose, IconCheck } from "../../components/icons.jsx";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { fetchQuote, marketDataAvailable, searchSymbols } from "../../dal/marketdata.js";
import { formatCurrency, formatDateDE, parseAmount, todayISO } from "../../utils/hbUtils.js";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  ASSET_NAME_MAX,
  GRAMS_PER_TROY_OUNCE,
  METALS,
  METAL_LABELS,
  METAL_SYMBOLS,
  TRANSACTION_TYPE_LABELS,
} from "../../utils/investmentModel.js";
import { normalizedQuantity, transactionAmounts } from "../../utils/investmentUtils.js";
import { formatQuantity } from "../../utils/investmentFormat.js";

// Wie lange nach dem letzten Tastendruck gewartet wird, bevor Yahoo befragt
// wird. Kürzer und jeder Buchstabe erzeugt einen Abruf — der sichere Weg in
// HTTP 429, dieselbe Falle wie beim Stapelabruf.
const SEARCH_DEBOUNCE_MS = 350;
const NOTE_MAX = 200;

const TYPE_OPTIONS = [
  { value: "buy", label: TRANSACTION_TYPE_LABELS.buy },
  { value: "sell", label: TRANSACTION_TYPE_LABELS.sell },
  { value: "dividend", label: TRANSACTION_TYPE_LABELS.dividend },
];

const KIND_OPTIONS = [
  { value: "security", label: "Wertpapier" },
  { value: "metal", label: "Edelmetall" },
];

const METAL_OPTIONS = METALS.map((m) => ({ value: m, label: METAL_LABELS[m] }));

const UNIT_OPTIONS = [
  { value: "g", label: "Gramm" },
  { value: "oz", label: "Feinunze (oz)" },
];

function emptyDraft(baseCurrency) {
  return {
    type: "buy",
    depotId: "",
    kind: "security",
    metal: "gold",
    assetId: "",
    symbol: "",
    name: "",
    assetClass: "etf",
    quoteCurrency: baseCurrency,
    date: todayISO(),
    quantity: "",
    unit: "pcs",
    price: "",
    fee: "",
    currency: baseCurrency,
    fxRate: "1",
    note: "",
  };
}

/**
 * Baut den Entwurf für eine bestehende Transaktion. `initial` ist die
 * Transaktion plus das zugehörige Asset — der Dialog kennt die Stammdaten
 * sonst nicht.
 */
function draftFromTransaction(tx, asset, baseCurrency) {
  if (!tx) return emptyDraft(baseCurrency);
  return {
    type: tx.type,
    depotId: tx.depotId,
    kind: asset?.kind === "metal" ? "metal" : "security",
    metal: asset?.metal || "gold",
    assetId: tx.assetId,
    symbol: asset?.symbol || "",
    name: asset?.name || "",
    assetClass: asset?.assetClass || "other",
    quoteCurrency: asset?.quoteCurrency || baseCurrency,
    date: tx.date,
    quantity: tx.type === "dividend" ? "" : String(tx.quantity),
    unit: tx.unit,
    price: String(tx.price),
    fee: tx.fee ? String(tx.fee) : "",
    currency: tx.currency,
    fxRate: String(tx.fxRate),
    note: tx.note || "",
  };
}

/**
 * Dialog zum Erfassen und Bearbeiten einer Investment-Transaktion.
 *
 * @param {{
 *   open: boolean, onClose: () => void,
 *   onSubmit: (result: object) => void,
 *   depots: Array<object>, assets: Array<object>, positions: Array<object>,
 *   baseCurrency: string, fmt: (n: number) => string,
 *   editing?: {transaction: object, asset: object}|null,
 *   defaultDepotId?: string,
 *   presetAssetId?: string,
 *   onManageDepots?: () => void,
 * }} props
 */
export default function InvestmentTransactionDialog({
  open,
  onClose,
  onSubmit,
  depots,
  assets,
  positions,
  baseCurrency,
  fmt,
  editing = null,
  defaultDepotId = "",
  presetAssetId = "",
  onManageDepots,
}) {
  const [draft, setDraft] = useState(() => emptyDraft(baseCurrency));
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteNote, setQuoteNote] = useState(null);

  // Entwurf beim Öffnen setzen — als Ableitung aus dem Prop-Wechsel statt im
  // Effect (dasselbe Muster wie im HbDatePicker, vermeidet Kaskadenrenders).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuoteNote(null);
      setQuoteBusy(false);
      if (editing?.transaction) {
        setDraft(draftFromTransaction(editing.transaction, editing.asset, baseCurrency));
      } else {
        const base = emptyDraft(baseCurrency);
        const preset = presetAssetId ? assets.find((a) => a.id === presetAssetId) : null;
        setDraft({
          ...base,
          depotId: defaultDepotId || depots[0]?.id || "",
          ...(preset
            ? {
                assetId: preset.id,
                symbol: preset.symbol,
                name: preset.name,
                assetClass: preset.assetClass,
                quoteCurrency: preset.quoteCurrency,
                kind: preset.kind,
                metal: preset.metal || "gold",
                unit: preset.kind === "metal" ? "g" : "pcs",
              }
            : null),
        });
      }
    }
  }

  function setField(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  const isDividend = draft.type === "dividend";
  const isMetal = draft.kind === "metal";

  // --- Asset-Auswahl ------------------------------------------------------

  /** Übernimmt einen Treffer aus der Suche oder einen vorhandenen Stammsatz. */
  async function selectAsset({ symbol, name, assetClass, existing }) {
    const upper = String(symbol || "").toUpperCase();
    setDraft((prev) => ({
      ...prev,
      assetId: existing?.id || "",
      symbol: upper,
      name: (name || existing?.name || upper).slice(0, ASSET_NAME_MAX),
      assetClass: existing?.assetClass || assetClass || prev.assetClass,
      quoteCurrency: existing?.quoteCurrency || prev.quoteCurrency,
      unit: "pcs",
    }));
    setQuoteNote(null);

    if (!marketDataAvailable) return;

    // Ein Abruf, genau hier: er liefert Handelswährung, aktuellen Kurs und den
    // FX-Kurs für Beschluss D in einem Zug.
    setQuoteBusy(true);
    const res = await fetchQuote(upper, baseCurrency);
    setQuoteBusy(false);
    if (!res.ok || !res.data) {
      setQuoteNote({ bad: true, text: res.error || "Kurs konnte nicht abgerufen werden." });
      return;
    }
    const d = res.data;
    setDraft((prev) => ({
      ...prev,
      quoteCurrency: d.originalCurrency || prev.quoteCurrency,
      currency: d.originalCurrency || prev.currency,
      price: d.originalPrice != null ? String(d.originalPrice) : prev.price,
      fxRate: d.fxRate != null ? String(d.fxRate) : "1",
    }));
    setQuoteNote({
      bad: false,
      text: `Aktueller Kurs übernommen: ${d.originalPrice} ${d.originalCurrency}. Für einen älteren Kauf bitte Preis und Wechselkurs anpassen.`,
    });
  }

  function clearAsset() {
    setDraft((prev) => ({ ...prev, assetId: "", symbol: "", name: "" }));
    setQuoteNote(null);
  }

  /** Metall-Zweig: Symbol, Klasse und Bewertungswährung stehen fest. */
  function selectMetal(metal) {
    const symbol = METAL_SYMBOLS[metal];
    const existing = assets.find((a) => a.symbol === symbol);
    setDraft((prev) => ({
      ...prev,
      metal,
      assetId: existing?.id || "",
      symbol,
      name: existing?.name || METAL_LABELS[metal],
      assetClass: "metal",
      // GC=F/SI=F notieren in USD je Feinunze — das ist die Bewertungswährung
      // des Stammsatzes, nicht die Währung des Kaufs.
      quoteCurrency: "USD",
      unit: prev.unit === "g" || prev.unit === "oz" ? prev.unit : "g",
    }));
    setQuoteNote(null);
  }

  function switchKind(kind) {
    if (kind === "metal") {
      setField("kind", "metal");
      selectMetal(draft.metal || "gold");
    } else {
      setDraft((prev) => ({
        ...prev,
        kind: "security",
        assetId: "",
        symbol: "",
        name: "",
        assetClass: "etf",
        unit: "pcs",
        quoteCurrency: baseCurrency,
        currency: baseCurrency,
        fxRate: "1",
      }));
      setQuoteNote(null);
    }
  }

  // --- Abgeleitete Werte --------------------------------------------------

  const quantityNum = isDividend ? 1 : parseAmount(draft.quantity);
  const priceNum = parseAmount(draft.price);
  const feeNum = draft.fee.trim() === "" ? 0 : parseAmount(draft.fee);
  const fxNum = parseAmount(draft.fxRate);

  const amounts = useMemo(
    () =>
      transactionAmounts({
        type: draft.type,
        quantity: Number.isFinite(quantityNum) ? quantityNum : 0,
        price: Number.isFinite(priceNum) ? priceNum : 0,
        fee: Number.isFinite(feeNum) ? feeNum : 0,
        fxRate: Number.isFinite(fxNum) && fxNum > 0 ? fxNum : 1,
      }),
    [draft.type, quantityNum, priceNum, feeNum, fxNum]
  );

  // Umrechnung als Live-Hinweis unter dem Mengenfeld — gespeichert wird die
  // Menge wie eingegeben, bewertet wird in Feinunzen.
  const metalConversion = useMemo(() => {
    if (!isMetal || isDividend || !Number.isFinite(quantityNum) || quantityNum <= 0) return null;
    const asTx = { quantity: quantityNum, unit: draft.unit };
    const oz = normalizedQuantity(asTx, { kind: "metal" });
    return draft.unit === "g"
      ? `entspricht ${formatQuantity(oz, "oz")}`
      : `entspricht ${formatQuantity(quantityNum * GRAMS_PER_TROY_OUNCE, "g")}`;
  }, [isMetal, isDividend, quantityNum, draft.unit]);

  // Verkauf über den Bestand hinaus: Hinweis, kein Riegel. Korrekturbuchungen
  // müssen möglich bleiben; der Rechenkern fängt den Fall mit `hasOversell` ab.
  const oversellHint = useMemo(() => {
    if (draft.type !== "sell" || !draft.depotId || !Number.isFinite(quantityNum)) return null;
    const assetId = draft.assetId;
    if (!assetId) return null;
    const pos = positions.find((p) => p.depotId === draft.depotId && p.assetId === assetId);
    const held = pos?.quantity ?? 0;
    const wanted = normalizedQuantity({ quantity: quantityNum, unit: draft.unit }, { kind: isMetal ? "metal" : "security" });
    // Beim Bearbeiten zählt die eigene alte Menge noch zum Bestand — sie würde
    // sonst doppelt abgezogen und jeder Vollverkauf wirkte fehlerhaft.
    const ownOld =
      editing?.transaction?.type === "sell" && editing.transaction.assetId === assetId
        ? normalizedQuantity(editing.transaction, { kind: isMetal ? "metal" : "security" })
        : 0;
    if (wanted <= held + ownOld) return null;
    return `Mehr als der aktuelle Bestand (${formatQuantity(held + ownOld, isMetal ? "oz" : "pcs")}).`;
  }, [draft.type, draft.depotId, draft.assetId, draft.unit, quantityNum, positions, isMetal, editing]);

  const hasAsset = Boolean(draft.assetId || draft.symbol);
  const canSave =
    Boolean(draft.depotId) &&
    hasAsset &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.date) &&
    (isDividend || (Number.isFinite(quantityNum) && quantityNum > 0)) &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    Number.isFinite(feeNum) &&
    feeNum >= 0 &&
    Number.isFinite(fxNum) &&
    fxNum > 0;

  const foreignCurrency = draft.currency.toUpperCase() !== baseCurrency.toUpperCase();

  // Brutto und Gebühr stehen in der Handelswährung — `fmt` würde sie mit dem
  // Zeichen der Buchwährung beschriften und damit falsch ausweisen.
  const tradeFmt = (n) => formatCurrency(n, draft.currency.toUpperCase() || baseCurrency);

  function handleSave() {
    if (!canSave) return;
    onSubmit({
      // Stammsatz: entweder ein vorhandener oder die Daten für einen neuen.
      asset: draft.assetId
        ? { id: draft.assetId }
        : {
            symbol: draft.symbol,
            name: draft.name || draft.symbol,
            assetClass: isMetal ? "metal" : draft.assetClass,
            quoteCurrency: draft.quoteCurrency,
            kind: isMetal ? "metal" : "security",
            metal: isMetal ? draft.metal : null,
          },
      transaction: {
        id: editing?.transaction?.id,
        depotId: draft.depotId,
        type: draft.type,
        date: draft.date,
        quantity: isDividend ? 1 : quantityNum,
        unit: isDividend ? "pcs" : isMetal ? draft.unit : "pcs",
        price: priceNum,
        fee: feeNum,
        currency: draft.currency.toUpperCase(),
        fxRate: fxNum,
        note: draft.note.trim().slice(0, NOTE_MAX),
      },
    });
  }

  const movesPosition =
    editing?.transaction &&
    (editing.transaction.depotId !== draft.depotId || editing.transaction.assetId !== draft.assetId);

  return (
    <EditDialog
      open={open}
      title={editing ? "Transaktion bearbeiten" : "Transaktion erfassen"}
      onClose={onClose}
      onSave={handleSave}
      canSave={canSave}
      saveLabel={editing ? "Speichern" : "Erfassen"}
      size="medium"
      bodyScroll={false}
    >
      <div className="hb-inv-form">
        <div className="hb-field">
          <div className="hb-label">Art</div>
          <RangeTabs
            options={TYPE_OPTIONS}
            value={draft.type}
            onChange={(v) => setField("type", v)}
            ariaLabel="Art der Transaktion"
            style={{ width: "100%" }}
          />
        </div>

        <div className="hb-field">
          <div className="hb-label">Depot</div>
          {depots.length > 0 ? (
            <select
              className="hb-input"
              value={draft.depotId}
              onChange={(e) => setField("depotId", e.target.value)}
            >
              {depots.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          ) : (
            <div className="hb-inv-form-hint">
              Noch kein Depot vorhanden.{" "}
              {onManageDepots && (
                <Button size="sm" variant="outline" onClick={onManageDepots}>
                  Depot anlegen
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="hb-field">
          <div className="hb-label">Was</div>
          <RangeTabs
            options={KIND_OPTIONS}
            value={draft.kind}
            onChange={switchKind}
            ariaLabel="Art der Anlage"
            style={{ width: "100%" }}
          />
        </div>

        {isMetal ? (
          <div className="hb-field">
            <div className="hb-label">Metall</div>
            <RangeTabs
              options={METAL_OPTIONS}
              value={draft.metal}
              onChange={selectMetal}
              ariaLabel="Metall wählen"
              style={{ width: "100%" }}
            />
            <div className="hb-inv-form-hint">
              Bewertet über {METAL_SYMBOLS[draft.metal]} in USD je Feinunze. Angenommen wird
              Feingehalt .999.
            </div>
          </div>
        ) : (
          <AssetPicker
            assets={assets}
            selectedSymbol={draft.symbol}
            selectedName={draft.name}
            onSelect={selectAsset}
            onClear={clearAsset}
            busy={quoteBusy}
          />
        )}

        {!isMetal && draft.symbol && (
          <div className="hb-two hb-two--dialog">
            <div className="hb-field">
              <div className="hb-label">Bezeichnung</div>
              <input
                className="hb-input"
                type="text"
                value={draft.name}
                maxLength={ASSET_NAME_MAX}
                onChange={(e) => setField("name", e.target.value)}
                disabled={Boolean(draft.assetId)}
              />
            </div>
            <div className="hb-field">
              <div className="hb-label">Anlageklasse</div>
              <select
                className="hb-input"
                value={draft.assetClass}
                onChange={(e) => setField("assetClass", e.target.value)}
                disabled={Boolean(draft.assetId)}
              >
                {ASSET_CLASSES.filter((c) => c !== "metal").map((c) => (
                  <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {quoteNote && (
          <div className={`hb-inv-form-hint${quoteNote.bad ? " hb-inv-form-hint--bad" : ""}`}>
            {quoteNote.text}
          </div>
        )}

        <div className="hb-field">
          <div className="hb-label">Datum</div>
          <HbDatePicker value={draft.date} onChange={(v) => setField("date", v)} />
          <div className="hb-inv-form-hint">
            Vergangene Käufe sind ausdrücklich erlaubt — Bestand und Einstand werden
            rückwirkend berechnet.
          </div>
        </div>

        {!isDividend && (
          <div className="hb-two hb-two--dialog">
            <div className="hb-field">
              <div className="hb-label">Menge</div>
              <input
                className="hb-input"
                type="text"
                inputMode="decimal"
                placeholder={isMetal ? "z.B. 100" : "z.B. 10"}
                value={draft.quantity}
                onChange={(e) => setField("quantity", e.target.value)}
              />
              {metalConversion && <div className="hb-inv-form-hint">{metalConversion}</div>}
              {oversellHint && (
                <div className="hb-inv-form-hint hb-inv-form-hint--bad">{oversellHint}</div>
              )}
            </div>
            <div className="hb-field">
              <div className="hb-label">Einheit</div>
              {isMetal ? (
                <select
                  className="hb-input"
                  value={draft.unit}
                  onChange={(e) => setField("unit", e.target.value)}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              ) : (
                <input className="hb-input" type="text" value="Stück" disabled readOnly />
              )}
            </div>
          </div>
        )}

        <div className="hb-two hb-two--dialog">
          <div className="hb-field">
            <div className="hb-label">{isDividend ? "Betrag" : "Preis je Einheit"}</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 112.40"
              value={draft.price}
              onChange={(e) => setField("price", e.target.value)}
            />
          </div>
          <div className="hb-field">
            <div className="hb-label">Währung</div>
            <input
              className="hb-input"
              type="text"
              maxLength={3}
              value={draft.currency}
              onChange={(e) => setField("currency", e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="hb-two hb-two--dialog">
          <div className="hb-field">
            <div className="hb-label">Gebühr (optional)</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.fee}
              onChange={(e) => setField("fee", e.target.value)}
            />
          </div>
          {foreignCurrency ? (
            <div className="hb-field">
              <div className="hb-label">Wechselkurs</div>
              <input
                className="hb-input"
                type="text"
                inputMode="decimal"
                value={draft.fxRate}
                onChange={(e) => setField("fxRate", e.target.value)}
              />
              <div className="hb-inv-form-hint">
                1 {draft.currency.toUpperCase()} = {draft.fxRate || "?"} {baseCurrency} · Kurs vom{" "}
                {formatDateDE(draft.date)}
              </div>
            </div>
          ) : (
            <div className="hb-field" />
          )}
        </div>

        <div className="hb-field">
          <div className="hb-label">Notiz (optional)</div>
          <input
            className="hb-input"
            type="text"
            maxLength={NOTE_MAX}
            placeholder="z.B. Sparplanrate, Erbschaft"
            value={draft.note}
            onChange={(e) => setField("note", e.target.value)}
          />
        </div>

        {movesPosition && (
          <div className="hb-inv-form-hint">
            Verschiebt die Buchung in eine andere Position.
          </div>
        )}

        {/* Die einzige Stelle, an der vor dem Speichern sichtbar wird, was
            tatsächlich gebucht wird — inklusive Umrechnung in die Buchwährung. */}
        <div className="hb-info-pills">
          <span className="hb-info-pill">Brutto {tradeFmt(amounts.gross)}</span>
          <span className="hb-info-pill">Gebühr {tradeFmt(amounts.fee)}</span>
          <span className="hb-info-pill hb-info-pill--total">
            {draft.type === "buy" ? "Aufwand" : "Ertrag"} {fmt(amounts.netBase)}
          </span>
        </div>
      </div>
    </EditDialog>
  );
}

/**
 * Symbolsuche mit zwei Quellen: zuerst die Stammsätze, die schon im Buch
 * stehen (Dublettenschutz — zwei Sätze für dasselbe Symbol würden den Bestand
 * aufspalten), darunter die Treffer von Yahoo.
 */
function AssetPicker({ assets, selectedSymbol, selectedName, onSelect, onClear, busy }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useClickOutside(wrapRef, () => setOpen(false), { enabled: open });

  // Unter zwei Zeichen wird gar nicht gesucht. Die alte Trefferliste wird dabei
  // nicht geleert, sondern beim Rendern ausgeblendet — ein setState im Effect
  // wäre ein zusätzlicher Renderdurchgang für nichts.
  const queryLongEnough = query.trim().length >= 2;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !marketDataAvailable) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await searchSymbols(q);
      if (cancelled) return;
      setResults(res.ok && Array.isArray(res.data) ? res.data : []);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const visibleResults = queryLongEnough ? results : [];

  const known = useMemo(() => {
    const q = query.trim().toLowerCase();
    const securities = assets.filter((a) => a.kind !== "metal");
    if (!q) return securities.slice(0, 8);
    return securities
      .filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [assets, query]);

  if (selectedSymbol) {
    return (
      <div className="hb-field">
        <div className="hb-label">Wertpapier</div>
        <div className="hb-info-pills">
          <span className="hb-info-pill hb-info-pill--title">{selectedSymbol}</span>
          <span className="hb-inv-sub">{selectedName}</span>
          {busy && <span className="hb-inv-sub">Kurs wird geholt …</span>}
          <button
            type="button"
            className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
            onClick={onClear}
            aria-label="Auswahl aufheben"
            title="Anderes Wertpapier wählen"
          >
            <IconClose />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hb-field">
      <div className="hb-label">Wertpapier</div>
      <div className="hb-search-field hb-search-field--block" ref={wrapRef}>
        <span className="hb-search-icon"><IconSearch /></span>
        <input
          className="hb-input"
          type="text"
          placeholder="Symbol oder Name suchen …"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && (known.length > 0 || visibleResults.length > 0 || searching) && (
          <div className="hb-cg-group-list hb-inv-search-results" role="listbox">
            {known.length > 0 && (
              <>
                <div className="hb-inv-search-head">Bereits im Buch</div>
                {known.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="hb-cg-group-item"
                    onClick={() => {
                      onSelect({ symbol: a.symbol, name: a.name, existing: a });
                      setOpen(false);
                    }}
                  >
                    <span className="hb-inv-search-symbol">{a.symbol}</span>
                    <span className="hb-cg-group-item-name">{a.name}</span>
                    <IconCheck width={16} height={16} className="hb-cg-group-item-check" />
                  </button>
                ))}
                {(visibleResults.length > 0 || searching) && (
                  <div className="hb-cg-group-list-divider" />
                )}
              </>
            )}

            {searching && <div className="hb-inv-search-head">Wird gesucht …</div>}

            {visibleResults.map((r) => (
              <button
                key={r.symbol}
                type="button"
                role="option"
                aria-selected="false"
                className="hb-cg-group-item"
                onClick={() => {
                  onSelect({ symbol: r.symbol, name: r.name, assetClass: guessAssetClass(r.type) });
                  setOpen(false);
                }}
              >
                <span className="hb-inv-search-symbol">{r.symbol}</span>
                <span className="hb-cg-group-item-name">{r.name || r.symbol}</span>
                <span className="hb-inv-sub">{r.exchange}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!marketDataAvailable && (
        <div className="hb-inv-form-hint">
          Die Symbolsuche braucht die Desktop-App. Vorhandene Wertpapiere lassen sich
          trotzdem auswählen.
        </div>
      )}
    </div>
  );
}

/** Yahoos `quoteType` auf unsere Anlageklassen abbilden. */
function guessAssetClass(type) {
  const t = String(type || "").toUpperCase();
  if (t === "ETF") return "etf";
  if (t === "EQUITY") return "stock";
  if (t === "BOND" || t === "MUTUALFUND") return "bond";
  return "other";
}
