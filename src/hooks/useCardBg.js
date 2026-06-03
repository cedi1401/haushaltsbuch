import { useState, useEffect } from "react";

function readCardBg() {
  return getComputedStyle(document.documentElement).getPropertyValue("--card").trim();
}

export function useCardBg() {
  const [cardBg, setCardBg] = useState(readCardBg);

  useEffect(() => {
    const observer = new MutationObserver(() => setCardBg(readCardBg()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return cardBg;
}
