// frontend/src/viewport.ts
// Phone/narrow-screen helpers shared by the pages.
import { useEffect, useState } from "react";

export const NARROW_PX = 768;
/** .app-main horizontal padding on narrow screens (index.css: padding 16px 12px). */
const NARROW_GUTTER = 24;

function narrowNow(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= NARROW_PX;
}

/** True on phone-sized screens; updates on resize/rotation. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(narrowNow);
  useEffect(() => {
    const on = () => setNarrow(narrowNow());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}

/**
 * Board size in px: full width (minus the page gutter) on narrow screens, otherwise
 * what's left after `desktopReserve` px of side panels, between `min` and `max`.
 */
export function boardSizeFor(max: number, desktopReserve: number, min = 240): number {
  const w = window.innerWidth;
  if (w <= NARROW_PX) return Math.min(max, w - NARROW_GUTTER);
  return Math.max(min, Math.min(max, w - 48 - desktopReserve));
}

export function useBoardSizeFor(max: number, desktopReserve: number, min = 240): number {
  const [size, setSize] = useState(() => boardSizeFor(max, desktopReserve, min));
  useEffect(() => {
    const on = () => setSize(boardSizeFor(max, desktopReserve, min));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [max, desktopReserve, min]);
  return size;
}
