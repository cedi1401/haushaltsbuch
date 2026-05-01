import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { generateRecurringId } from "../utils/recurringUtils.js";
import { getCategoryLabel, DEFAULT_EXPENSE_CATEGORIES } from "../utils/hbUtils.js";

export default function FixedCostsView({
  activeBook,
  entries,
  toCHF,
  baseCurrency = "CHF",
  onUpdateBook,
  onAddEntry,
  todayISO,
}) {
  const recurringExpenses = activeBook?.recurringExpenses || [];
  const pots = activeBook?.pots || [];
  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const incomeCategories = activeBook?.incomeCategories || [];
  const transferCategories = activeBook?.transferCategories || [];

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
  });

  // Feedback nach "Jetzt buchen"
  const [bookedName, setBookedName] = useState(null);

  useEffect(() => {
    if (!bookedName) return;
    const timer = setTimeout(() => setBookedName(null), 3000);
    return () => clearTimeout(timer);
  }, [bookedName]);

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
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingItem(null);
  }

  function saveItem() {
    if (!activeBook) return;

    const numericAmount = parseFloat(draft.amount.replace(",", "."));
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
            }
          : item
      );

      onUpdateBook({ ...activeBook, recurringExpenses: updatedItems });
    } else {
      // Create new item
      const newItem = {
        id: generateRecurringId(),
        name: draft.name.trim(),
        amount: numericAmount,
        kind: draft.kind,
        active: true,
      };

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

  function deleteItem(item) {
    if (!activeBook) return;

    const msg = `Fixkosten "${item.name}" wirklich loschen?`;
    if (!window.confirm(msg)) return;

    const updatedItems = recurringExpenses.filter((i) => i.id !== item.id);
    onUpdateBook({ ...activeBook, recurringExpenses: updatedItems });
  }

  function bookNow(item) {
    const today = todayISO();

    const entry = {
      id: Date.now(),
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
    setBookedName(item.name);
  }

  const canSave = useMemo(() => {
    if (!draft.name.trim()) return false;
    const n = parseFloat(draft.amount.replace(",", "."));
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
      {bookedName && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "var(--green)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14,
            boxShadow: "var(--shadow-lg)",
            animation: "slideUp 0.2s ease-out",
          }}
        >
          &laquo;{bookedName}&raquo; wurde gebucht
        </div>
      )}

      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Fixkosten</h2>
          <div className="hb-muted">
            Monatliche Summe: <strong>{toCHF(totalActiveAmount)}</strong>
          </div>
        </div>

        <Button onClick={openCreateDialog}>+ Neue Fixkosten</Button>
      </div>

      {activeItems.length === 0 && inactiveItems.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-muted" style={{ textAlign: "center", padding: "20px 0" }}>
              Noch keine Fixkosten definiert. Erstelle deine ersten Fixkosten, um wiederkehrende
              Ausgaben zu verwalten.
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
                          Loschen
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
                            Loschen
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
              <option value="transfer">Transfer/Rucklage</option>
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
        </div>
      </EditDialog>
    </div>
  );
}
