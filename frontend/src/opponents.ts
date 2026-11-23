// frontend/src/opponents.ts
// Opponent families: Stockfish (engine levels) and Maia (human-trained, via lc0).

export type EngineKind = "stockfish" | "maia";

/** Display name, e.g. "Maia 1300", "Stockfish ~1000" (tilde = approximate Skill Level). */
export function opponentLabel(engine: EngineKind | null | undefined, elo: number): string {
  if (engine === "maia") return `Maia ${elo}`;
  return `Stockfish ${elo < 1320 ? "~" : ""}${elo}`;
}

/** <select> value encoding both parts, e.g. "maia:1300". */
export function encodeOpponent(engine: EngineKind, elo: number): string {
  return `${engine}:${elo}`;
}

export function decodeOpponent(value: string): { engine: EngineKind; elo: number } {
  const [engine, elo] = value.split(":");
  return { engine: engine === "maia" ? "maia" : "stockfish", elo: Number(elo) };
}
