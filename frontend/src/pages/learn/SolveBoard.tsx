// frontend/src/pages/learn/SolveBoard.tsx
// Solve one position on the board: the solver plays their moves, the board plays the
// replies. First try counts; wrong moves can be retried; the solution can be shown.
// Render with a `key` per position so state resets between positions.
import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
import { useBoardTheme } from "../../themes";
import { useBoardSize } from "./boardUtils";
import { applyUci, checkMove, userMoveIndices, type Line } from "./solveLine";

export interface SolveResult { solved: boolean; revealed: boolean; seconds: number }

type Status = "waiting" | "your-move" | "judging" | "done" | "revealed";

const REPLY_MS = 450;
const AUTO_FIRST_MS = 650;
const GOLD = "rgba(201,168,76,0.45)";
const GREEN = "rgba(82,183,136,0.45)";
const RED = "rgba(224,90,90,0.5)";

function sanOf(fen: string, uci: string): string {
  const c = new Chess(fen);
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
}

function fensFor(line: Line): string[] {
  const out = [line.startFen];
  for (const m of line.moves) out.push(applyUci(out[out.length - 1], m));
  return out;
}

function moveListText(line: Line, fens: string[], upTo: number): string {
  const parts: string[] = [];
  for (let i = 0; i < upTo; i++) {
    const [, side, , , , full] = fens[i].split(" ");
    const san = sanOf(fens[i], line.moves[i]);
    if (side === "w") parts.push(`${full}. ${san}`);
    else parts.push(i === 0 ? `${full}... ${san}` : san);
  }
  return parts.join(" ");
}

