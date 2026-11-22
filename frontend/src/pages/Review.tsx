// frontend/src/pages/Review.tsx
import { useState, useEffect, useRef } from "react";
import { API, ANALYZE_ESTIMATE_MS, ANALYZE_TICK_MS } from "../config";
import { useBoardTheme } from "../themes";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

const COLORS: Record<string, string> = {
  best:        "var(--best)",
  good:        "var(--good)",
  inaccuracy:  "var(--inaccuracy)",
  mistake:     "var(--mistake)",
  blunder:     "var(--blunder)",
};

const LEGEND = [
  { key: "best",       label: "Best",       desc: "0 cp — engine's top choice" },
  { key: "good",       label: "Good",       desc: "1–49 cp loss" },
  { key: "inaccuracy", label: "Inaccuracy", desc: "50–99 cp loss" },
  { key: "mistake",    label: "Mistake",    desc: "100–199 cp loss" },
  { key: "blunder",    label: "Blunder",    desc: "≥200 cp loss" },
];

const GLYPH: Record<string, string> = {
  best: "★", inaccuracy: "?!", mistake: "?", blunder: "??",
};

const ACCURACY_SCORE: Record<string, number> = {
  best: 100, good: 85, inaccuracy: 60, mistake: 30, blunder: 0,
};

function grade(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: "Excellent", color: "var(--best)" };
  if (pct >= 78) return { label: "Good",      color: "var(--good)" };
  if (pct >= 65) return { label: "Average",   color: "var(--inaccuracy)" };
  if (pct >= 50) return { label: "Poor",      color: "var(--mistake)" };
  return              { label: "Blunder-heavy", color: "var(--blunder)" };
}

// Piece-wise linear mapping from accuracy% → approximate ELO-like performance.
// 77% (e.g. 2 blunders / 34 moves) ≈ 1000; 90% ≈ 1450; 95% ≈ 1700
function estimateElo(pct: number): number {
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

function computeAccuracy(moves: MoveRecord[], color: string) {
  const mine = moves.filter(m => {
    const isWhite = m.ply % 2 === 1;
    return color === "white" ? isWhite : !isWhite;
  }).filter(m => m.classification !== null);

  if (mine.length === 0) return null;

  const counts: Record<string, number> = {};
  let total = 0;
  for (const m of mine) {
    const c = m.classification!;
    counts[c] = (counts[c] ?? 0) + 1;
    total += ACCURACY_SCORE[c] ?? 50;
  }
  return { pct: Math.round(total / mine.length), counts, n: mine.length };
}

interface MoveRecord {
  ply: number;
  uci: string;
  san: string;
  classification: string | null;
  best_uci: string | null;
}

interface GameData {
  game_id: number;
  result: string;
  player_color: string;
  engine_elo: number;
  analyzed: boolean;
  moves: MoveRecord[];
}

interface ReviewProps {
  gameId: number;
}

// FIX 2 — MoveCell defined outside Review to avoid remount on every render
interface MoveCellProps {
  m: MoveRecord | null;
  currentPly: number;
  setCurrentPly: (ply: number) => void;
  you: "white" | "black";
  yourTint: string;
}

function MoveCell({ m, currentPly, setCurrentPly, you, yourTint }: MoveCellProps) {
  if (!m) return <td style={{ background: you === "white" ? yourTint : undefined }} />;
  const active = currentPly === m.ply;
  const isWhite = m.ply % 2 === 1;
  const isYou = you === "white" ? isWhite : !isWhite;
  const color = m.classification ? COLORS[m.classification] : "var(--text)";
  return (
    <td style={{ background: isYou ? yourTint : undefined, padding: "2px 4px" }}>
      <span
        className={`move-cell${active ? " active" : ""}`}
        onClick={() => setCurrentPly(m.ply)}
        style={{ color: active ? "var(--gold)" : color }}
      >
        {m.san}
        {m.classification && m.classification !== "good" && GLYPH[m.classification] && (
          <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.75 }}>{GLYPH[m.classification]}</span>
        )}
        {/* FIX UX-L7 — small checkmark for good moves so they look distinct from unanalyzed */}
        {m.classification === "good" && (
          <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.6, color: "var(--good)" }}>✓</span>
        )}
      </span>
    </td>
  );
}

