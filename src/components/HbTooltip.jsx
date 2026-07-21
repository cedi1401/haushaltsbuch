import React, { useId, useRef, useState, useLayoutEffect } from "react";
import { IconHelp } from "./icons.jsx";

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

  // After bubble renders: flip if needed + calculate arrow offset
  useLayoutEffect(() => {
    if (!state || !tipRef.current || !triggerRef.current) return;
    const bubble = tipRef.current.getBoundingClientRect();
    const { cx, r } = getTriggerCenter(triggerRef.current);

    let effectivePlacement = state.effectivePlacement;

    // Flip top→bottom if bubble overflows viewport top
    if (effectivePlacement === "top" && bubble.top < 8) {
      effectivePlacement = "bottom";
    }

    // Arrow offset: where the trigger center falls within the bubble (horizontal for top/bottom)
    let arrowX = null;
    if (effectivePlacement === "top" || effectivePlacement === "bottom") {
      const raw = cx - bubble.left;
      arrowX = Math.max(12, Math.min(bubble.width - 12, raw));
    }

    if (arrowX !== state.arrowX || effectivePlacement !== state.effectivePlacement) {
      const coords =
        effectivePlacement === "bottom"
          ? { left: cx, top: r.bottom + 10 }
          : state.coords;
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
