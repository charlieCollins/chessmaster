// frontend/src/pages/learn/solveLine.ts
// Pure rules for solving a position on the board (Lichess puzzles and Capablanca drills).
import { Chess } from "chess.js";

export type Side = "w" | "b";

export interface Line {
  startFen: string;
  moves: string[];       // UCI, both sides, from startFen
  userColor: Side;       // who the solver plays
  autoFirst: boolean;    // moves[0] is the opponent's (Lichess) and is played automatically
  askMoves: number;      // how many of the solver's moves are asked for
}

function sideToMove(fen: string): Side {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Lichess puzzle: FEN is before the opponent's move; moves[0] is that move. */
export function lichessToLine(p: { fen: string; moves: string[] }): Line {
  const opponent = sideToMove(p.fen);
  return {
    startFen: p.fen,
    moves: p.moves,
    userColor: opponent === "w" ? "b" : "w",
    autoFirst: true,
    askMoves: Math.floor(p.moves.length / 2),
  };
}

/** Book drill: the side to move in the diagram is the solver. */
export function drillToLine(d: { fen: string; line_uci: string[]; ask_moves: number }): Line {
  return { startFen: d.fen, moves: d.line_uci, userColor: sideToMove(d.fen), autoFirst: false, askMoves: d.ask_moves };
}

/** Indices into line.moves that the solver must play. */
export function userMoveIndices(line: Line): number[] {
  const first = line.autoFirst ? 1 : 0;
  const out: number[] = [];
  for (let i = first; i < line.moves.length && out.length < line.askMoves; i += 2) out.push(i);
  return out;
}

function toMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

export function applyUci(fen: string, uci: string): string {
  const c = new Chess(fen);
  c.move(toMove(uci));
  return c.fen();
}

/** Judge a solver's move: the expected one, another checkmate (always accepted), wrong, or illegal. */
export function checkMove(fen: string, uci: string, expected: string): "correct" | "mate" | "wrong" | "illegal" {
  const c = new Chess(fen);
  try {
    c.move(toMove(uci));
  } catch {
    return "illegal";
  }
  if (uci === expected) return "correct";
  if (c.isCheckmate()) return "mate";
  return "wrong";
}
