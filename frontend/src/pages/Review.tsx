// frontend/src/pages/Review.tsx
import { useState, useEffect, useRef } from "react";
import { API, ANALYZE_ESTIMATE_MS, ANALYZE_TICK_MS } from "../config";
import { useBoardTheme } from "../themes";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { type EngineKind, opponentLabel } from "../opponents";
import { grade, estimateElo, describeResult, type AccuracySummary } from "../ratings";
import GameIdBadge from "../components/GameIdBadge";
import { showGameLink } from "../links";
import { useBoardBesidePanel, useNarrow } from "../viewport";
import { PageHead, Panel, QualityLegend, StepIcon } from "../ui";
import { QUALITIES } from "../classify";

const COLORS: Record<string, string> = {
  best:        "var(--best)",
  good:        "var(--good)",
  inaccuracy:  "var(--inaccuracy)",
  mistake:     "var(--mistake)",
  blunder:     "var(--blunder)",
};

const GLYPH: Record<string, string> = {
  best: "★", inaccuracy: "?!", mistake: "?", blunder: "??",
};
const QUALITY_NAME: Record<string, string> = {
  best: "Best move", good: "Good move", inaccuracy: "Inaccuracy", mistake: "Mistake", blunder: "Blunder",
};

function RatingCol({ label, acc, accent }: { label: string; acc: AccuracySummary; accent?: boolean }) {
  const pct = Math.round(acc.pct);
  const { label: gradeLabel, color } = grade(pct);
  return (
    <div className="stat" style={accent ? { borderColor: "var(--accent-line)" } : undefined}>
      <div className="stat-label" style={{ marginTop: 0, marginBottom: 4, color: accent ? "var(--accent)" : undefined }}>{label}</div>
      <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
        <span className="stat-value" style={{ color }}>{pct}%</span>
        <span className="small muted" title="A rough estimate from accuracy, not a rating">plays like ≈{estimateElo(pct)}</span>
      </div>
      <div className="small" style={{ color, fontWeight: 500, margin: "2px 0 8px" }}>{gradeLabel}</div>
      <div className="row xsmall muted" style={{ gap: "4px 12px" }}>
        {QUALITIES.map(k => acc.counts[k] ? (
          <span key={k}><b style={{ color: COLORS[k] }}>{acc.counts[k]}</b> {k}</span>
        ) : null)}
      </div>
    </div>
  );
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
  public_id: string | null;
  result: string;
  player_color: string;
  engine_elo: number;
  engine: EngineKind;
  analyzed: boolean;
  accuracy: { white: AccuracySummary | null; black: AccuracySummary | null } | null;
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
        style={{ color: active ? "var(--accent)" : color }}
      >
        {m.san}
        {m.classification && m.classification !== "good" && GLYPH[m.classification] && (
          <span style={{ fontSize: 11, opacity: 0.8 }}>{GLYPH[m.classification]}</span>
        )}
        {/* Small check for good moves so they look different from unanalysed ones */}
        {m.classification === "good" && (
          <span style={{ fontSize: 10, opacity: 0.6, color: "var(--good)" }}>✓</span>
        )}
      </span>
    </td>
  );
}


