import React, { useState } from "react";
import { Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import RenameDialog from "../components/RenameDialog.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { IconMenu, IconClose, IconSettings, IconSun, IconMoon } from "../components/icons.jsx";
import { HbMonthPicker } from "../components/HbDatePicker.jsx";

const VIEW_TITLES = { book: "Dashboard", trend: "Trend", pots: "Töpfe", goals: "Sparziele", fixed: "Fixkosten", costgroups: "Kostenrechner" };

export default function AppToolbar({
  books,
  activeBookId,
  onBookChange,
  view,
  onOpenNav,
  onCreateBook,
  onDeleteBook,
  canDeleteBook,
  activeBookName,
  onRenameBook,
  monthFilter,
  onMonthFilterChange,
  darkMode,
  onDarkModeToggle,
  onOpenSettings,
  isViewWithoutMonth,
}) {
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookName, setNewBookName] = useState("Neues Haushaltsbuch");
  const [renameBookOpen, setRenameBookOpen] = useState(false);

  const title = VIEW_TITLES[view] || "Dashboard";
  const themeTooltip = darkMode ? "Zu Light Mode wechseln" : "Zu Dark Mode wechseln";

  function handleCreateBook() {
    onCreateBook(newBookName);
    setNewBookName("Neues Haushaltsbuch");
    setNewBookOpen(false);
  }

  return (
    <>
      {/* Mobile-only kompakte Toolbar (< 768px) */}
      <div className="hb-mobile-toolbar">
        <button className="hb-icon-btn" type="button" title="Menü" aria-label="Menü" onClick={onOpenNav}>
          <IconMenu />
        </button>
        <div className="hb-mobile-toolbar-title">{title}</div>
        <button
          className="hb-icon-btn"
          type="button"
          title="Einstellungen"
          onClick={onOpenSettings}
          aria-label="Einstellungen"
        >
          <IconSettings />
        </button>
      </div>

      <div className="hb-top hb-desktop-toolbar">
        <div className="hb-row">
          <div className="hb-title-row">
            <button
              className="hb-icon-btn hb-hamburger-btn"
              type="button"
              title="Menü"
              aria-label="Menü"
              onClick={onOpenNav}
            >
              <IconMenu />
            </button>
            <div>
              <h1 className="hb-title">{title}</h1>
            </div>
          </div>

          <div className="hb-group">
            <label className="hb-muted" htmlFor="hb-book-select">Buch</label>
            <select
              id="hb-book-select"
              className="hb-input"
              value={activeBookId}
              onChange={(e) => onBookChange(e.target.value)}
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {view === "book" && (
              <Button variant="outline" onClick={() => setNewBookOpen(true)}>Neues Buch</Button>
            )}

            <OverflowMenu
              label="Buchaktionen"
              items={[
                { label: "Umbenennen", onClick: () => setRenameBookOpen(true) },
                { label: "Löschen", onClick: onDeleteBook, disabled: !canDeleteBook, danger: true },
              ]}
            />

            <div className="hb-divider" />

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label className="hb-muted" htmlFor="hb-month-input">Monat</label>
              {isViewWithoutMonth ? <span className="hb-badge">nur Buch</span> : null}
            </div>
            <div className="hb-month-filter">
              <HbMonthPicker
                value={monthFilter}
                onChange={onMonthFilterChange}
                disabled={isViewWithoutMonth}
              />
              <button
                type="button"
                className="hb-month-filter-clear"
                onClick={() => onMonthFilterChange("")}
                disabled={isViewWithoutMonth || !monthFilter}
                aria-label="Monatsfilter zurücksetzen"
                title="Alle Monate anzeigen"
              >
                <IconClose />
              </button>
            </div>

            <button
              className="hb-icon-btn hb-gear-btn"
              type="button"
              title={themeTooltip}
              onClick={onDarkModeToggle}
              aria-label={themeTooltip}
            >
              {darkMode ? <IconSun /> : <IconMoon />}
            </button>

            <button
              className="hb-icon-btn hb-gear-btn"
              type="button"
              title="Einstellungen"
              onClick={onOpenSettings}
              aria-label="Einstellungen"
            >
              <IconSettings />
            </button>
          </div>
        </div>
      </div>

      <EditDialog
        open={newBookOpen}
        title="Neues Haushaltsbuch"
        onClose={() => setNewBookOpen(false)}
        onSave={handleCreateBook}
        canSave={Boolean(newBookName.trim())}
        saveLabel="Erstellen"
      >
        <div className="hb-field">
          <div className="hb-label">Name</div>
          <input
            className="hb-input"
            value={newBookName}
            onChange={(e) => setNewBookName(e.target.value)}
            placeholder="z.B. 2026, WG, Urlaub, ..."
          />
          <div className="hb-muted" style={{ marginTop: 8 }}>
            Du kannst mehrere Bücher führen und oben wechseln.
          </div>
        </div>
      </EditDialog>

      <RenameDialog
        open={renameBookOpen}
        title="Buch umbenennen"
        label="Neuer Name"
        initialValue={activeBookName}
        onClose={() => setRenameBookOpen(false)}
        onSave={(name) => {
          onRenameBook(name);
          setRenameBookOpen(false);
        }}
      />
    </>
  );
}
