import React, { useId, useRef, useState, useLayoutEffect } from "react";
import { IconHelp } from "./icons.jsx";

// Mindestabstand der Bubble zum Fensterrand
const EDGE_GAP = 8;

function getTriggerCenter(triggerEl) {
  const r = triggerEl.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r };
}

export default function HbTooltip({
  text,
  placement = "top",
  label = "Erklärung anzeigen",
  size = 20,
  className,
}) {
  const [state, setState] = useState(null); // { coords, arrowX, effectivePlacement }
  const triggerRef = useRef(null);
  const tipRef = useRef(null);
  const id = useId();

  function open() {
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

  function close() {
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

  return (
    <span
      className={`hb-tooltip${className ? ` ${className}` : ""}`}
      onMouseLeave={close}
    >
      <button
        ref={triggerRef}
        type="button"
        className="hb-tooltip-trigger"
        aria-label={label}
        aria-describedby={isOpen ? id : undefined}
        onMouseEnter={open}
        onFocus={open}
        onBlur={close}
        onClick={open}
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <IconHelp width={size} height={size} />
      </button>
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
