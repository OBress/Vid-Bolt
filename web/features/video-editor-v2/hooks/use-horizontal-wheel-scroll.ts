/**
 * useHorizontalWheelScroll
 *
 * Converts vertical mouse-wheel events into horizontal scrolling on a
 * container element. Used for tab bars that overflow when their parent
 * panel is narrow.
 *
 * - Only intercepts the event when the container actually has horizontal
 *   overflow (scrollWidth > clientWidth), so normal vertical scrolling
 *   is preserved otherwise.
 * - Hides the scrollbar by relying on the `scrollbar-hide` CSS utility.
 */

import { useRef, useEffect, useCallback } from "react";

export function useHorizontalWheelScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Only hijack the wheel when the container has horizontal overflow
      if (el.scrollWidth <= el.clientWidth) return;

      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    // `passive: false` is required so we can call preventDefault()
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return ref;
}
