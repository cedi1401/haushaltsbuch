import React, { useState } from "react";
import EditDialog from "../components/EditDialog.jsx";
import HbSwitch from "../components/HbSwitch.jsx";
import { IconClose, IconSun, IconMoon } from "../components/icons.jsx";
import { HbMonthPicker } from "../components/HbDatePicker.jsx";
import BookPicker from "./BookPicker.jsx";
import ManageBookDialog from "./ManageBookDialog.jsx";

export default function AppToolbar({
  books,
  activeBookId,
  onBookChange,
  title,
  onCreateBook,
  onDeleteBook,
  canDeleteBook,
  activeBookName,
  onRenameBook,
  monthFilter,
  onMonthFilterChange,
  darkMode,
  onDarkModeToggle,
  showMonthFilter,
}) {
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookName, setNewBookName] = useState("Neues Haushaltsbuch");
  const [manageBookOpen, setManageBookOpen] = useState(false);

  function handleCreateBook() {
    onCreateBook(newBookName);
    setNewBookName("Neues Haushaltsbuch");
    setNewBookOpen(false);
  }

  return (
    <>
      <div className="hb-top">
        <div className="hb-row">
          <h1 className="hb-title">{title}</h1>

          <div className="hb-group">
            <span className="hb-muted">Buch</span>
            <BookPicker
              books={books}
              activeBookId={activeBookId}
              onBookChange={onBookChange}
              onCreateBook={() => setNewBookOpen(true)}
              onManageBook={() => setManageBookOpen(true)}
            />

            {showMonthFilter && (
              <>
                <div className="hb-divider" />
                <span className="hb-muted">Monat</span>
                <div className="hb-month-filter">
                  <HbMonthPicker value={monthFilter} onChange={onMonthFilterChange} />
                  <button
                    type="button"
                    className="hb-month-filter-clear"
                    onClick={() => onMonthFilterChange("")}
                    disabled={!monthFilter}
                    aria-label="Monatsfilter zurücksetzen"
                    title="Alle Monate anzeigen"
                  >
                    <IconClose />
                  </button>
                </div>
              </>
            )}

            <div className="hb-divider" />

            {/* Sonne links, Mond rechts — beide fest in der Spur. Der Knopf
                gleitet darüber und verdeckt eines; sichtbar bleibt das Symbol
                des aktiven Themes. Im Dunkelmodus steht der Knopf daher links. */}
            <HbSwitch
              className="hb-switch--theme"
              checked={darkMode}
              onChange={onDarkModeToggle}
              label="Dunkles Design"
              trackIcons={{ off: <IconSun />, on: <IconMoon /> }}
            />
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
          <div className="hb-muted hb-field-hint">
            Du kannst mehrere Bücher führen und oben wechseln.
          </div>
        </div>
      </EditDialog>

      <ManageBookDialog
        open={manageBookOpen}
        bookName={activeBookName}
        canDelete={canDeleteBook}
        onClose={() => setManageBookOpen(false)}
        onRename={onRenameBook}
        onDelete={onDeleteBook}
      />
    </>
  );
}
