// frontend/src/viewport.ts
// Phone/narrow-screen helpers shared by the pages.
import { useEffect, useState } from "react";

export const NARROW_PX = 768;
/** .app-main horizontal padding on narrow screens (index.css: padding 18px 12px). */
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

/** True on touch-first devices (phones, tablets). */
export const COARSE_POINTER =
  typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Pixels a finger must travel before the board treats it as a drag. The library default
 * (1px) turns almost every tap into a tiny drag, so taps to select/move get lost on phones.
 */
export const DRAG_ACTIVATION_PX = COARSE_POINTER ? 12 : 3;

/** .app-main max width and horizontal padding on desktop (index.css). */
const MAIN_MAX = 1200;
const MAIN_PAD_X = 56;
/** Header + top/bottom page padding above and below the board on desktop. */
const DESKTOP_CHROME_Y = 60 + 32 + 28;

/**
 * Board size for a page with the board beside a `panel`-px side panel: on desktop as large
 * as fits both the page width and the window height (so the whole board is visible without
 * scrolling); on phones, full width.
 */
export function boardBesidePanel(panel: number, gap: number, max = 820, min = 320): number {
  const w = window.innerWidth;
  if (w <= NARROW_PX) return Math.min(max, w - NARROW_GUTTER);
  const byWidth = Math.min(w, MAIN_MAX) - MAIN_PAD_X - panel - gap;
  const byHeight = window.innerHeight - DESKTOP_CHROME_Y;
  return Math.round(Math.max(min, Math.min(max, byWidth, byHeight)));
}

export function useBoardBesidePanel(panel: number, gap: number, max = 820, min = 320): number {
  const [size, setSize] = useState(() => boardBesidePanel(panel, gap, max, min));
  useEffect(() => {
    const on = () => setSize(boardBesidePanel(panel, gap, max, min));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [panel, gap, max, min]);
  return size;
}
