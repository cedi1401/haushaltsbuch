import React, { useCallback, useMemo, useState } from "react";
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
import { formatDateDE, formatPercent, formatSigned } from "../utils/hbUtils.js";
import {
  emptyInvestments,
  GRAMS_PER_TROY_OUNCE,
  TRANSACTION_TYPE_LABELS,
} from "../utils/investmentModel.js";
import {
  calcAllocationByAssetClass,
  calcAllocationByDepot,
  calcDepotSummaries,
  calcPositions,
  listTransactions,
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
  formatQuantity,
  gainClass,
} from "../utils/investmentFormat.js";
import { useInvestmentQuotes } from "../hooks/useInvestmentQuotes.js";
import { useSnapshotRecorder } from "../hooks/useSnapshotRecorder.js";
import AllocationCard from "./investments/AllocationCard.jsx";
import DepotOverviewCard from "./investments/DepotOverviewCard.jsx";
import DepotsManager from "./investments/DepotsManager.jsx";
import InvestmentTransactionDialog from "./investments/InvestmentTransactionDialog.jsx";
import ReturnsCard from "./investments/ReturnsCard.jsx";
import TransactionsCard from "./investments/TransactionsCard.jsx";
import ValueHistoryCard from "./investments/ValueHistoryCard.jsx";
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

  // Die Depotfarbe hängt am Depot, nicht an seinem Rang in irgendeiner Liste.
  // Sektionsbänder, Donut, Legende und die Depot-Spalte der Transaktionen
  // ziehen alle aus dieser einen Zuordnung — sonst wäre dasselbe Depot in der
  // Tabelle beere und im Donut olivgrün und wechselte die Farbe, sobald eine
  // Kursbewegung die Rangfolge dreht.
  const depotAccent = useMemo(
    () =>
      new Map(
        depotSummaries.map((d, i) => [d.depotId, GROUP_ACCENT_PALETTE[i % GROUP_ACCENT_PALETTE.length]])
      ),
    [depotSummaries]
  );

  const depotNames = useMemo(
    () => new Map((investments.depots || []).map((d) => [d.id, d.name])),
    [investments.depots]
  );

  const byClass = useMemo(() => calcAllocationByAssetClass(positions), [positions]);
  const byDepot = useMemo(() => calcAllocationByDepot(positions), [positions]);
  const unpricedCount = useMemo(
    () => positions.filter((p) => p.isOpen && !p.priced).length,
    [positions]
  );
  // Ein Donut mit einem einzigen Segment sagt nichts, was der Depotwert nicht
  // schon sagt.
  const showAllocation = byClass.length > 1;

  const txRows = useMemo(() => listTransactions(investments), [investments]);

  const columns = useMemo(() => buildPositionColumns({ fmt, baseCurrency }), [fmt, baseCurrency]);

  // Die Tabelle braucht je Zeile eine `id`; `share` lässt sich nur mit dem
  // Gesamtwert berechnen und gehört deshalb hierher, nicht in den Spaltensatz.
  const sections = useMemo(() => {
    const totalValue = total.marketValue || 0;
    return depotSummaries.map((d) => ({
      key: d.depotId,
      label: d.name,
      accent: depotAccent.get(d.depotId),
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
              {formatSigned(fmt, d.summary.unrealizedGain)}
            </span>
          )}
          {d.positions.length === 0 && <span className="hb-muted">noch leer</span>}
        </>
      ),
    }));
  }, [depotSummaries, total.marketValue, fmt, depotAccent]);

  // --- Schreiben ins Buch -------------------------------------------------

  // useCallback, weil der Snapshot-Schreiber die Funktion als Effect-Abhängigkeit
  // führt: eine bei jedem Rendern neue Identität ließe seinen Effect bei jedem
  // Rendern laufen.
  const applyInvestments = useCallback(
    (next) => {
      onUpdateBook?.({ ...activeBook, investments: next });
    },
    [activeBook, onUpdateBook]
  );

  // Tages-Snapshot für die Verlaufskurve (Beschluss F). Läuft erst, wenn der
  // Abruf durch ist — während `loading` wären noch nicht alle Kurse da und
  // buildSnapshot verweigerte den Tag ohnehin.
  useSnapshotRecorder({
    investments,
    depotSummaries,
    baseCurrency,
    enabled: !loading && positions.length > 0,
    onChange: applyInvestments,
  });

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

  // Aufbau wie der Detailbereich der Rückstellungen (.hb-res-detail): links die
  // Kennzahlen als Kacheln, rechts die Buchungen, unten die Aktionsleiste.
  function renderDetail(row) {
    const txs = transactionsForPosition(investments, row.depotId, row.assetId);
    return (
      <div className="hb-res-detail">
        <div className="hb-res-facts">
          <DetailFact label="Eingesetzt" value={fmt(row.invested)} />
          <DetailFact label="Kostenbasis (Bestand)" value={fmt(row.costBasis)} />
          <DetailFact label="Gebühren" value={fmt(row.fees)} />
          <DetailFact
            label="Realisiert"
            value={formatSigned(fmt, row.realizedGain)}
            className={gainClass(row.realizedGain)}
          />
          <DetailFact label="Ausschüttungen" value={fmt(row.dividends)} />
          <DetailFact
            label="Gesamtrendite"
            value={formatSigned(fmt, row.totalReturn)}
            className={gainClass(row.totalReturn)}
          />
          <DetailFact
            label="Gesamtrendite %"
            value={formatPercent(row.totalReturnPct)}
            className={gainClass(row.totalReturnPct)}
          />
          <DetailFact label="Symbol" value={row.quoteSymbol} />
          <DetailFact label="Handelswährung" value={row.quoteCurrency} />
          <DetailFact label="Kurs vom" value={formatFetchedAt(row.fetchedAt)} />
          {row.kind === "metal" && (
            <DetailFact
              label="Bestand in Gramm"
              value={formatQuantity(row.quantity * GRAMS_PER_TROY_OUNCE, "g")}
            />
          )}
        </div>

        <div className="hb-res-side">
          <section className="hb-res-note hb-res-note--plain">
            <h4 className="hb-res-note-title">
              {row.transactionCount} Buchung{row.transactionCount === 1 ? "" : "en"}
              <span className="hb-inv-sub">
                {" "}· {formatDateDE(row.firstDate)} bis {formatDateDE(row.lastDate)}
              </span>
            </h4>
            {txs.length > 0 && (
              <div className="hb-inv-detail-txs">
                {txs.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="hb-inv-detail-tx">
                    <span className="hb-muted">{formatDateDE(tx.date)}</span>
                    <span>{TRANSACTION_TYPE_LABELS[tx.type]}</span>
                    <span>
                      {tx.type === "dividend"
                        ? fmt(tx.price * tx.fxRate)
                        : `${formatQuantity(tx.quantity, tx.unit, tx.assetClass)} × ${tx.price} ${tx.currency}`}
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
                  <div className="hb-inv-detail-more">… und {txs.length - 5} weitere</div>
                )}
              </div>
            )}
            <p className="hb-res-note-hint">
              Käufe werden mit dem Wechselkurs vom Kauftag gerechnet, nicht mit dem heutigen.
            </p>
          </section>

          {row.quoteError && (
            <section className="hb-res-note hb-res-note--tone hb-inv-note--error">
              <h4 className="hb-res-note-title">Kursfehler</h4>
              <p className="hb-res-note-text">{row.quoteError}</p>
            </section>
          )}
        </div>

        <div className="hb-res-detail-actions">
          <Button size="sm" variant="outline" onClick={() => openNewTransaction(row.depotId, row.assetId)}>
            <IconPlus /> Transaktion erfassen
          </Button>
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

  // Kursstand und Depotverwaltung stehen dort, wo sie etwas einschränken bzw.
  // bearbeiten: im Kopf der Depotwert-Karte und in der Vermögensübersicht.
  const header = (
    <div className="hb-view-actions">
      <Button
        variant="outline"
        onClick={() => refresh({ bypassCache: true })}
        disabled={loading || !available}
        title={available ? undefined : "Kurse gibt es nur in der Desktop-App."}
      >
        <IconRefresh /> {loading ? "Wird aktualisiert …" : "Kurse aktualisieren"}
      </Button>
      <Button onClick={() => openNewTransaction(depots[0]?.id || "", "")}>
        <IconPlus /> Transaktion erfassen
      </Button>
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
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <Button onClick={() => openNewTransaction(depots[0]?.id || "", "")}>
                  <IconPlus /> Transaktion erfassen
                </Button>
                {/* Die Depotverwaltung wohnt sonst in der Vermögensübersicht,
                    die es ohne Buchungen noch nicht gibt. */}
                <Button variant="outline" onClick={() => setDepotsOpen(true)}>
                  <IconWallet /> Depots verwalten
                </Button>
              </div>
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

      {/* Oben der Depotwert, darunter Vermögensübersicht und Rendite, rechts
          die Aufteilung als Seitenspalte — die Kennzahlen sitzen in den Karten
          statt als Pillen über dem View. Die Platzierung läuft über grid-area
          (.hb-inv-cell--*); ohne Aufteilung (nur eine Klasse) rücken
          Vermögensübersicht und Rendite in die Seitenspalte. */}
      <div className={`hb-inv-grid${showAllocation ? "" : " hb-inv-grid--no-alloc"}`}>
        <ValueHistoryCard
          total={total}
          depotCount={depots.length}
          snapshots={investments.snapshots || []}
          depotNames={depotNames}
          unpricedCount={unpricedCount}
          oldestFetchedAt={oldestFetchedAt}
          hasStale={hasStale}
          fmt={fmt}
          baseCurrency={baseCurrency}
        />
        <DepotOverviewCard
          depotSummaries={depotSummaries}
          byDepot={byDepot}
          depotAccent={depotAccent}
          total={total}
          onManageDepots={() => setDepotsOpen(true)}
          fmt={fmt}
        />
        {showAllocation && (
          <AllocationCard byClass={byClass} unpricedCount={unpricedCount} fmt={fmt} />
        )}
        <ReturnsCard total={total} fmt={fmt} />
      </div>

      <div className="hb-stack hb-stack--lg" style={{ marginTop: 20 }}>
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
                      label: "Kurse neu laden",
                      disabled: !available,
                      onClick: () => refresh({ bypassCache: true }),
                    },
                  ]}
                />
              )}
              label="Positionen"
              toolbar={<h3 className="hb-card-title">Positionen</h3>}
              bounded={false}
            />
          </CardContent>
        </Card>

        <TransactionsCard
          transactions={txRows}
          depotAccent={depotAccent}
          onEdit={openEditTransaction}
          onDelete={deleteTransaction}
          onAdd={() => openNewTransaction(depots[0]?.id || "", "")}
          fmt={fmt}
          baseCurrency={baseCurrency}
        />
      </div>

      {dialogs}
    </>
  );
}

// Kachel im Detailbereich; `className` färbt nur den Wert (Gewinn/Verlust).
// Ohne Wert verliert die Kachel ihre Fläche, wie bei den Rückstellungen.
function DetailFact({ label, value, className }) {
  const empty = value === null || value === undefined || value === "" || value === "—";
  return (
    <div className={"hb-res-fact" + (empty ? " hb-res-fact--empty" : "")}>
      <span className="hb-res-fact-label">{label}</span>
      <span className="hb-res-fact-value">
        {className ? <span className={className}>{value}</span> : value}
      </span>
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
        "nur der aktuelle Wert fehlt. Solange ein Kurs fehlt, wird auch kein Punkt in den " +
        "Verlauf geschrieben.",
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