export default function SolveBoard({ line, judge, onResult, onNext, nextLabel = "Next", prompt }: {
  line: Line;
  judge?: (fen: string, uci: string, expected: string) => Promise<boolean>;
  onResult: (r: SolveResult) => void;
  onNext?: () => void;
  nextLabel?: string;
  prompt?: string;
}) {
  const theme = useBoardTheme();
  const size = useBoardSize(460);
  const fens = useMemo(() => fensFor(line), [line]);
  const asked = useMemo(() => userMoveIndices(line), [line]);
  const lastAsked = asked[asked.length - 1] ?? -1;

  const [ply, setPly] = useState(0);                 // moves played so far
  const [fen, setFen] = useState(line.startFen);     // may differ from fens[ply] after an accepted alternative mate
  const [status, setStatus] = useState<Status>(line.autoFirst ? "waiting" : "your-move");
  const [firstTry, setFirstTry] = useState(true);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" | "info" } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string; color: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(null);
  const [contPly, setContPly] = useState<number | null>(null);   // "see how it continues" stepping
  const started = useRef(Date.now());
  const reported = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const report = (r: Omit<SolveResult, "seconds">) => {
    if (reported.current) return;
    reported.current = true;
    onResult({ ...r, seconds: Math.round((Date.now() - started.current) / 100) / 10 });
  };

  const playAt = (i: number, color = GOLD) => {
    const uci = line.moves[i];
    setFen(fens[i + 1]);
    setPly(i + 1);
    setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), color });
  };

  // Lichess puzzles open with the opponent's move
  useEffect(() => {
    if (!line.autoFirst) return;
    later(() => { playAt(0); setStatus("your-move"); started.current = Date.now(); }, AUTO_FIRST_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish(solvedFirstTry: boolean) {
    setStatus("done");
    setMessage(solvedFirstTry ? { text: "Solved!", tone: "good" } : { text: "Solved — not on the first try, so it goes to review.", tone: "info" });
    report({ solved: solvedFirstTry, revealed: false });
  }

  function accept(i: number, playedUci: string, mate: boolean, note?: string) {
    if (mate && playedUci !== line.moves[i]) {         // a different checkmate: show the move played
      setFen(applyUci(fens[i], playedUci));
      setPly(i + 1);
      setLastMove({ from: playedUci.slice(0, 2), to: playedUci.slice(2, 4), color: GREEN });
      finish(firstTry);
      return;
    }
    playAt(i, GREEN);
    if (note) setMessage({ text: note, tone: "good" });
    if (i >= lastAsked) { if (note) { setStatus("done"); report({ solved: firstTry, revealed: false }); } else finish(firstTry); return; }
    setStatus("waiting");
    later(() => { playAt(i + 1); setStatus("your-move"); }, REPLY_MS);
  }

  async function tryMove(uci: string) {
    if (status !== "your-move" || !asked.includes(ply)) return false;
    const verdict = checkMove(fen, uci, line.moves[ply]);
    if (verdict === "illegal") return false;
    if (verdict === "correct" || verdict === "mate") {
      setMessage(null);
      accept(ply, uci, verdict === "mate");
      return true;
    }
    if (judge) {
      setStatus("judging");
      setMessage({ text: "Checking your move…", tone: "info" });
      let ok = false;
      try { ok = await judge(fen, uci, line.moves[ply]); } catch { ok = false; }
      if (ok) {
        accept(ply, uci, false, `Also good — the book played ${sanOf(fen, line.moves[ply])}, continuing with that.`);
        return true;
      }
      setStatus("your-move");
    }
    setFirstTry(false);
    setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), color: RED });
    setMessage({ text: `Not quite — ${sanOf(fen, uci)} isn't it. Try again.`, tone: "bad" });
    return false;
  }

  function showSolution() {
    setStatus("revealed");
    setMessage({ text: "Here's the solution. This position will come back in your review queue.", tone: "info" });
    report({ solved: false, revealed: true });
    let t = 0;
    for (let i = ply; i <= lastAsked; i++) { const j = i; later(() => playAt(j), (t += 700)); }
  }

  function isPromotion(from: string, to: string) {
    return new Chess(fen).moves({ square: from as Square, verbose: true }).some(m => m.to === to && m.promotion);
  }

  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }): boolean {
    if (!targetSquare || status !== "your-move") return false;
    setSelected(null);
    if (isPromotion(sourceSquare, targetSquare)) { setPendingPromo({ from: sourceSquare, to: targetSquare }); return true; }
    const legal = checkMove(fen, sourceSquare + targetSquare, line.moves[ply]) !== "illegal";
    if (legal) void tryMove(sourceSquare + targetSquare);
    return false;   // the board position is driven by `fen` state
  }

  function onSquareClick({ square, piece }: { square: string; piece?: { pieceType: string } | null }) {
    if (status !== "your-move") return;
    if (selected) {
      const from = selected;
      setSelected(null);
      if (from === square) return;
      if (isPromotion(from, square)) { setPendingPromo({ from, to: square }); return; }
      if (checkMove(fen, from + square, line.moves[ply]) !== "illegal") { void tryMove(from + square); return; }
    }
    if (piece && piece.pieceType.startsWith(line.userColor)) setSelected(square);
  }

  const finished = status === "done" || status === "revealed";
  const more = finished && ply < line.moves.length && fen === fens[ply];   // not after a different mate
  const shownFen = contPly !== null ? fens[contPly] : fen;
  const squareStyles: Record<string, { backgroundColor: string }> = {};
  if (lastMove && contPly === null) {
    squareStyles[lastMove.from] = { backgroundColor: lastMove.color };
    squareStyles[lastMove.to] = { backgroundColor: lastMove.color };
  }
  if (selected) squareStyles[selected] = { backgroundColor: GOLD };

  const toneColor = { good: "var(--good)", bad: "var(--loss)", info: "var(--text-dim)" };

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ position: "relative" }}>
        <Chessboard options={{
          position: shownFen,
          onPieceDrop: onDrop,
          onSquareClick,
          boardOrientation: line.userColor === "w" ? "white" : "black",
          boardStyle: { width: size, height: size, borderRadius: "var(--radius)" },
          darkSquareStyle: { backgroundColor: theme.dark },
          lightSquareStyle: { backgroundColor: theme.light },
          squareStyles,
          allowDragging: status === "your-move",
        }} />
        {pendingPromo && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 100, borderRadius: "var(--radius)" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border-hi)", borderRadius: "var(--radius-lg)",
              padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
              <div className="mono dim" style={{ fontSize: 12, letterSpacing: "0.1em" }}>PROMOTE TO</div>
              <div style={{ display: "flex", gap: 8 }}>
                {([["q", "♛ Queen"], ["r", "♜ Rook"], ["b", "♝ Bishop"], ["n", "♞ Knight"]] as const).map(([p, label], i) => (
                  <button key={p} className="primary" autoFocus={i === 0} style={{ padding: "8px 14px", fontSize: 13 }}
                    onClick={() => { const m = pendingPromo.from + pendingPromo.to + p; setPendingPromo(null); void tryMove(m); }}>
                    {label}
                  </button>
                ))}
              </div>
              <button className="ghost" style={{ fontSize: 11 }} onClick={() => setPendingPromo(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-bright)" }}>
          {prompt ?? `You play ${line.userColor === "w" ? "White" : "Black"}`}
        </div>
        {status === "waiting" && !finished && <div className="mono dim" style={{ fontSize: 12 }}>…</div>}
        {status === "your-move" && !message && (
          <div className="mono dim" style={{ fontSize: 12 }}>
            Find the best move{asked.length > 1 ? ` (${asked.indexOf(ply) + 1} of ${asked.length})` : ""}.
          </div>
        )}
        {message && <div style={{ fontSize: 13, color: toneColor[message.tone], lineHeight: 1.5 }}>{message.text}</div>}
        {ply > 0 && (
          <div className="mono" style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>
            {moveListText(line, fens, Math.min(ply, fens.length - 1))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!finished && (
            <button className="ghost" disabled={status !== "your-move"} onClick={showSolution} style={{ fontSize: 12 }}>
              Show solution
            </button>
          )}
          {more && contPly === null && (
            <button className="ghost" onClick={() => setContPly(ply)} style={{ fontSize: 12 }}>See how it continues</button>
          )}
          {onNext && finished && <button className="primary" onClick={onNext} style={{ fontSize: 12 }}>{nextLabel} ›</button>}
        </div>

        {contPly !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="ghost" disabled={contPly <= ply} onClick={() => setContPly(contPly - 1)} style={{ fontSize: 12 }}>‹</button>
              <button className="ghost" disabled={contPly >= line.moves.length} onClick={() => setContPly(contPly + 1)} style={{ fontSize: 12 }}>›</button>
              <button className="ghost" onClick={() => setContPly(null)} style={{ fontSize: 12 }}>Back to the position</button>
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>
              {moveListText(line, fens, contPly)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
