// frontend/src/pages/learn/api.ts
// Typed client for /api/learn (backend/learn_api.py).
import { API } from "../../config";

export interface Progress { attempts: number; solved: number; accuracy: number | null }
export interface TopicSummary {
  slug: string; title: string; group: string; summary: string;
  has_drills: boolean; has_puzzles: boolean; progress: Progress;
}
export interface TopicsResponse { rating: number; reviews_due: number; groups: { group: string; topics: TopicSummary[] }[] }

export type Block = { kind: "para"; text: string } | { kind: "moves"; text: string } | { kind: "diagram"; fig: string };
export interface BookSection { book_title: string; author: string; section: string; title: string; blocks: Block[] }
export interface BookDiagram { fen: string; kind: string; note: string; section: string | null; line_uci: string[]; line_san: string[] }
export interface Drill {
  ref: string; topic: string | null; fig: string; fen: string; line_uci: string[]; line_san: string[];
  ask_moves: number; book_title: string; section_title: string | null;
}
export interface TopicDetail {
  slug: string; title: string; group: string; summary: string; ideas: string[]; themes: string[]; drill_tip: string;
  piece_lesson: boolean; sections: BookSection[]; diagrams: Record<string, BookDiagram>; drills: Drill[];
  puzzles_available: boolean;
}
export interface Puzzle { id: string; fen: string; moves: string[]; rating: number; themes: string[] }
export interface AttemptRequest {
  kind: "puzzle" | "book"; ref: string; topic: string | null; context: "lesson" | "review";
  solved: boolean; revealed: boolean; seconds: number; puzzle_rating?: number | null;
}
export interface AttemptResponse {
  rated: boolean; rating_before: number | null; rating_after: number | null;
  review: { step: number; due_at: string } | null;
}
export type ReviewItem =
  | { kind: "puzzle"; ref: string; topic: string | null; step: number; due_at: string; position: Puzzle }
  | { kind: "book"; ref: string; topic: string | null; step: number; due_at: string; position: Drill };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const getTopics = () => fetch(`${API}/api/learn/topics`).then(r => json<TopicsResponse>(r));
export const getTopic = (slug: string) => fetch(`${API}/api/learn/topics/${slug}`).then(r => json<TopicDetail>(r));
export const getPuzzles = (slug: string, n = 10) =>
  fetch(`${API}/api/learn/topics/${slug}/puzzles?n=${n}`).then(r => json<{ rating: number; puzzles: Puzzle[] }>(r));
export const postAttempt = (a: AttemptRequest) =>
  fetch(`${API}/api/learn/attempts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) })
    .then(r => json<AttemptResponse>(r));
export const getReviews = () => fetch(`${API}/api/learn/reviews`).then(r => json<{ items: ReviewItem[] }>(r));
export const judge = (fen: string, move: string, expected: string) =>
  fetch(`${API}/api/learn/judge`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen, move, expected }) })
    .then(r => json<{ accepted: boolean; verdict: string }>(r));
