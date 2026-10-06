import React, { useEffect, useId, useRef, useState, useLayoutEffect } from "react";
import { IconHelp } from "./icons.jsx";

// Mindestabstand der Bubble zum Fensterrand
const EDGE_GAP = 8;

function getTriggerCenter(triggerEl) {
  const r = triggerEl.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r };
}

/**
 * Die eine Erklär-Blase der App. Zwei Formen:
 *
 * - ohne `children`: ein Fragezeichen-Icon als Auslöser (Hilfe neben Titeln).
 * - mit `children`: das umschlossene Element (Pille, Wert) ist selbst der
 *   Auslöser. Dafür ist die Form gedacht, wenn ein zweites Symbol zu viel
 *   wäre, etwa an jeder Status-Pille einer Tabellenspalte.
 *
 * Natives `title` bleibt den Icon-Buttons und abgeschnittenen Namen
 * vorbehalten. Umschlossene Auslöser öffnen per Maus nach 400 ms (sonst
 * flackert die Blase beim Überstreichen einer Tabellenspalte), per
 * Tastaturfokus sofort. `focusable={false}` nimmt den Auslöser aus der
 * Tab-Reihenfolge (Tabellenzeilen, Inhalte fokussierbarer Karten).
 * `inline` für Fließtext, der umbrechen darf; `underline` kennzeichnet ein
 * reines Textlabel gepunktet (Pillen und Zahlen bleiben unverändert).
 */
const WRAP_DELAY = 400;

export default function HbTooltip({
  text,
  placement = "top",
  label = "Erklärung anzeigen",
  size = 20,
  className,
  children,
  focusable = true,
  inline = false,
  underline = false,
}) {
  const [state, setState] = useState(null); // { coords, arrowX, effectivePlacement }
  const triggerRef = useRef(null);
  const tipRef = useRef(null);
  const timerRef = useRef(null);
  const id = useId();
  const wraps = children != null;
  const delay = wraps ? WRAP_DELAY : 0;

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function open() {
    clearTimeout(timerRef.current);
    if (!triggerRef.current) return;
    const { cx, cy, r } = getTriggerCenter(triggerRef.current);
    const coords =
      placement === "right"
        ? { left: r.right + 10, top: cy }
        : placement === "bottom"
        ? { left: cx, top: r.bottom + 10 }
        : { left: cx, top: r.top - 10 };
    setState({ coords, arrowX: null, effectivePlacement: placement });
  }

  function openDelayed() {
    if (!delay) return open();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(open, delay);
  }

  function close() {
    clearTimeout(timerRef.current);
    setState(null);
  }

  // After bubble renders: flip if needed + clamp horizontally + arrow offset
  useLayoutEffect(() => {
    if (!state || !tipRef.current || !triggerRef.current) return;
    const bubble = tipRef.current.getBoundingClientRect();
    const { cx, r } = getTriggerCenter(triggerRef.current);

    let effectivePlacement = state.effectivePlacement;

    // Flip top→bottom if bubble overflows viewport top
    if (effectivePlacement === "top" && bubble.top < EDGE_GAP) {
      effectivePlacement = "bottom";
    }

    let coords =
      effectivePlacement === "bottom" && state.effectivePlacement !== "bottom"
        ? { left: cx, top: r.bottom + 10 }
        : state.coords;

    // Arrow offset: where the trigger center falls within the bubble (horizontal for top/bottom)
    let arrowX = null;
    if (effectivePlacement === "top" || effectivePlacement === "bottom") {
      // Die Bubble hängt per translateX(-50%) mittig am Trigger. Sitzt der
      // Trigger nah am Fensterrand (z.B. die rechte KPI-Pill), würde sie dort
      // herausragen. Statt zu flippen wird sie in den Viewport geschoben und
      // der Pfeil zeigt weiterhin auf den Trigger.
      const half = bubble.width / 2;
      const minCenter = EDGE_GAP + half;
      const maxCenter = window.innerWidth - EDGE_GAP - half;
      const center =
        maxCenter >= minCenter ? Math.min(Math.max(cx, minCenter), maxCenter) : cx;
      coords = { ...coords, left: center };
      arrowX = Math.max(12, Math.min(bubble.width - 12, cx - (center - half)));
    }

    if (
      arrowX !== state.arrowX ||
      effectivePlacement !== state.effectivePlacement ||
      coords.left !== state.coords.left ||
      coords.top !== state.coords.top
    ) {
      setState({ coords, arrowX, effectivePlacement });
    }
  }, [state]);

  const isOpen = state !== null;
  const cls = [
    "hb-tooltip",
    wraps && "hb-tooltip--wrap",
    wraps && inline && "hb-tooltip--inline",
    wraps && underline && "hb-tooltip--underline",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span
      className={cls}
      onMouseLeave={close}
    >
      {wraps ? (
        <span
          ref={triggerRef}
          className="hb-tooltip-target"
          tabIndex={focusable ? 0 : undefined}
          aria-describedby={isOpen ? id : undefined}
          onMouseEnter={openDelayed}
          onFocus={open}
          onBlur={close}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          {children}
        </span>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="hb-tooltip-trigger"
          aria-label={label}
          aria-describedby={isOpen ? id : undefined}
          onMouseEnter={openDelayed}
          onFocus={open}
          onBlur={close}
          onClick={open}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <IconHelp width={size} height={size} />
        </button>
      )}
      {isOpen && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          className={`hb-tooltip-bubble hb-tooltip-bubble--${state.effectivePlacement}`}
          style={{
            left: state.coords.left,
            top: state.coords.top,
            ...(state.arrowX != null ? { "--hb-arrow-x": `${state.arrowX}px` } : {}),
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
