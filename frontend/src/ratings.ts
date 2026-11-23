// frontend/src/ratings.ts
// Game-result wording and accuracy-based ratings (shared by Play and Review).

/** Per-side accuracy computed by the backend (same definition as Home stats). */
export interface AccuracySummary {
  pct: number;
  counts: Record<string, number>;
  n: number;
}

export function grade(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: "Excellent", color: "var(--best)" };
  if (pct >= 78) return { label: "Good",      color: "var(--good)" };
  if (pct >= 65) return { label: "Average",   color: "var(--inaccuracy)" };
  if (pct >= 50) return { label: "Poor",      color: "var(--mistake)" };
  return              { label: "Blunder-heavy", color: "var(--blunder)" };
}

// Piece-wise linear mapping from accuracy% → approximate ELO-like performance.
// 77% (e.g. 2 blunders / 34 moves) ≈ 1000; 90% ≈ 1450; 95% ≈ 1700
export function estimateElo(pct: number): number {
  const pts: [number, number][] = [
    [0, 400], [50, 600], [65, 800], [78, 1000], [88, 1350], [95, 1700], [100, 2200],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (pct >= x0 && pct <= x1) {
      const t = (pct - x0) / (x1 - x0);
      return Math.round((y0 + t * (y1 - y0)) / 50) * 50;
    }
  }
  return pct >= 100 ? 2200 : 400;
}

const TERMINATION_TEXT: Record<string, string> = {
  checkmate: "checkmate",
  resigned: "resignation",
  stalemate: "stalemate",
  repetition: "repetition",
  "insufficient material": "insufficient material",
  "50-move rule": "50-move rule",
  "75-move rule": "75-move rule",
};

/** "You won" + "White wins by checkmate" style text for a finished game. */
export function describeResult(
  result: string | null, termination: string | null, playerColor: "white" | "black",
): { headline: string; detail: string } {
  const how = termination ? TERMINATION_TEXT[termination] ?? termination : null;
  if (result === "1/2-1/2") return { headline: "Draw", detail: how ? `Draw by ${how}` : "Draw" };
  const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : null;
  if (!winner) return { headline: "Game over", detail: result ?? "" };
  const side = winner === "white" ? "White" : "Black";
  return {
    headline: winner === playerColor ? "You won" : "You lost",
    detail: how ? `${side} wins by ${how}` : `${side} wins`,
  };
}
