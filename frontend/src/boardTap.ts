// frontend/src/boardTap.ts
// Tap-to-move rules and highlights shared by every board the player moves on
// (Play, Learn's SolveBoard). Pure functions, tested in boardTap.test.ts.
import type { CSSProperties } from "react";
import { Chess, type Square } from "chess.js";

export type TapAction =
  | { kind: "select"; square: string }
  | { kind: "deselect" }
  | { kind: "move"; from: string; to: string }
  | { kind: "none" };

/** The legal moves of the piece on `from` (empty if none / not that side's turn). */
function movesFrom(fen: string, from: string) {
  try {
    return new Chess(fen).moves({ square: from as Square, verbose: true });
  } catch {
    return [];
  }
}

function pieceAt(fen: string, square: string) {
  try {
    return new Chess(fen).get(square as Square) ?? null;
  } catch {
    return null;
  }
}

/**
 * What a tap on `square` means, given the currently `selected` square (or null) and the
 * side the user plays ("w" | "b"):
 * - tap your own piece → select it (also switches from another selected piece)
 * - tap the selected piece again → deselect
 * - with a piece selected, tap a square it can legally reach → move
 * - anything else → deselect (or nothing if nothing was selected)
 */
export function tapAction(fen: string, selected: string | null, square: string, userColor: "w" | "b"): TapAction {
  if (selected === square) return { kind: "deselect" };
  if (selected && movesFrom(fen, selected).some((m) => m.to === square)) {
    return { kind: "move", from: selected, to: square };
  }
  const piece = pieceAt(fen, square);
  if (piece && piece.color === userColor) return { kind: "select", square };
  return selected ? { kind: "deselect" } : { kind: "none" };
}

const PIECE_NAMES: Record<string, string> = {
  p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King",
};

/** "Knight on g1", or null if the square is empty. */
export function selectedLabel(fen: string, square: string): string | null {
  const piece = pieceAt(fen, square);
  return piece ? `${PIECE_NAMES[piece.type]} on ${square}` : null;
}

const SELECTED_FILL = "rgba(201, 168, 76, 0.55)";
const SELECTED_RING = "inset 0 0 0 4px rgba(232, 196, 90, 0.95)";
const DOT = "radial-gradient(circle, rgba(20, 20, 20, 0.38) 24%, transparent 26%)";
const CAPTURE_RING = "radial-gradient(circle, transparent 58%, rgba(20, 20, 20, 0.38) 60%)";

/**
 * Highlights for a selected piece: a strong gold fill + outline on its square, a dot on
 * every empty square it can move to, and a ring on every piece it can capture.
 * Uses backgroundImage/boxShadow so it layers over other squares' backgroundColor.
 */
export function selectionStyles(fen: string, selected: string | null): Record<string, CSSProperties> {
  if (!selected) return {};
  const out: Record<string, CSSProperties> = {
    [selected]: { backgroundColor: SELECTED_FILL, boxShadow: SELECTED_RING },
  };
  for (const m of movesFrom(fen, selected)) {
    const capture = m.captured !== undefined;
    out[m.to] = { backgroundImage: capture ? CAPTURE_RING : DOT };
  }
  return out;
}

/** Layer `top` over `base`, merging the CSS of squares present in both. */
export function layerStyles(
  base: Record<string, CSSProperties>,
  top: Record<string, CSSProperties>,
): Record<string, CSSProperties> {
  const out = { ...base };
  for (const [sq, style] of Object.entries(top)) out[sq] = { ...base[sq], ...style };
  return out;
}
