// frontend/src/pages/learn/boardUtils.ts
// Non-component helpers shared by the lessons and openings.
import { useEffect, useState } from "react";
import { Chess } from "chess.js";

export type SqStyles = Record<string, { backgroundColor: string }>;

// Responsive board size hook (mirrors the one in Play.tsx / Review.tsx)
export function useBoardSize(max: number): number {
  const [size, setSize] = useState(() => Math.min(max, window.innerWidth - 48));
  useEffect(() => {
    const handler = () => setSize(Math.min(max, window.innerWidth - 48));
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [max]);
  return size;
}

export function sq(squares: string[], color: string): SqStyles {
  return Object.fromEntries(squares.map(s => [s, { backgroundColor: color }]));
}

export function fenAtPly(moves: string[], ply: number): string {
  const chess = new Chess();
  for (let i = 0; i < ply; i++) {
    try { chess.move(moves[i]); } catch { break; }
  }
  return chess.fen();
}

export function pairMoves(moves: string[]): Array<{ n: number; w: string; b: string | null }> {
  const pairs: Array<{ n: number; w: string; b: string | null }> = [];
  for (let i = 0; i < moves.length; i += 2)
    pairs.push({ n: i / 2 + 1, w: moves[i], b: moves[i + 1] ?? null });
  return pairs;
}
