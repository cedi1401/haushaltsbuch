import { useEffect } from "react";

/**
 * Closes a popover when the user clicks outside `ref`.
 * `excludeRef` — optional second ref whose subtree is also treated as "inside"
 * (needed for fixed-positioned menus that live outside the trigger's DOM subtree).
 */
export function useClickOutside(ref, callback, { enabled = true, excludeRef } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e) => {
      if (excludeRef?.current?.contains(e.target)) return;
      if (ref.current && !ref.current.contains(e.target)) callback(e);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, callback, enabled, excludeRef]);
}
