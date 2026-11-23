// frontend/src/evalText.ts
// Human-readable text for engine evaluations (Play page eval panel).
// All inputs are centipawns from the PLAYER's point of view (positive = good for you).

/** Backend encodes forced mate as ±(MATE_CP − moves to mate). */
export const MATE_CP = 10000;
export const MATE_THRESHOLD = 9000;

const isMate = (cp: number) => Math.abs(cp) >= MATE_THRESHOLD;

/** "+4.89", "-0.36", "M3" (you mate in 3), "-M3" (you get mated in 3). */
export function formatEval(cp: number): string {
  if (isMate(cp)) return `${cp > 0 ? "" : "-"}M${MATE_CP - Math.abs(cp)}`;
  return cp > 0 ? `+${(cp / 100).toFixed(2)}` : (cp / 100).toFixed(2);
}

/** Plain-English size of an advantage. */
export function describeEval(cp: number): string {
  if (isMate(cp)) return cp > 0 ? "you have a forced mate" : "engine has a forced mate";
  const size = Math.abs(cp);
  if (size < 50) return "roughly equal";
  const who = cp > 0 ? "you" : "engine";
  if (size < 150) return `slight edge for ${who}`;
  if (size < 300) return `clear advantage for ${who}`;
  return cp > 0 ? "you're winning" : "engine is winning";
}

/** What your move did, judged by the position before vs after it (mate-aware). */
export function describeMoveDelta(before: number, after: number): string {
  const beforeMate = isMate(before) ? Math.sign(before) : 0;   // +1 you mate, -1 you're mated
  const afterMate = isMate(after) ? Math.sign(after) : 0;
  if (beforeMate !== 0 || afterMate !== 0) {
    if (beforeMate === afterMate) return beforeMate > 0 ? "= still mating" : "= still being mated";
    if (afterMate > 0) return "▲ found a forced mate";
    if (afterMate < 0) return "▼ allowed a forced mate";
    return beforeMate > 0 ? "▼ missed a forced mate" : "▲ escaped a forced mate";
  }
  const delta = after - before;
  if (delta === 0) return "= no change";
  return `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta / 100).toFixed(2)} ${delta > 0 ? "better" : "worse"}`;
}
