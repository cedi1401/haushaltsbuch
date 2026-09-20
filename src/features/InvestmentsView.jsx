import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import EditDialog from "../components/EditDialog.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { useToast } from "../components/toastContext.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import {
  IconInbox,
  IconInfo,
  IconPlus,
  IconRefresh,
  IconWallet,
} from "../components/icons.jsx";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { GROUP_ACCENT_PALETTE } from "../utils/hbPalette.js";
import { formatDateDE } from "../utils/hbUtils.js";
import { emptyInvestments, GRAMS_PER_TROY_OUNCE } from "../utils/investmentModel.js";
import {
  calcDepotSummaries,
  calcPositions,
  summarizePositions,
  transactionsForPosition,
} from "../utils/investmentUtils.js";
import {
  addAsset,
  addTransaction,
  removeTransaction,
  updateTransaction,
} from "../utils/investmentActions.js";
import {
  formatFetchedAt,
  formatPercent,
  formatQuantity,
  gainClass,
} from "../utils/investmentFormat.js";
import { useInvestmentQuotes } from "../hooks/useInvestmentQuotes.js";
import DepotsManager from "./investments/DepotsManager.jsx";
import InvestmentTransactionDialog from "./investments/InvestmentTransactionDialog.jsx";
import { buildPositionColumns } from "./investments/positionColumns.jsx";

/**
 * Investment-View — Positionen, gruppiert nach Depot.
 *
 * Der View rechnet nichts selbst: `calcPositions` bekommt die Transaktionen und
 * die Kurs-Map und liefert alles Fertige. Hier stehen nur Darstellung, Dialoge
 * und das Schreiben zurück ins Buch.
 *
 * Bewusst ohne jede Verbindung zu Töpfen, Einträgen oder Fixkosten
 * (Beschluss G): ein Depot ist ein Aufbewahrungsort, kein Haushaltskonto.
 */
