// Pfeiltasten-Navigation in Flyout-Menüs (OverflowMenu, BookPicker).
// Erfasst menuitem, menuitemradio und menuitemcheckbox.
const ITEM_SELECTOR = "[role^='menuitem']:not(:disabled)";

export function focusFirstMenuItem(menuEl) {
  menuEl?.querySelector(ITEM_SELECTOR)?.focus();
}

export function handleMenuKeyDown(e, menuEl) {
  const focusable = Array.from(menuEl?.querySelectorAll(ITEM_SELECTOR) ?? []);
  if (!focusable.length) return;
  const idx = focusable.indexOf(document.activeElement);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusable[(idx + 1) % focusable.length]?.focus();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusable[(idx - 1 + focusable.length) % focusable.length]?.focus();
  } else if (e.key === "Home") {
    e.preventDefault();
    focusable[0]?.focus();
  } else if (e.key === "End") {
    e.preventDefault();
    focusable[focusable.length - 1]?.focus();
  }
}