// Responsive board size hook
function useBoardSize(max: number): number {
  const [size, setSize] = useState(() => Math.min(max, window.innerWidth - 48));
  useEffect(() => {
    const handler = () => setSize(Math.min(max, window.innerWidth - 48));
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [max]);
  return size;
}

export default function Review({ gameId }: ReviewProps) {
  const boardTheme = useBoardTheme();
  const boardSize = useBoardSize(480);
  const [game, setGame]               = useState<GameData | null>(null);
  const [currentPly, setCurrentPly]   = useState(0);
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  // FIX M6 — ref to store the 400ms end-of-analysis timer
  const analysisEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX 4 — ref for active row auto-scroll
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  // isMountedRef — guards all setState calls in runAnalysis after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // FIX M7 — ref for game so keyboard handler doesn't need game in its dep array
  // Assigned inline during render (always current, no effect timing window)
  const gameRef = useRef<GameData | null>(null);
  gameRef.current = game;

  useEffect(() => { setCurrentPly(0); }, [gameId]);

  // FIX M6 — cleanup useEffect: clear timers on unmount
  useEffect(() => {
    return () => {
      if (analysisEndTimerRef.current) clearTimeout(analysisEndTimerRef.current);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  // FIX H3/H4 — game-load effect with cancelled flag to guard setState after unmount
  useEffect(() => {
    let cancelled = false;

    const runAutoAnalysis = async (data: GameData) => {
      if (cancelled) return;
      setAnalyzing(true);
      setAnalyzeProgress(0);
      progressInterval.current = setInterval(() => {
        setAnalyzeProgress(p => Math.min(p + ANALYZE_TICK_MS / ANALYZE_ESTIMATE_MS, 0.95));
      }, ANALYZE_TICK_MS);
      try {
        const res = await fetch(`${API}/api/game/${data.game_id}/analyze`, { method: "POST" });
        if (!res.ok) throw new Error(`Analysis failed: ${res.statusText}`);
        const updated = await fetch(`${API}/api/game/${data.game_id}`);
        if (!updated.ok) throw new Error("Failed to reload game after analysis");
        if (!cancelled) setGame(await updated.json());
      } catch (err) {
        if (!cancelled) setAnalyzeError(String(err));
      } finally {
        if (progressInterval.current) { clearInterval(progressInterval.current); progressInterval.current = null; }
        if (!cancelled) {
          setAnalyzeProgress(1);
          if (analysisEndTimerRef.current) clearTimeout(analysisEndTimerRef.current);
          analysisEndTimerRef.current = setTimeout(() => {
            if (!cancelled) { setAnalyzing(false); setAnalyzeProgress(0); }
          }, 400);
        }
      }
    };

    fetch(`${API}/api/game/${gameId}`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data: GameData) => {
        if (cancelled) return;
        setGame(data);
        if (!data.analyzed && data.moves.length > 0) {
          runAutoAnalysis(data);
        }
      })
      .catch(err => { if (!cancelled) setLoadError(String(err)); });

    return () => {
      cancelled = true;
      if (progressInterval.current) { clearInterval(progressInterval.current); progressInterval.current = null; }
    };
  }, [gameId]);

  // FIX M7 — keyboard navigation: empty dep array, reads game via gameRef
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const g = gameRef.current;
      if (e.key === "ArrowLeft")  setCurrentPly(p => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setCurrentPly(p => Math.min(g?.moves.length ?? 0, p + 1));
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // empty dep array — reads game via ref

  // FIX 4 — scroll active row into view when currentPly changes
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentPly]);

  // runAnalysis — manual fallback (button click)
  // FIX 1: all setState calls guarded by isMountedRef
  // FIX 2: reload response checked with .ok before parsing
  async function runAnalysis() {
    if (!isMountedRef.current) return;
    setAnalyzing(true);
    setAnalyzeProgress(0);
    setAnalyzeError(null);
    progressInterval.current = setInterval(() => {
      if (!isMountedRef.current) return;
      setAnalyzeProgress((p) => Math.min(p + ANALYZE_TICK_MS / ANALYZE_ESTIMATE_MS, 0.95));
    }, ANALYZE_TICK_MS);
    try {
      const res = await fetch(`${API}/api/game/${gameId}/analyze`, { method: "POST" });
      if (!res.ok) throw new Error(`Analysis failed: ${res.statusText}`);
      const updated = await fetch(`${API}/api/game/${gameId}`);
      if (!updated.ok) throw new Error(`Reload failed: ${updated.statusText}`);
      if (!isMountedRef.current) return;
      setGame(await updated.json());
    } catch (err) {
      console.error(err);
      if (!isMountedRef.current) return;
      setAnalyzeError(err instanceof Error ? err.message : String(err));
    } finally {
      if (progressInterval.current) { clearInterval(progressInterval.current); progressInterval.current = null; }
      if (!isMountedRef.current) return;
      setAnalyzeProgress(1);
      // FIX M6 — store the end timer in a ref so it can be cancelled on unmount
      if (analysisEndTimerRef.current) clearTimeout(analysisEndTimerRef.current);
      analysisEndTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setAnalyzing(false);
        setAnalyzeProgress(0);
      }, 400);
    }
  }

  function getFenAtPly(moves: MoveRecord[], ply: number): string {
    const chess = new Chess();
    let lastValidFen = chess.fen();
    for (let i = 0; i < ply; i++) {
      try { chess.move(moves[i].san); lastValidFen = chess.fen(); }
      catch { break; }
    }
    return lastValidFen;
  }

  // FIX 9 — load error and loading states
  if (loadError) return <div className="dim mono" style={{ paddingTop: 40 }}>Failed to load game. {loadError}</div>;
  if (!game) return <div className="dim mono" style={{ paddingTop: 40 }}>Loading…</div>;

  const fen = getFenAtPly(game.moves, currentPly);
  const currentMove = currentPly > 0 ? game.moves[currentPly - 1] : null;
  const YOU = game.player_color as "white" | "black";
  const OPP = YOU === "white" ? "black" : "white";
  const accuracy    = game.analyzed ? computeAccuracy(game.moves, YOU) : null;
  const oppAccuracy = game.analyzed ? computeAccuracy(game.moves, OPP) : null;
  const YOUR_TINT = "rgba(201, 168, 76, 0.06)";

  // group into pairs
  const pairs: Array<{ n: number; white: MoveRecord | null; black: MoveRecord | null }> = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    pairs.push({ n: i / 2 + 1, white: game.moves[i] ?? null, black: game.moves[i + 1] ?? null });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-bright)" }}>
          Game Review
        </h2>
        <span className="mono dim" style={{ fontSize: 13 }}>Result: {game.result}</span>
        <span className="mono dim" style={{ fontSize: 13, textTransform: "capitalize" }}>Playing as: {YOU}</span>

        {/* FIX 8 — show analyze error */}
        {analyzeError && (
          <span style={{ fontSize: 12, color: "var(--blunder)", fontFamily: "var(--font-mono)" }}>
            {analyzeError}
          </span>
        )}

        {/* Manual fallback: show button when not analyzed (and not currently running) */}
        {!game.analyzed && (
          <div>
            <button onClick={runAnalysis} disabled={analyzing} className={analyzing ? "" : "primary"}>
              {analyzing ? "Analyzing…" : "Run Analysis"}
            </button>
            {/* FIX 6 — progress bar with reassuring text */}
            {analyzing && (
              <div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>
                  Analyzing with Stockfish…
                </div>
                <div className="progress-track" style={{ marginTop: 0 }}>
                  <div className="progress-fill" style={{ width: `${Math.round(analyzeProgress * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accuracy panel */}
      {accuracy && oppAccuracy && (() => {
        const overallPct = Math.round((accuracy.pct + oppAccuracy.pct) / 2);
        const { label: overallLabel, color: overallColor } = grade(overallPct);

        function RatingCol({ label, sublabel, acc, isYou }: {
          label: string; sublabel?: string;
          acc: { pct: number; counts: Record<string,number>; n: number };
          isYou?: boolean;
        }) {
          const { pct, counts, n } = acc;
          const { label: gradeLabel, color } = grade(pct);
          const perfElo = estimateElo(pct);
          return (
            <div style={{ flex: 1, minWidth: 160, padding: "12px 16px", background: isYou ? "rgba(201,168,76,0.05)" : undefined, borderRadius: "var(--radius)" }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: isYou ? "var(--gold)" : "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                {label}{sublabel && <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>{sublabel}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 32, color, lineHeight: 1 }}>{pct}%</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--gold)", lineHeight: 1 }}>~{perfElo}</span>
              </div>
              <div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 6 }}>{gradeLabel}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(["best","good","inaccuracy","mistake","blunder"] as const).map(k => {
                  const c = counts[k] ?? 0;
                  if (c === 0) return null;
                  return (
                    <span key={k} style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      <span style={{ color: COLORS[k], fontWeight: 600 }}>{c}</span>
                      <span style={{ color: "var(--text-dim)" }}> {k}</span>
                    </span>
                  );
                })}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>({n})</span>
              </div>
            </div>
          );
        }

        return (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: "4px 8px",
            display: "flex", gap: 0, flexWrap: "wrap",
          }}>
            <RatingCol label="You" acc={accuracy} isYou />
            <div style={{ width: 1, background: "var(--border)", margin: "12px 0" }} />
            <RatingCol label="Opponent" sublabel={`(${game.engine_elo < 1320 ? "~" : ""}${game.engine_elo} elo)`} acc={oppAccuracy} />
            <div style={{ width: 1, background: "var(--border)", margin: "12px 0" }} />
            <div style={{ flex: 1, minWidth: 120, padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Overall</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 32, color: overallColor, lineHeight: 1, marginBottom: 4 }}>{overallPct}%</div>
              <div style={{ fontSize: 12, color: overallColor, fontWeight: 600 }}>{overallLabel}</div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Board + nav */}
        <div style={{ flexShrink: 0 }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: YOU,
              boardStyle: { width: boardSize, height: boardSize, borderRadius: "var(--radius)" },
              darkSquareStyle: { backgroundColor: boardTheme.dark },
              lightSquareStyle: { backgroundColor: boardTheme.light },
              allowDragging: false,
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
            {[
              { label: "|‹", action: () => setCurrentPly(0),                       disabled: currentPly === 0 },
              { label: "‹",  action: () => setCurrentPly((p) => Math.max(0, p-1)), disabled: currentPly === 0 },
              { label: "›",  action: () => setCurrentPly((p) => Math.min(game.moves.length, p+1)), disabled: currentPly === game.moves.length },
              { label: "›|", action: () => setCurrentPly(game.moves.length),        disabled: currentPly === game.moves.length },
            ].map(({ label, action, disabled }) => (
              <button key={label} onClick={action} disabled={disabled} style={{ padding: "5px 12px", fontFamily: "var(--font-mono)" }}>
                {label}
              </button>
            ))}
            <span className="mono dim" style={{ fontSize: 11, marginLeft: 4 }}>
              {currentPly} / {game.moves.length}
            </span>
          </div>
        </div>

        {/* Sidebar: legend + current move callout + moves table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
            {LEGEND.map(({ key, label, desc }) => (
              <span key={key} title={desc} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "default", fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[key], display: "inline-block", flexShrink: 0 }} />
                <span style={{ color: COLORS[key], fontFamily: "var(--font-mono)" }}>{label}</span>
              </span>
            ))}
          </div>

          {/* Current move callout */}
          {currentMove ? (
            <div style={{ padding: "8px 12px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: 13 }}>
              <span className="dim mono" style={{ fontSize: 11, marginRight: 8 }}>
                {Math.ceil(currentPly / 2)}{currentPly % 2 === 1 ? "." : "…"}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: currentMove.classification ? COLORS[currentMove.classification] : "var(--text-bright)",
                fontSize: 15,
              }}>
                {currentMove.san}
              </span>
              {currentMove.classification && (
                <span style={{ marginLeft: 10, color: COLORS[currentMove.classification], fontSize: 12 }}>
                  {currentMove.classification}
                </span>
              )}
              {/* FIX 7 — show best_uci for non-best/good moves */}
              {currentMove.best_uci && currentMove.classification &&
               !["best","good"].includes(currentMove.classification) && (
                <span style={{ marginLeft: 12, color: "var(--best)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  Best: {currentMove.best_uci.slice(0,2)}→{currentMove.best_uci.slice(2,4)}
                  {currentMove.best_uci.length > 4 ? `=${currentMove.best_uci[4].toUpperCase()}` : ""}
                </span>
              )}
            </div>
          ) : (
            <div style={{ padding: "8px 12px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              Starting position
            </div>
          )}

          {/* Move table */}
          <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)" }}>
            <table className="move-table">
              <colgroup>
                <col style={{ width: 32 }} />
                <col style={{ width: "calc(50% - 16px)" }} />
                <col style={{ width: "calc(50% - 16px)" }} />
              </colgroup>
              <thead style={{ position: "sticky", top: 0, background: "var(--raised)" }}>
                <tr>
                  <th style={{ textAlign: "right", paddingRight: 8 }}>#</th>
                  <th style={{ background: YOU === "white" ? YOUR_TINT : undefined }}>
                    White {YOU === "white" && <span style={{ color: "var(--gold)", fontSize: 9 }}>(you)</span>}
                  </th>
                  <th style={{ background: YOU === "black" ? YOUR_TINT : undefined }}>
                    Black {YOU === "black" && <span style={{ color: "var(--gold)", fontSize: 9 }}>(you)</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* FIX 4 — attach activeRowRef to the row containing currentPly */}
                {pairs.map(({ n, white, black }) => (
                  <tr key={n} ref={Math.ceil(currentPly / 2) === n ? activeRowRef : null}>
                    <td className="move-num">{n}.</td>
                    <MoveCell m={white} currentPly={currentPly} setCurrentPly={setCurrentPly} you={YOU} yourTint={YOUR_TINT} />
                    <MoveCell m={black} currentPly={currentPly} setCurrentPly={setCurrentPly} you={YOU} yourTint={YOUR_TINT} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