export default function Review({ gameId }: ReviewProps) {
  const boardTheme = useBoardTheme();
  const boardSize = useBoardBesidePanel(380, 32, 640);
  const narrow = useNarrow();
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
        if (data.public_id) showGameLink(data.public_id);
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
      if (isMountedRef.current) setAnalyzeError(err instanceof Error ? err.message : String(err));
    } finally {
      if (progressInterval.current) { clearInterval(progressInterval.current); progressInterval.current = null; }
      if (isMountedRef.current) {
        setAnalyzeProgress(1);
        // Store the end timer in a ref so it can be cancelled on unmount
        if (analysisEndTimerRef.current) clearTimeout(analysisEndTimerRef.current);
        analysisEndTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setAnalyzing(false);
          setAnalyzeProgress(0);
        }, 400);
      }
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

  if (loadError) return <p className="error" role="alert" style={{ paddingTop: 40 }}>Couldn't load this game. {loadError}</p>;
  if (!game) return <p className="muted" style={{ paddingTop: 40 }}>Loading the game…</p>;

  const fen = getFenAtPly(game.moves, currentPly);
  const currentMove = currentPly > 0 ? game.moves[currentPly - 1] : null;
  const YOU = game.player_color as "white" | "black";
  const OPP = YOU === "white" ? "black" : "white";
  const accuracy    = game.accuracy?.[YOU] ?? null;
  const oppAccuracy = game.accuracy?.[OPP] ?? null;
  const YOUR_TINT = "rgba(214, 168, 81, 0.05)";
  const { headline } = describeResult(game.result, null, YOU);
  const opp = opponentLabel(game.engine, game.engine_elo);
  const lead = headline === "You won" ? `You beat ${opp} with ${YOU}.`
    : headline === "You lost" ? `You lost to ${opp} with ${YOU}.`
    : headline === "Draw" ? `Drawn with ${opp}, you had ${YOU}.`
    : `Against ${opp}, you had ${YOU}.`;

  // Your inaccuracies, mistakes and blunders, to jump to
  const isYours = (ply: number) => (YOU === "white") === (ply % 2 === 1);
  const yourSlips = game.moves.filter(m => isYours(m.ply) && m.classification &&
    ["inaccuracy", "mistake", "blunder"].includes(m.classification));

  // The engine's move in SAN, from the position before the current move
  let bestSan: string | null = null;
  if (currentMove?.best_uci && currentMove.classification && !["best", "good"].includes(currentMove.classification)) {
    try {
      const u = currentMove.best_uci;
      bestSan = new Chess(getFenAtPly(game.moves, currentPly - 1)).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san;
    } catch { bestSan = currentMove.best_uci; }
  }

  // group into pairs
  const pairs: Array<{ n: number; white: MoveRecord | null; black: MoveRecord | null }> = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    pairs.push({ n: i / 2 + 1, white: game.moves[i] ?? null, black: game.moves[i + 1] ?? null });
  }
  const moveNo = (ply: number) => `${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "…"}`;

  const analysisAction = !game.analyzed && (
    <div className="stack sm" style={{ alignItems: "flex-end" }}>
      <button onClick={runAnalysis} disabled={analyzing} className={analyzing ? undefined : "primary"}>
        {analyzing ? "Checking every move…" : "Analyse this game"}
      </button>
      {analyzing && <div className="progress-track" style={{ marginTop: 0, width: 200 }}>
        <div className="progress-fill" style={{ width: `${Math.round(analyzeProgress * 100)}%` }} />
      </div>}
    </div>
  );

  const nav = (
    <div className="row" style={{ gap: 6, marginTop: 12, justifyContent: narrow ? "center" : "flex-start" }}>
      {[
        { label: <StepIcon dir="first" />, name: "Start", action: () => setCurrentPly(0), disabled: currentPly === 0 },
        { label: <StepIcon dir="prev" />, name: "Previous move", action: () => setCurrentPly(p => Math.max(0, p - 1)), disabled: currentPly === 0 },
        { label: <StepIcon dir="next" />, name: "Next move", action: () => setCurrentPly(p => Math.min(game.moves.length, p + 1)), disabled: currentPly === game.moves.length },
        { label: <StepIcon dir="last" />, name: "End", action: () => setCurrentPly(game.moves.length), disabled: currentPly === game.moves.length },
      ].map(({ label, name, action, disabled }) => (
        <button key={name} onClick={action} disabled={disabled} aria-label={name} title={name} style={{ width: 52, padding: 0 }}>
          {label}
        </button>
      ))}
      <span className="small muted" style={{ marginLeft: 6 }}>Move {Math.ceil(currentPly / 2)} of {Math.ceil(game.moves.length / 2)}</span>
    </div>
  );

  return (
    <div>
      <PageHead
        title="Game review"
        lead={lead}
        actions={<><GameIdBadge id={game.public_id} size={13} />{analysisAction}</>}
      />
      {analyzeError && !game.analyzed && !analyzing && <p className="error" role="alert" style={{ marginTop: -12, marginBottom: 16 }}>The analysis didn't finish. Press “Analyse this game” to try again.</p>}

      {accuracy && oppAccuracy && (
        <div className="stats" style={{ gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", marginBottom: 24 }}>
          <RatingCol label="You" acc={accuracy} accent />
          <RatingCol label={opp} acc={oppAccuracy} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", gap: 32, alignItems: narrow ? "stretch" : "flex-start" }}>
        <div style={{ flexShrink: 0, alignSelf: narrow ? "center" : undefined }}>
          <div className="board-frame">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: YOU,
                boardStyle: { width: boardSize - 12, height: boardSize - 12, borderRadius: 4 },
                darkSquareStyle: { backgroundColor: boardTheme.dark },
                lightSquareStyle: { backgroundColor: boardTheme.light },
                allowDragging: false,
              }}
            />
          </div>
          {nav}
        </div>

        <div className="stack" style={{ flex: 1, minWidth: 0, gap: 12 }}>
          <Panel tight>
            {currentMove ? (
              <div className="row" style={{ gap: "6px 12px" }}>
                <span className="mono muted small">{moveNo(currentPly)}</span>
                <span className="mono" style={{ fontWeight: 600, fontSize: 19,
                  color: currentMove.classification ? COLORS[currentMove.classification] : "var(--text-strong)" }}>
                  {currentMove.san}
                </span>
                {currentMove.classification && (
                  <span className="small" style={{ color: COLORS[currentMove.classification] }}>
                    {QUALITY_NAME[currentMove.classification]}{isYours(currentPly) ? "" : " by the opponent"}
                  </span>
                )}
                {bestSan && (
                  <span className="small" style={{ marginLeft: "auto" }}>
                    <span className="muted">Best was </span>
                    <b className="mono" style={{ color: "var(--best)" }}>{bestSan}</b>
                  </span>
                )}
              </div>
            ) : (
              <span className="muted">Starting position. Step through with the buttons under the board or your arrow keys.</span>
            )}
          </Panel>

          {yourSlips.length > 0 && (
            <div className="panel tight">
              <div className="small" style={{ fontWeight: 600, marginBottom: 8 }}>Your mistakes: jump to one</div>
              <div className="row" style={{ gap: 6 }}>
                {yourSlips.map(m => (
                  <button key={m.ply} className="sm mono" onClick={() => setCurrentPly(m.ply)}
                    aria-current={currentPly === m.ply ? "true" : undefined}
                    style={{ color: COLORS[m.classification!], borderColor: currentPly === m.ply ? "var(--accent)" : undefined }}>
                    {moveNo(m.ply)} {m.san}{GLYPH[m.classification!]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="table-wrap" style={{ maxHeight: narrow ? undefined : Math.max(260, boardSize - 120), overflowY: narrow ? undefined : "auto" }}>
            <table className="move-table">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: "calc(50% - 20px)" }} />
                <col style={{ width: "calc(50% - 20px)" }} />
              </colgroup>
              <thead style={{ position: "sticky", top: 0, background: "var(--raised)" }}>
                <tr>
                  <th></th>
                  <th style={{ background: YOU === "white" ? YOUR_TINT : undefined }}>White{YOU === "white" && <span style={{ color: "var(--accent)" }}> (you)</span>}</th>
                  <th style={{ background: YOU === "black" ? YOUR_TINT : undefined }}>Black{YOU === "black" && <span style={{ color: "var(--accent)" }}> (you)</span>}</th>
                </tr>
              </thead>
              <tbody>
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
          {game.analyzed && <QualityLegend qualities={QUALITIES} />}
        </div>
      </div>
    </div>
  );
}
