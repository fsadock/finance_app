"use client";

import { useEffect, useRef, type RefObject } from "react";

/** While `active`, calls `onOutside` when the user presses the mouse outside `ref` (closes popovers). */
export function useClickOutside(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  const callback = useRef(onOutside);
  useEffect(() => {
    callback.current = onOutside;
  });
  useEffect(() => {
    if (!active) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) callback.current();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, ref]);
}
