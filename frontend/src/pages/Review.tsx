// frontend/src/pages/Review.tsx
import { useState, useEffect, useRef } from "react";
import { ANALYZE_ESTIMATE_MS, ANALYZE_TICK_MS } from "../config";
import { useBoardTheme } from "../themes";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

const API = "http://localhost:8000";

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

function computeAccuracy(moves: MoveRecord[], playerColor: string) {
  const mine = moves.filter(m => {
    const isWhite = m.ply % 2 === 1;
    return playerColor === "white" ? isWhite : !isWhite;
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
}

interface GameData {
  game_id: number;
  result: string;
  player_color: string;
  analyzed: boolean;
  moves: MoveRecord[];
}

interface ReviewProps {
  gameId: number;
}

export default function Review({ gameId }: ReviewProps) {
  const boardTheme = useBoardTheme();
  const [game, setGame]               = useState<GameData | null>(null);
  const [currentPly, setCurrentPly]   = useState(0);
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setCurrentPly(0); }, [gameId]);

  useEffect(() => {
    fetch(`${API}/api/game/${gameId}`).then((r) => r.json()).then(setGame);
  }, [gameId]);

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeProgress(0);
    progressInterval.current = setInterval(() => {
      setAnalyzeProgress((p) => Math.min(p + ANALYZE_TICK_MS / ANALYZE_ESTIMATE_MS, 0.95));
    }, ANALYZE_TICK_MS);
    try {
      await fetch(`${API}/api/game/${gameId}/analyze`, { method: "POST" });
      const res = await fetch(`${API}/api/game/${gameId}`);
      setGame(await res.json());
    } finally {
      if (progressInterval.current) { clearInterval(progressInterval.current); progressInterval.current = null; }
      setAnalyzeProgress(1);
      setTimeout(() => { setAnalyzing(false); setAnalyzeProgress(0); }, 400);
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

  if (!game) return <div className="dim mono" style={{ paddingTop: 40 }}>Loading…</div>;

  const fen = getFenAtPly(game.moves, currentPly);
  const currentMove = currentPly > 0 ? game.moves[currentPly - 1] : null;
  const YOU = game.player_color as "white" | "black";
  const accuracy = game.analyzed ? computeAccuracy(game.moves, YOU) : null;
  const YOUR_TINT = "rgba(201, 168, 76, 0.06)";

  // group into pairs
  const pairs: Array<{ n: number; white: MoveRecord | null; black: MoveRecord | null }> = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    pairs.push({ n: i / 2 + 1, white: game.moves[i] ?? null, black: game.moves[i + 1] ?? null });
  }

  function MoveCell({ m }: { m: MoveRecord | null }) {
    if (!m) return <td style={{ background: YOU === (m === null && false ? "white" : undefined) ? YOUR_TINT : undefined }} />;
    const active = currentPly === m.ply;
    const isWhite = m.ply % 2 === 1;
    const isYou = YOU === "white" ? isWhite : !isWhite;
    const color = m.classification ? COLORS[m.classification] : "var(--text)";
    return (
      <td style={{ background: isYou ? YOUR_TINT : undefined, padding: "2px 4px" }}>
        <span
          className={`move-cell${active ? " active" : ""}`}
          onClick={() => setCurrentPly(m.ply)}
          style={{ color: active ? "var(--gold)" : color }}
        >
          {m.san}
          {m.classification && m.classification !== "good" && GLYPH[m.classification] && (
            <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.75 }}>{GLYPH[m.classification]}</span>
          )}
        </span>
      </td>
    );
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

        {!game.analyzed && (
          <div>
            <button onClick={runAnalysis} disabled={analyzing} className={analyzing ? "" : "primary"}>
              {analyzing ? "Analyzing…" : "Run Analysis"}
            </button>
            {analyzing && (
              <div className="progress-track" style={{ marginTop: 6 }}>
                <div className="progress-fill" style={{ width: `${Math.round(analyzeProgress * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accuracy panel */}
      {accuracy && (() => {
        const { pct, counts, n } = accuracy;
        const { label, color } = grade(pct);
        const perfElo = estimateElo(pct);
        return (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: "14px 20px",
            display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, color, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginTop: 4, letterSpacing: "0.08em" }}>ACCURACY</div>
            </div>
            <div style={{ textAlign: "center", borderLeft: "1px solid var(--border)", paddingLeft: 28 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "var(--gold)", lineHeight: 1 }}>~{perfElo}</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginTop: 4, letterSpacing: "0.08em" }}>PERFORMANCE</div>
            </div>
            <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
              <div style={{ color, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{label}</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {(["best","good","inaccuracy","mistake","blunder"] as const).map(k => {
                  const c = counts[k] ?? 0;
                  return (
                    <span key={k} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      <span style={{ color: COLORS[k], fontWeight: 600 }}>{c}</span>
                      {" "}<span style={{ color: "var(--text-dim)" }}>{k}</span>
                    </span>
                  );
                })}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>
                  ({n} moves)
                </span>
              </div>
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
              boardStyle: { width: 480, height: 480, borderRadius: "var(--radius)" },
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
                {pairs.map(({ n, white, black }) => (
                  <tr key={n}>
                    <td className="move-num">{n}.</td>
                    <MoveCell m={white} />
                    <MoveCell m={black} />
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
