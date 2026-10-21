import { useEffect, useRef, useState } from "react";

// Aufklappbare Karte, die sich aus dem Raster löst und über den Inhalt
// darunter legt (.hb-float-slot / .hb-float-card). Der Slot behält dafür die
// zugeklappte Höhe, damit die Reihe bleibt, wie sie ist. Klick daneben oder
// Escape klappt wieder zu; Escape gibt den Fokus an den Auslöser zurück.
//
// `measure()` vor dem Öffnen aufrufen, `slotHeight` aufgeklappt als
// Inline-Höhe auf den Slot setzen.
export function useFloatingSlot(isOpen, onClose) {
  const slotRef = useRef(null);
  const toggleRef = useRef(null);
  const [slotHeight, setSlotHeight] = useState(null);

  function measure() {
    setSlotHeight(slotRef.current?.offsetHeight ?? null);
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    function onPointerDown(e) {
      if (!slotRef.current?.contains(e.target)) onClose();
    }
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      onClose();
      toggleRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return { slotRef, toggleRef, slotHeight, measure };
}
