// ── UI timing constants (milliseconds) ────────────────────────────────────

/** Auto-clear delay for the "Show Best" hint highlight */
export const HINT_DISPLAY_MS = 3000;

/** Auto-clear delay for the "Best opponent reply" highlight */
export const REPLY_DISPLAY_MS = 2000;

/** Auto-clear delay for the "Evaluate last move" highlight */
export const EVAL_DISPLAY_MS = 2000;

/** Duration of the "★ Best!" flash when player's move was optimal */
export const BEST_FLASH_MS = 2000;

/** Minimum delay before revealing the engine's reply move (avoids instant flash) */
export const ENGINE_MOVE_MIN_MS = 500;

/** Estimated duration of post-game analysis (used for progress bar) */
export const ANALYZE_ESTIMATE_MS = 15_000;

/** Progress bar tick interval during analysis */
export const ANALYZE_TICK_MS = 200;
