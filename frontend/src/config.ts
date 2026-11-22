// ── API base URL ──────────────────────────────────────────────────────────
// Same-origin by default: in dev, Vite proxies /api to the backend (see
// vite.config.ts); in production, nginx proxies /api to uvicorn.
// Override with VITE_API_BASE if the backend lives elsewhere.
export const API: string = import.meta.env.VITE_API_BASE ?? "";

// ── UI timing constants (milliseconds) ────────────────────────────────────

/** Auto-clear delay for the "Show Best" hint highlight */
export const HINT_DISPLAY_MS = 1000;

/** Auto-clear delay for the "Best opponent reply" highlight */
export const REPLY_DISPLAY_MS = 1000;

/** Auto-clear delay for the "Evaluate last move" highlight */
export const EVAL_DISPLAY_MS = 1000;

/** Minimum delay before revealing the engine's reply move (avoids instant flash) */
export const ENGINE_MOVE_MIN_MS = 1000;

/** Estimated duration of post-game analysis (used for progress bar) */
export const ANALYZE_ESTIMATE_MS = 30_000;

/** Progress bar tick interval during analysis */
export const ANALYZE_TICK_MS = 200;