export default function InvestmentsView({ activeBook, onUpdateBook }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const toast = useToast();
  const { confirm } = useConfirm();

  const investments = activeBook?.investments || emptyInvestments();

  const [depotsOpen, setDepotsOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [txPreset, setTxPreset] = useState({ depotId: "", assetId: "" });

  const { quotes, loading, error, oldestFetchedAt, hasStale, available, refresh } =
    useInvestmentQuotes(investments, baseCurrency);

  const positions = useMemo(() => calcPositions(investments, quotes), [investments, quotes]);
  const total = useMemo(() => summarizePositions(positions), [positions]);
  const depotSummaries = useMemo(
    () => calcDepotSummaries(investments, positions),
    [investments, positions]
  );

  const assetById = useMemo(
    () => new Map((investments.assets || []).map((a) => [a.id, a])),
    [investments.assets]
  );

  const columns = useMemo(() => buildPositionColumns({ fmt, baseCurrency }), [fmt, baseCurrency]);

  // Die Tabelle braucht je Zeile eine `id`; `share` lässt sich nur mit dem
  // Gesamtwert berechnen und gehört deshalb hierher, nicht in den Spaltensatz.
  const sections = useMemo(() => {
    const totalValue = total.marketValue || 0;
    return depotSummaries.map((d, i) => ({
      key: d.depotId,
      label: d.name,
      accent: GROUP_ACCENT_PALETTE[i % GROUP_ACCENT_PALETTE.length],
      rows: d.positions.map((p) => ({
        ...p,
        id: p.key,
        share: p.marketValue === null || totalValue <= 0 ? null : (p.marketValue / totalValue) * 100,
      })),
      aside: (
        <>
          <span className="hb-dt-band-value">
            {d.summary.marketValue === null ? "—" : fmt(d.summary.marketValue)}
          </span>
          {d.summary.unrealizedGain !== null && (
            <span className={gainClass(d.summary.unrealizedGain)}>
              {d.summary.unrealizedGain > 0 ? "+" : ""}
              {fmt(d.summary.unrealizedGain)}
            </span>
          )}
          {d.positions.length === 0 && <span className="hb-muted">noch leer</span>}
          <OverflowMenu
            buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
            label={`Aktionen für „${d.name}“`}
            items={[
              {
                label: "Transaktion in diesem Depot erfassen",
                onClick: () => openNewTransaction(d.depotId, ""),
              },
              { label: "Depots verwalten", onClick: () => setDepotsOpen(true) },
            ]}
          />
        </>
      ),
    }));
  }, [depotSummaries, total.marketValue, fmt]);

  // --- Schreiben ins Buch -------------------------------------------------

  function applyInvestments(next) {
    onUpdateBook?.({ ...activeBook, investments: next });
  }

  function openNewTransaction(depotId = "", assetId = "") {
    setEditingTx(null);
    setTxPreset({ depotId, assetId });
    setTxOpen(true);
  }

  function openEditTransaction(tx) {
    setEditingTx({ transaction: tx, asset: assetById.get(tx.assetId) || null });
    setTxOpen(true);
  }

  function handleTransactionSubmit({ asset, transaction }) {
    // Stammsatz zuerst: eine neue Transaktion braucht eine assetId, und ein
    // bereits bekanntes Symbol darf keinen zweiten Stammsatz erzeugen.
    let working = investments;
    let assetId = asset.id;

    if (!assetId) {
      const res = addAsset(working, asset);
      if (!res) {
        toast.error("Das Wertpapier konnte nicht angelegt werden.");
        return;
      }
      working = res.investments;
      assetId = res.asset.id;
    }

    if (editingTx?.transaction) {
      applyInvestments(updateTransaction(working, editingTx.transaction.id, { ...transaction, assetId }));
      toast.success("Transaktion gespeichert.");
    } else {
      const res = addTransaction(working, { ...transaction, assetId });
      if (!res) {
        toast.error("Die Transaktion konnte nicht erfasst werden.");
        return;
      }
      applyInvestments(res.investments);
      toast.success("Transaktion erfasst.");
    }

    setTxOpen(false);
    setEditingTx(null);
  }

  async function deleteTransaction(tx) {
    const ok = await confirm({
      title: "Transaktion löschen",
      message: `Transaktion vom ${formatDateDE(tx.date)} wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    applyInvestments(removeTransaction(investments, tx.id));
    toast.success("Transaktion gelöscht.");
  }

  // --- Detailbereich einer Position ---------------------------------------

  function renderDetail(row) {
    const txs = transactionsForPosition(investments, row.depotId, row.assetId);
    return (
      <div className="hb-two" style={{ gap: 24 }}>
        <div className="hb-inv-detail">
          <DetailRow label="Eingesetzt" value={fmt(row.invested)} />
          <DetailRow label="Kostenbasis (Bestand)" value={fmt(row.costBasis)} />
          <DetailRow label="Gebühren" value={fmt(row.fees)} />
          <DetailRow
            label="Realisiert"
            value={`${row.realizedGain > 0 ? "+" : ""}${fmt(row.realizedGain)}`}
            className={gainClass(row.realizedGain)}
          />
          <DetailRow label="Ausschüttungen" value={fmt(row.dividends)} />
          <DetailRow
            label="Gesamtrendite"
            value={`${row.totalReturn > 0 ? "+" : ""}${fmt(row.totalReturn)} (${formatPercent(row.totalReturnPct)})`}
            className={gainClass(row.totalReturn)}
          />
          <DetailRow
            label="Buchungen"
            value={`${row.transactionCount} · ${formatDateDE(row.firstDate)} bis ${formatDateDE(row.lastDate)}`}
          />
        </div>

        <div className="hb-inv-detail">
          <DetailRow label="Symbol" value={row.quoteSymbol} />
          <DetailRow label="Handelswährung" value={row.quoteCurrency} />
          <DetailRow label="Kurs vom" value={formatFetchedAt(row.fetchedAt)} />
          {row.kind === "metal" && (
            <DetailRow
              label="Bestand in Gramm"
              value={formatQuantity(row.quantity * GRAMS_PER_TROY_OUNCE, "g")}
            />
          )}
          {row.quoteError && (
            <DetailRow label="Kursfehler" value={row.quoteError} className="hb-bad" />
          )}
          <div className="hb-inv-detail-note">
            Käufe werden mit dem Wechselkurs vom Kauftag gerechnet, nicht mit dem heutigen.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Button size="sm" variant="outline" onClick={() => openNewTransaction(row.depotId, row.assetId)}>
              <IconPlus /> Transaktion erfassen
            </Button>
          </div>

          {txs.length > 0 && (
            <div className="hb-inv-detail-txs">
              {txs.slice(0, 5).map((tx) => (
                <div key={tx.id} className="hb-inv-detail-tx">
                  <span className="hb-muted">{formatDateDE(tx.date)}</span>
                  <span>{TX_LABEL[tx.type]}</span>
                  <span>
                    {tx.type === "dividend"
                      ? fmt(tx.price * tx.fxRate)
                      : `${formatQuantity(tx.quantity, tx.unit)} × ${tx.price} ${tx.currency}`}
                  </span>
                  <OverflowMenu
                    buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                    label="Aktionen für diese Buchung"
                    items={[
                      { label: "Bearbeiten", onClick: () => openEditTransaction(tx) },
                      { label: "Löschen", danger: true, onClick: () => deleteTransaction(tx) },
                    ]}
                  />
                </div>
              ))}
              {txs.length > 5 && (
                <div className="hb-muted" style={{ fontSize: 12 }}>
                  … und {txs.length - 5} weitere
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Leerzustände -------------------------------------------------------

  const depots = investments.depots || [];
  const hasTransactions = (investments.transactions || []).length > 0;

  const dialogs = (
    <>
      <EditDialog
        open={depotsOpen}
        title="Depots verwalten"
        onClose={() => setDepotsOpen(false)}
        onSave={() => setDepotsOpen(false)}
        canSave
        saveLabel="Schließen"
        size="medium"
      >
        <DepotsManager investments={investments} onChange={applyInvestments} />
      </EditDialog>

      <InvestmentTransactionDialog
        open={txOpen}
        onClose={() => {
          setTxOpen(false);
          setEditingTx(null);
        }}
        onSubmit={handleTransactionSubmit}
        depots={depots}
        assets={investments.assets || []}
        positions={positions}
        baseCurrency={baseCurrency}
        fmt={fmt}
        editing={editingTx}
        defaultDepotId={txPreset.depotId}
        presetAssetId={txPreset.assetId}
        onManageDepots={() => setDepotsOpen(true)}
      />
    </>
  );

  if (depots.length === 0) {
    return (
      <>
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconWallet /></div>
              <div className="hb-empty-title">Noch keine Depots</div>
              <div className="hb-empty-text">
                Ein Depot ist der Ort, an dem etwas liegt — ein Broker, eine Bank, aber auch
                „Zu Hause" oder ein Bankschließfach. Lege dein erstes Depot an.
              </div>
              <Button onClick={() => setDepotsOpen(true)}>
                <IconWallet /> Depot anlegen
              </Button>
            </div>
          </CardContent>
        </Card>
        {dialogs}
      </>
    );
  }

  const header = (
    <div className="hb-row" style={{ marginBottom: 16, alignItems: "center" }}>
      <div className="hb-info-pills">
        <span className="hb-info-pill">
          {oldestFetchedAt ? `Stand vom ${formatFetchedAt(oldestFetchedAt)}` : "Noch keine Kurse abgerufen"}
        </span>
        {hasStale && (
          <span
            className="hb-badge hb-inv-pill hb-inv-pill--stale"
            title="Die App konnte die Kurse nicht neu abrufen und zeigt die letzten bekannten."
          >
            Kurse veraltet
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant="outline"
          onClick={() => refresh({ bypassCache: true })}
          disabled={loading || !available}
          title={available ? undefined : "Kurse gibt es nur in der Desktop-App."}
        >
          <IconRefresh /> {loading ? "Wird aktualisiert …" : "Kurse aktualisieren"}
        </Button>
        <Button variant="outline" onClick={() => setDepotsOpen(true)}>
          <IconWallet /> Depots verwalten
        </Button>
        <Button onClick={() => openNewTransaction(depots[0]?.id || "", "")}>
          <IconPlus /> Transaktion erfassen
        </Button>
      </div>
    </div>
  );

  const notice = buildNotice({ available, hasStale, error, positions, oldestFetchedAt });

  if (!hasTransactions) {
    return (
      <>
        {header}
        {notice && <NoticeBar notice={notice} onRetry={() => refresh({ bypassCache: true })} />}
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconInbox /></div>
              <div className="hb-empty-title">Noch keine Transaktionen</div>
              <div className="hb-empty-text">
                Erfasse deinen ersten Kauf. Vergangene Käufe sind ausdrücklich erlaubt —
                Bestand, Einstand und Gewinn werden rückwirkend berechnet.
              </div>
              <Button onClick={() => openNewTransaction(depots[0]?.id || "", "")}>
                <IconPlus /> Transaktion erfassen
              </Button>
            </div>
          </CardContent>
        </Card>
        {dialogs}
      </>
    );
  }

  return (
    <>
      {header}
      {notice && <NoticeBar notice={notice} onRetry={() => refresh({ bypassCache: true })} />}

      <div className="hb-stat-pills" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <div className="hb-stat-pill hb-stat-pill--accent">
          <div className="hb-stat-pill-label">Depotwert</div>
          <div className="hb-stat-pill-value">
            {total.marketValue === null ? "—" : fmt(total.marketValue)}
          </div>
          <div className="hb-stat-pill-sub">
            {total.marketValue === null
              ? "keine Kurse verfügbar"
              : `${total.positionCount} Position${total.positionCount === 1 ? "" : "en"} in ${depots.length} Depot${depots.length === 1 ? "" : "s"}`}
          </div>
          {total.hasUnpriced && (
            <div className="hb-stat-pill-delta-note">
              {positions.filter((p) => p.isOpen && !p.priced).length} Positionen ohne Kurs
            </div>
          )}
        </div>

        <div className="hb-stat-pill hb-stat-pill--plan">
          <div className="hb-stat-pill-label">Eingesetzt</div>
          <div className="hb-stat-pill-value">{fmt(total.costBasis)}</div>
          <div className="hb-stat-pill-sub">inkl. {fmt(total.fees)} Gebühren</div>
        </div>

        <div className={`hb-stat-pill ${pillTone(total.unrealizedGain)}`}>
          <div className="hb-stat-pill-label">Nicht realisiert</div>
          <div className={`hb-stat-pill-value ${gainClass(total.unrealizedGain)}`}>
            {total.unrealizedGain === null
              ? "—"
              : `${total.unrealizedGain > 0 ? "+" : ""}${fmt(total.unrealizedGain)}`}
          </div>
          <div className="hb-stat-pill-sub">{formatPercent(total.unrealizedGainPct)}</div>
        </div>

        <div className={`hb-stat-pill ${pillTone(total.totalReturn)}`}>
          <div className="hb-stat-pill-label">Gesamtrendite</div>
          <div className={`hb-stat-pill-value ${gainClass(total.totalReturn)}`}>
            {total.totalReturn > 0 ? "+" : ""}
            {fmt(total.totalReturn)}
          </div>
          <div className="hb-stat-pill-sub">
            realisiert {fmt(total.realizedGain)} · Ausschüttungen {fmt(total.dividends)}
          </div>
        </div>
      </div>

      <div className="hb-stack hb-stack--lg" style={{ marginTop: 16 }}>
        {depotSummaries.length > 1 && (
          <Card>
            <CardContent>
              <h3 className="hb-card-title">Vermögensübersicht</h3>
              <div className="hb-cg-breakdown" style={{ marginTop: 14 }}>
                {depotSummaries.map((d, i) => {
                  const value = d.summary.marketValue;
                  const share =
                    value === null || !total.marketValue ? null : (value / total.marketValue) * 100;
                  const accent = GROUP_ACCENT_PALETTE[i % GROUP_ACCENT_PALETTE.length];
                  return (
                    <div key={d.depotId} className="hb-cg-breakdown-row">
                      <div className="hb-cg-breakdown-top">
                        <div className="hb-cg-breakdown-info">
                          <span className="hb-cat-dot" style={{ background: accent }} />
                          <div className="hb-cg-breakdown-names">
                            <div className="hb-cg-breakdown-name">{d.name}</div>
                            {d.note && <div className="hb-cg-breakdown-parent">{d.note}</div>}
                          </div>
                        </div>
                        <div className="hb-cg-breakdown-values">
                          <span className="hb-cg-breakdown-amount">
                            {value === null ? "—" : fmt(value)}
                          </span>
                          <span className="hb-cg-breakdown-share">
                            {share === null ? "—" : formatPercent(share, { digits: 1, sign: false })}
                          </span>
                        </div>
                      </div>
                      <div className="hb-cg-breakdown-bar">
                        <div
                          className="hb-cg-breakdown-bar-fill"
                          style={{ width: `${Math.max(0, share || 0)}%`, background: accent }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <DataTable
              columns={columns}
              sections={sections}
              storageKey="hb.investments.positions"
              defaultSort={{ columnId: "marketValue", dir: "desc" }}
              renderDetail={renderDetail}
              renderRowActions={(row) => (
                <OverflowMenu
                  buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                  label={`Aktionen für „${row.name}“`}
                  items={[
                    {
                      label: "Transaktion erfassen",
                      onClick: () => openNewTransaction(row.depotId, row.assetId),
                    },
                    {
                      label: "Kurse neu laden",
                      disabled: !available,
                      onClick: () => refresh({ bypassCache: true }),
                    },
                  ]}
                />
              )}
              label="Positionen"
              bounded={false}
            />
          </CardContent>
        </Card>
      </div>

      {dialogs}
    </>
  );
}

const TX_LABEL = { buy: "Kauf", sell: "Verkauf", dividend: "Ausschüttung" };

/** Grüner/roter Rand der KPI-Pille. `null` bleibt neutral. */
function pillTone(value) {
  if (value === null || value === undefined) return "";
  if (value > 0) return "hb-stat-pill--ok";
  if (value < 0) return "hb-stat-pill--bad";
  return "";
}

function DetailRow({ label, value, className }) {
  return (
    <div className="hb-inv-detail-row">
      <span className="hb-inv-detail-label">{label}</span>
      <span className={`hb-inv-detail-value${className ? ` ${className}` : ""}`}>{value}</span>
    </div>
  );
}

/**
 * Der eine Hinweis, der gerade gilt — in der Reihenfolge ihrer Schwere.
 * Mehrere Leisten übereinander würden sich gegenseitig entwerten.
 */
function buildNotice({ available, hasStale, error, positions, oldestFetchedAt }) {
  if (!available) {
    return {
      title: "Kurse nur in der Desktop-App",
      message:
        "Bestand, Einstand und Buchungen werden vollständig berechnet — nur die Bewertung fehlt.",
      retry: false,
    };
  }
  if (hasStale) {
    return {
      title: "Kurse veraltet",
      message: `Letzter bekannter Stand vom ${formatFetchedAt(oldestFetchedAt)} — die App war offline.`,
      retry: true,
    };
  }
  if (error) {
    return { title: "Kursabruf fehlgeschlagen", message: error, retry: true };
  }
  const failed = positions.filter((p) => p.isOpen && !p.priced).length;
  if (failed > 0) {
    return {
      title: `${failed} Position${failed === 1 ? "" : "en"} ohne Kurs`,
      message:
        "Für diese Positionen liegt kein Kurs vor. Bestand und Einstand stimmen trotzdem, " +
        "nur der aktuelle Wert fehlt.",
      retry: true,
    };
  }
  return null;
}

function NoticeBar({ notice, onRetry }) {
  return (
    <div className="hb-infobar hb-infobar--warning" role="status" style={{ marginBottom: 16 }}>
      <div className="hb-infobar-icon"><IconInfo /></div>
      <div className="hb-infobar-content">
        <div className="hb-infobar-title">{notice.title}</div>
        <div className="hb-infobar-message">{notice.message}</div>
      </div>
      {notice.retry && (
        <div className="hb-infobar-actions">
          <Button variant="outline" onClick={onRetry}>Erneut versuchen</Button>
        </div>
      )}
    </div>
  );
}
