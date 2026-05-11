import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { generateId } from "../utils/idUtils.js";
import { getCategoryLabel, DEFAULT_EXPENSE_CATEGORIES, parseAmount } from "../utils/hbUtils.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { IconFixed, IconPlus } from "../components/icons.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";

export default function FixedCostsView({
  activeBook,
  entries,
  baseCurrency = "CHF",
  onUpdateBook,
  onAddEntry,
  todayISO,
}) {
  const toCHF = useFmt();
  const recurringExpenses = activeBook?.recurringExpenses || [];
  const pots = activeBook?.pots || [];
  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const incomeCategories = activeBook?.incomeCategories || [];
  const transferCategories = activeBook?.transferCategories || [];
  const { confirm } = useConfirm();
  const toast = useToast();

  // Dialog-State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [draft, setDraft] = useState({
    name: "",
    amount: "",
    kind: "expense",
    categoryId: "cat_unkategorisiert",
    subcategoryId: null,
    transferCategory: transferCategories[0] || "Steuern",
    potId: pots[0]?.id || "",
    active: true,
    showInOverview: true,
  });

  // Aktive und inaktive Fixkosten trennen
  const activeItems = recurringExpenses.filter((item) => item.active);
  const inactiveItems = recurringExpenses.filter((item) => !item.active);

  // Gesamtsumme der aktiven Fixkosten
  const totalActiveAmount = useMemo(() => {
    return activeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [activeItems]);

  function openCreateDialog() {
    setEditingItem(null);
    setDraft({
      name: "",
      amount: "",
      kind: "expense",
      categoryId: "cat_unkategorisiert",
      subcategoryId: null,
      transferCategory: transferCategories[0] || "Steuern",
      showInOverview: false,
      potId: pots[0]?.id || "",
      active: true,
    });
    setDialogOpen(true);
  }

  function openEditDialog(item) {
    setEditingItem(item);
    setDraft({
      name: item.name || "",
      amount: String(item.amount || ""),
      kind: item.kind || "expense",
      categoryId: item.categoryId || "cat_unkategorisiert",
      subcategoryId: item.subcategoryId || null,
      transferCategory: item.transferCategory || transferCategories[0] || "Steuern",
      potId: item.potId || pots[0]?.id || "",
      active: item.active !== false,
      showInOverview: item.showInOverview !== false,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingItem(null);
  }

  function saveItem() {
    if (!activeBook) return;

    const numericAmount = parseAmount(draft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (!draft.name.trim()) return;

    if (editingItem) {
      // Update existing item
      const updatedItems = recurringExpenses.map((item) =>
        item.id === editingItem.id
          ? {
              ...item,
              name: draft.name.trim(),
              amount: numericAmount,
              kind: draft.kind,
              categoryId: draft.kind === "expense" ? draft.categoryId : undefined,
              subcategoryId: draft.kind === "expense" ? (draft.subcategoryId || null) : undefined,
              transferCategory: draft.kind === "transfer" ? draft.transferCategory : undefined,
              potId: draft.kind === "transfer" ? draft.potId : undefined,
              active: draft.active,
              showInOverview: draft.showInOverview === true,
            }
          : item
      );

      onUpdateBook({ ...activeBook, recurringExpenses: updatedItems });
    } else {
      // Create new item
      const newItem = {
        id: generateId("rec"),
        name: draft.name.trim(),
        amount: numericAmount,
        kind: draft.kind,
        active: true,
      };

      newItem.showInOverview = draft.showInOverview === true;

      if (draft.kind === "expense") {
        newItem.categoryId = draft.categoryId;
        newItem.subcategoryId = draft.subcategoryId || null;
      } else if (draft.kind === "transfer") {
        newItem.transferCategory = draft.transferCategory;
        newItem.potId = draft.potId;
      }

      onUpdateBook({
        ...activeBook,
        recurringExpenses: [...recurringExpenses, newItem],
      });
    }

    closeDialog();
  }

  function toggleActive(item) {
    if (!activeBook) return;

    const updatedItems = recurringExpenses.map((i) =>
      i.id === item.id ? { ...i, active: !i.active } : i
    );

    onUpdateBook({ ...activeBook, recurringExpenses: updatedItems });
  }

  async function deleteItem(item) {
    if (!activeBook) return;

    const ok = await confirm({
      title: "Fixkosten löschen",
      message: `Fixkosten „${item.name}“ wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;

    const updatedItems = recurringExpenses.filter((i) => i.id !== item.id);
    onUpdateBook({ ...activeBook, recurringExpenses: updatedItems });
    toast.success("Fixkosten gelöscht.");
  }

  function bookNow(item) {
    const today = todayISO();

    const entry = {
      id: generateId("entry"),
      date: today,
      amount: item.amount,
      category: item.kind === "transfer" ? item.transferCategory : undefined,
      categoryId: item.kind === "expense" ? (item.categoryId || null) : null,
      subcategoryId: item.kind === "expense" ? (item.subcategoryId || null) : null,
      kind: item.kind,
      note: item.name,
    };

    if (item.kind === "transfer") {
      entry.potId = item.potId;
    }

    if (item.kind === "expense") {
      entry.source = "month";
    }

    onAddEntry(entry);
    toast.success(`„${item.name}“ wurde gebucht.`);
  }

  const canSave = useMemo(() => {
    if (!draft.name.trim()) return false;
    const n = parseAmount(draft.amount);
    if (!Number.isFinite(n) || n <= 0) return false;
    return true;
  }, [draft]);

  function getCategoryDisplay(item) {
    if (item.kind === "expense") {
      // Neues Format: categoryId vorhanden
      if (item.categoryId) {
        return getCategoryLabel(expenseCategories, incomeCategories, item.categoryId, item.subcategoryId);
      }
      // Legacy-Fallback: altes category-String-Feld
      return item.category || "Unkategorisiert";
    } else if (item.kind === "transfer") {
      const potName = pots.find((p) => p.id === item.potId)?.name || item.potId;
      return `${item.transferCategory || "Transfer"} → ${potName}`;
    }
    return "";
  }

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Fixkosten</h2>
          <div className="hb-muted">
            Monatliche Summe: <strong>{toCHF(totalActiveAmount)}</strong>
          </div>
        </div>

        <Button onClick={openCreateDialog}><IconPlus /> Neue Fixkosten</Button>
      </div>

      {activeItems.length === 0 && inactiveItems.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconFixed /></div>
              <div className="hb-empty-title">Noch keine Fixkosten</div>
              <div className="hb-empty-text">
                Erfasse wiederkehrende Ausgaben wie Miete, Abos oder Versicherungen,
                um sie monatlich mit einem Klick zu buchen.
              </div>
              <Button onClick={openCreateDialog}>
                <IconPlus /> Neue Fixkosten
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Aktive Fixkosten */}
          {activeItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {activeItems.map((item) => (
                <Card key={item.id}>
                  <CardContent>
                    <div className="hb-fixed-card">
                      <div className="hb-fixed-header">
                        <div>
                          <h3 className="hb-fixed-name">{item.name}</h3>
                          <div className="hb-fixed-meta">
                            <span>{item.kind === "expense" ? "Ausgabe" : "Transfer"}</span>
                            <span>{getCategoryDisplay(item)}</span>
                          </div>
                        </div>
                        <div className="hb-fixed-amount hb-bad">-{toCHF(item.amount)}</div>
                      </div>

                      <div className="hb-fixed-actions">
                        <Button onClick={() => bookNow(item)}>Jetzt buchen</Button>
                        <Button variant="outline" onClick={() => openEditDialog(item)}>
                          Bearbeiten
                        </Button>
                        <Button variant="outline" onClick={() => toggleActive(item)}>
                          Deaktivieren
                        </Button>
                        <Button variant="outline" onClick={() => deleteItem(item)}>
                          Löschen
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Inaktive Fixkosten */}
          {inactiveItems.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "var(--muted)" }}>
                Inaktive Fixkosten
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {inactiveItems.map((item) => (
                  <Card key={item.id} className="hb-fixed-inactive">
                    <CardContent>
                      <div className="hb-fixed-card">
                        <div className="hb-fixed-header">
                          <div>
                            <h3 className="hb-fixed-name">{item.name}</h3>
                            <div className="hb-fixed-meta">
                              <span>{item.kind === "expense" ? "Ausgabe" : "Transfer"}</span>
                              <span>{getCategoryDisplay(item)}</span>
                            </div>
                          </div>
                          <div className="hb-fixed-amount" style={{ opacity: 0.5 }}>
                            -{toCHF(item.amount)}
                          </div>
                        </div>

                        <div className="hb-fixed-actions">
                          <Button variant="outline" onClick={() => toggleActive(item)}>
                            Aktivieren
                          </Button>
                          <Button variant="outline" onClick={() => openEditDialog(item)}>
                            Bearbeiten
                          </Button>
                          <Button variant="outline" onClick={() => deleteItem(item)}>
                            Löschen
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialog: Fixkosten erstellen/bearbeiten */}
      <EditDialog
        open={dialogOpen}
        title={editingItem ? "Fixkosten bearbeiten" : "Neue Fixkosten"}
        onClose={closeDialog}
        onSave={saveItem}
        canSave={canSave}
        saveLabel={editingItem ? "Speichern" : "Erstellen"}
        size="medium"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          {/* Name + Betrag nebeneinander */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, width: "100%" }}>
            <div className="hb-field">
              <div className="hb-label">Name</div>
              <input
                className="hb-input"
                style={{ width: "100%", minWidth: 0 }}
                type="text"
                placeholder="z.B. Spotify, Miete, Versicherung"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="hb-field">
              <div className="hb-label">Betrag ({baseCurrency})</div>
              <input
                className="hb-input"
                style={{ width: "100%", minWidth: 0 }}
                type="text"
                inputMode="decimal"
                placeholder="z.B. 12.90"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>
          </div>

          {/* Art Dropdown — linksbündig */}
          <div className="hb-field" style={{ alignSelf: "flex-start", maxWidth: 220 }}>
            <div className="hb-label">Art</div>
            <select
              className="hb-input"
              style={{ width: "100%", minWidth: 0 }}
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
            >
              <option value="expense">Ausgabe</option>
              <option value="transfer">Transfer/Rücklage</option>
            </select>
          </div>

          {/* Kategorie-Auswahl: HierarchicalCategoryPicker statt Dropdown */}
          {draft.kind === "expense" && (
            <HierarchicalCategoryPicker
              label="Kategorie"
              value={{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId }}
              categories={expenseCategories}
              onChange={({ categoryId, subcategoryId }) =>
                setDraft((d) => ({ ...d, categoryId, subcategoryId }))
              }
            />
          )}

          {draft.kind === "transfer" && (
            <>
              <div className="hb-field">
                <div className="hb-label">Transfer-Zweck</div>
                <select
                  className="hb-input"
                  value={draft.transferCategory}
                  onChange={(e) => setDraft((d) => ({ ...d, transferCategory: e.target.value }))}
                >
                  {transferCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hb-field">
                <div className="hb-label">In Topf</div>
                <select
                  className="hb-input"
                  value={draft.potId}
                  onChange={(e) => setDraft((d) => ({ ...d, potId: e.target.value }))}
                >
                  {pots.map((pot) => (
                    <option key={pot.id} value={pot.id}>
                      {pot.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {editingItem && (
            <div className="hb-field">
              <div className="hb-label">Status</div>
              <select
                className="hb-input"
                value={draft.active ? "active" : "inactive"}
                onChange={(e) => setDraft((d) => ({ ...d, active: e.target.value === "active" }))}
              >
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </select>
            </div>
          )}

          <label className="hb-fct-annual-toggle">
            <input
              type="checkbox"
              checked={draft.showInOverview}
              onChange={(e) => setDraft((d) => ({ ...d, showInOverview: e.target.checked }))}
              style={{ accentColor: "var(--accent)" }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>In Übersicht anzeigen</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Position in der Fixkosten-Übersicht im Trendview anzeigen (inkl. Jahresbetrag)
              </div>
            </div>
          </label>
        </div>
      </EditDialog>
    </div>
  );
}
