// frontend/src/classify.ts
// Move-quality model shared by the Play page's live highlights.
// Mirrors backend/game_utils.py (win_percent / mover_win_loss / classify_move)
// so live feedback and post-game analysis agree.

export type Quality = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export const QUALITIES: Quality[] = ["best", "good", "inaccuracy", "mistake", "blunder"];

/** White's winning chances (0–100) for a White-POV centipawn eval (Lichess model). */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Win-percentage points the moving side gave up (never negative). */
export function moverWinLoss(evalBefore: number, evalAfter: number, moverIsWhite: boolean): number {
  const lost = moverIsWhite
    ? winPercent(evalBefore) - winPercent(evalAfter)
    : winPercent(evalAfter) - winPercent(evalBefore);
  return Math.max(0, lost);
}

export function classifyWinLoss(winLoss: number): Quality {
  if (winLoss <= 0) return "best";
  if (winLoss < 5) return "good";
  if (winLoss < 10) return "inaccuracy";
  if (winLoss < 15) return "mistake";
  return "blunder";
}

/** Same as the backend: playing the engine's top move is always "best". */
export function classifyMove(
  playedUci: string, bestUci: string | null,
  evalBefore: number | null, evalAfter: number | null, moverIsWhite: boolean,
): Quality | null {
  if (bestUci !== null && playedUci === bestUci) return "best";
  if (evalBefore === null || evalAfter === null) return null;
  return classifyWinLoss(moverWinLoss(evalBefore, evalAfter, moverIsWhite));
}

/** Theme-aware square tint for a quality (uses the --best/--good/... CSS tokens). */
export function qualityTint(q: Quality, pct: number): string {
  return `color-mix(in srgb, var(--${q}) ${pct}%, transparent)`;
}
