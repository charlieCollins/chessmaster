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
import { tapAction, selectionStyles, layerStyles, selectedLabel } from "../../boardTap";
import { DRAG_ACTIVATION_PX } from "../../viewport";
import { StepIcon } from "../../ui";

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
    // The first-try result is decided now — record the miss immediately, so leaving the
    // position (or reloading) can't lose it. Finishing later won't report again.
    report({ solved: false, revealed: false });
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
    // A finger that wobbled onto the same square was a tap, not a drag
    if (sourceSquare === targetSquare) { onSquareClick({ square: sourceSquare }); return false; }
    setSelected(null);
    if (isPromotion(sourceSquare, targetSquare)) { setPendingPromo({ from: sourceSquare, to: targetSquare }); return true; }
    const legal = checkMove(fen, sourceSquare + targetSquare, line.moves[ply]) !== "illegal";
    if (legal) void tryMove(sourceSquare + targetSquare);
    return false;   // the board position is driven by `fen` state
  }

  function onSquareClick({ square }: { square: string }) {
    if (status !== "your-move") return;
    const action = tapAction(fen, selected, square, line.userColor);
    if (action.kind === "select") setSelected(action.square);
    else if (action.kind === "deselect") setSelected(null);
    else if (action.kind === "move") {
      setSelected(null);
      if (isPromotion(action.from, action.to)) setPendingPromo({ from: action.from, to: action.to });
      else void tryMove(action.from + action.to);
    }
  }

  const finished = status === "done" || status === "revealed";
  const more = finished && ply < line.moves.length && fen === fens[ply];   // not after a different mate
  const shownFen = contPly !== null ? fens[contPly] : fen;
  const baseStyles: Record<string, { backgroundColor: string }> = {};
  if (lastMove && contPly === null) {
    baseStyles[lastMove.from] = { backgroundColor: lastMove.color };
    baseStyles[lastMove.to] = { backgroundColor: lastMove.color };
  }
  const showSelection = selected && status === "your-move" && contPly === null;
  const squareStyles = layerStyles(baseStyles, showSelection ? selectionStyles(fen, selected) : {});
  const selectedText = showSelection ? selectedLabel(fen, selected) : null;

  const toneColor = { good: "var(--good)", bad: "var(--loss)", info: "var(--text-muted)" };

  return (
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div className="board-frame">
        <Chessboard options={{
          position: shownFen,
          onPieceDrop: onDrop,
          onSquareClick,
          boardOrientation: line.userColor === "w" ? "white" : "black",
          boardStyle: { width: size - 12, height: size - 12, borderRadius: 4 },
          darkSquareStyle: { backgroundColor: theme.dark },
          lightSquareStyle: { backgroundColor: theme.light },
          squareStyles,
          allowDragging: status === "your-move",
          dragActivationDistance: DRAG_ACTIVATION_PX,
        }} />
        {pendingPromo && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(5, 10, 8, 0.72)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 100, borderRadius: 10 }}>
            <div className="panel stack" style={{ alignItems: "center" }} role="dialog" aria-label="Promote to">
              <h3>Promote to</h3>
              <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                {([["q", "♛ Queen"], ["r", "♜ Rook"], ["b", "♝ Bishop"], ["n", "♞ Knight"]] as const).map(([p, label], i) => (
                  <button key={p} className={i === 0 ? "primary" : undefined} autoFocus={i === 0}
                    onClick={() => { const m = pendingPromo.from + pendingPromo.to + p; setPendingPromo(null); void tryMove(m); }}>
                    {label}
                  </button>
                ))}
              </div>
              <button className="quiet sm" onClick={() => setPendingPromo(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="stack" style={{ flex: 1, minWidth: 260, gap: 14 }}>
        <h3>{prompt ?? `You play ${line.userColor === "w" ? "White" : "Black"}. Find the best move.`}</h3>
        {status === "waiting" && !finished && <p className="muted small">The opponent is replying…</p>}
        {status === "your-move" && !message && (
          <p className="muted">
            Your move{asked.length > 1 ? ` (${asked.indexOf(ply) + 1} of ${asked.length})` : ""}.
          </p>
        )}
        {selectedText && (
          <p aria-live="polite" style={{ fontWeight: 500, color: "var(--accent)" }}>
            {selectedText}: tap a dot to move it
          </p>
        )}
        {message && <p style={{ color: toneColor[message.tone], fontWeight: message.tone === "info" ? 400 : 500 }}>{message.text}</p>}
        {ply > 0 && (
          <div className="mono small" style={{ lineHeight: 1.7 }}>
            {moveListText(line, fens, Math.min(ply, fens.length - 1))}
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          {onNext && finished && <button className="primary" onClick={onNext}>{nextLabel}</button>}
          {more && contPly === null && (
            <button onClick={() => setContPly(ply)}>See how it continues</button>
          )}
          {!finished && (
            <button className="quiet" disabled={status !== "your-move"} onClick={showSolution}>
              Show the solution
            </button>
          )}
        </div>

        {contPly !== null && (
          <div className="panel tight stack sm">
            <div className="row" style={{ gap: 6 }}>
              <button className="sm" aria-label="Previous move" disabled={contPly <= ply} onClick={() => setContPly(contPly - 1)}><StepIcon dir="prev" /></button>
              <button className="sm" aria-label="Next move" disabled={contPly >= line.moves.length} onClick={() => setContPly(contPly + 1)}><StepIcon dir="next" /></button>
              <button className="quiet sm" onClick={() => setContPly(null)}>Back to the position</button>
            </div>
            <div className="mono small muted" style={{ lineHeight: 1.7 }}>
              {moveListText(line, fens, contPly)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
