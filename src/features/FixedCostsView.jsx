import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { generateRecurringId } from "../utils/recurringUtils.js";
import { getCategoryNames } from "../utils/hbUtils.js";

export default function FixedCostsView({
  activeBook,
  entries,
  toCHF,
  onUpdateBook,
  onAddEntry,
  todayISO,
}) {
  const recurringExpenses = activeBook?.recurringExpenses || [];
  const pots = activeBook?.pots || [];
  const categories = activeBook?.categories || [];
  const categoryNames = useMemo(() => getCategoryNames(categories), [categories]);
  const transferCategories = activeBook?.transferCategories || [];

  // Dialog-State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [draft, setDraft] = useState({
    name: "",
    amount: "",
    kind: "expense",
    category: categoryNames[0] || "Allgemein",
    transferCategory: transferCategories[0] || "Steuern",
    potId: pots[0]?.id || "reserve",
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
      category: categoryNames[0] || "Allgemein",
      transferCategory: transferCategories[0] || "Steuern",
      potId: pots[0]?.id || "reserve",
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
      category: item.category || categoryNames[0] || "Allgemein",
      transferCategory: item.transferCategory || transferCategories[0] || "Steuern",
      potId: item.potId || pots[0]?.id || "reserve",
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
              category: draft.kind === "expense" ? draft.category : undefined,
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
        newItem.category = draft.category;
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
      category: item.kind === "expense" ? item.category : item.transferCategory,
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
      return item.category || "Allgemein";
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
            padding: "12px 24px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            boxShadow: "var(--shadow-md)",
            animation: "slideUp 0.25s ease-out",
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
      >
        <div className="hb-form" style={{ flexDirection: "column", gap: 14 }}>
          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Spotify, Miete, Versicherung"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Betrag (CHF)</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 12.90"
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Art</div>
            <select
              className="hb-input"
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
            >
              <option value="expense">Ausgabe</option>
              <option value="transfer">Transfer/Rucklage</option>
            </select>
          </div>

          {draft.kind === "expense" && (
            <div className="hb-field">
              <div className="hb-label">Kategorie</div>
              <select
                className="hb-input"
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              >
                {categoryNames.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
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
