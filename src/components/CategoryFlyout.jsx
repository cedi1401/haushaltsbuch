import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HierarchicalCategoryPicker } from "./HierarchicalCategoryPicker.jsx";
import { IconChevron } from "./icons.jsx";
import { CHART_COLORS } from "../utils/hbPalette.js";
import { EMPTY_ARRAY } from "../utils/constants.js";

// Platzbedarf des Flyouts: Filterfeld + Liste (.hb-hcat-box, max. 280 px) +
// Fußzeile. Reicht der Platz unter dem Feld nicht, klappt es nach oben auf.
const FLYOUT_HEIGHT = 380;
// Rund 50 % breiter als das Feld selbst, damit lange Namen ganz lesbar sind.
const FLYOUT_MIN_WIDTH = 480;
const GAP = 4;
const EDGE = 8;

function categoryName(categories, categoryId, subcategoryId) {
  const cat = (categories || []).find((c) => c.id === categoryId);
  if (!cat) return { cat: null, name: "" };
  const sub = subcategoryId ? (cat.subcategories || []).find((s) => s.id === subcategoryId) : null;
  return { cat, name: sub ? `${cat.name} › ${sub.name}` : cat.name };
}

function isRadio(el) {
  return el instanceof HTMLInputElement && el.type === "radio";
}

/**
 * Kompakte Kategorieauswahl für Tabellenzeilen: ein Feld im Stil von
 * `select.hb-input`, das den bekannten HierarchicalCategoryPicker als Flyout
 * öffnet. Das Flyout liegt per Portal über allem, damit es weder vom
 * scrollenden Dialog-Body abgeschnitten wird noch ihn verlängert.
 *
 * Übernommen wird per Klick, Leertaste oder Enter. Pfeiltasten bewegen nur den
 * Fokus durch die Liste — sonst würde schon der erste Pfeil auswählen und das
 * Flyout schließen (Radiogruppen melden jeden Pfeil als Änderung).
 *
 * Props: value { categoryId, subcategoryId }, categories, onChange,
 * recent (siehe HierarchicalCategoryPicker), ariaLabel.
 */
export default function CategoryFlyout({ value, categories, onChange, recent = EMPTY_ARRAY, ariaLabel = "Kategorie" }) {
  const { categoryId = null, subcategoryId = null } = value || {};
  const flyoutId = useId();
  const triggerRef = useRef(null);
  const flyoutRef = useRef(null);
  const arrowNavRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const { cat, name } = categoryName(categories, categoryId, subcategoryId);

  function close({ focusTrigger = false } = {}) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  // Lage am Feld ausrichten — beim Öffnen und solange der Dialog scrollt.
  // Die Höhe wird auf den freien Platz begrenzt (kleine Fenster).
  useLayoutEffect(() => {
    if (!open) return undefined;
    function place(e) {
      if (e?.type === "scroll" && flyoutRef.current?.contains(e.target)) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width * 1.5, FLYOUT_MIN_WIDTH), window.innerWidth - 2 * EDGE);
      const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - width - EDGE);
      const below = window.innerHeight - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      const up = below < FLYOUT_HEIGHT && above > below;
      setPosition(
        up
          ? { left, width, maxHeight: above, bottom: window.innerHeight - rect.top + GAP }
          : { left, width, maxHeight: below, top: rect.bottom + GAP }
      );
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Ohne Filterfeld (wenige Kategorien) den Fokus auf die gewählte bzw. erste
  // Kategorie setzen, damit die Tastatur sofort im Flyout ist.
  const placed = position != null;
  useEffect(() => {
    if (!open || !placed) return;
    const flyout = flyoutRef.current;
    if (!flyout || flyout.contains(document.activeElement)) return;
    const target =
      flyout.querySelector("input.hb-hcat-radio:checked") || flyout.querySelector("input.hb-hcat-radio");
    target?.focus();
  }, [open, placed]);

  // Klick daneben schließt; Escape schließt nur das Flyout, nicht den Dialog
  // (der lauscht auf window, hier wird vorher auf document abgefangen).
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (flyoutRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(next) {
    // Per Pfeiltaste erreicht: nur Fokus, noch keine Auswahl.
    if (arrowNavRef.current) return;
    onChange(next);
    close({ focusTrigger: true });
  }

  function handleKeyDownCapture(e) {
    arrowNavRef.current = e.key.startsWith("Arrow");
    // Enter übernimmt die fokussierte Kategorie wie ein Klick.
    if (e.key === "Enter" && isRadio(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      e.target.click();
    }
  }

  function handleClick(e) {
    // Klick auf die schon gewählte Kategorie meldet keine Änderung — trotzdem schließen.
    if (isRadio(e.target) && e.target.checked && !arrowNavRef.current) close({ focusTrigger: true });
  }

  function handleBlur(e) {
    // Fokus verlässt Flyout und Feld (z.B. per Tab) → schließen.
    const next = e.relatedTarget;
    if (!next) return;
    if (flyoutRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`hb-input hb-catflyout-trigger${open ? " hb-catflyout-trigger--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? flyoutId : undefined}
        aria-label={`${ariaLabel}: ${name || "Ohne Kategorie"}`}
        title={name || undefined}
      >
        {/* Ohne Kategorie kein Platzhalter-Punkt: der Text steht dann bündig wie in den übrigen Feldern. */}
        {cat && (
          <span
            className="hb-cat-dot"
            style={{ background: cat.color || CHART_COLORS.transfer }}
            aria-hidden="true"
          />
        )}
        <span className={`hb-catflyout-value${cat ? "" : " hb-catflyout-value--empty"}`}>
          {name || "Ohne Kategorie"}
        </span>
        <IconChevron className="hb-catflyout-chevron" aria-hidden="true" />
      </button>

      {open && position &&
        createPortal(
          <div
            ref={flyoutRef}
            id={flyoutId}
            className={`hb-catflyout${position.bottom != null ? " hb-catflyout--up" : ""}`}
            style={position}
            role="dialog"
            aria-label={ariaLabel}
            onKeyDownCapture={handleKeyDownCapture}
            onPointerDownCapture={() => { arrowNavRef.current = false; }}
            onClick={handleClick}
            onBlur={handleBlur}
          >
            <HierarchicalCategoryPicker
              value={{ categoryId, subcategoryId }}
              categories={categories}
              onChange={select}
              recent={recent}
              autoFocusFilter
            />
            {cat && (
              <div className="hb-catflyout-foot">
                <button
                  type="button"
                  className="hb-link-btn"
                  onClick={() => select({ categoryId: null, subcategoryId: null })}
                >
                  Ohne Kategorie
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
