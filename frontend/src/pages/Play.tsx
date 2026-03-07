// frontend/src/pages/Play.tsx
import { useState, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { HINT_DISPLAY_MS, REPLY_DISPLAY_MS, EVAL_DISPLAY_MS, BEST_FLASH_MS, ENGINE_MOVE_MIN_MS } from "../config";
import { useBoardTheme } from "../themes";

const API = "http://localhost:8000";

interface PlayProps {
  onGameEnd: (gameId: number) => void;
}

interface GameState {
  gameId: number;
  fen: string;
  playerColor: "white" | "black";
  engineElo: number;
  gameOver: boolean;
  result: string | null;
  evalCp: number | null;
  lastMoveDelta: number | null;
  assisted: boolean;
}

// Skill Level options: values must match _SKILL_BY_ELO keys in engine.py
// UCI ELO options: Stockfish supports 1320–3190; every value here is directly honoured
const ELO_OPTIONS: Array<{ value: number; label: string; mode: "skill" | "uci"; skill?: number }> = [
  { value:  800, label:  "~800", mode: "skill", skill: 0 },
  { value: 1000, label: "~1000", mode: "skill", skill: 3 },
  { value: 1150, label: "~1150", mode: "skill", skill: 6 },
  { value: 1300, label: "~1300", mode: "skill", skill: 9 },
  { value: 1320, label:  "1320", mode: "uci" },
  { value: 1500, label:  "1500", mode: "uci" },
  { value: 1700, label:  "1700", mode: "uci" },
  { value: 1900, label:  "1900", mode: "uci" },
  { value: 2100, label:  "2100", mode: "uci" },
  { value: 2300, label:  "2300", mode: "uci" },
  { value: 2500, label:  "2500", mode: "uci" },
  { value: 2700, label:  "2700", mode: "uci" },
  { value: 2900, label:  "2900", mode: "uci" },
];

function engineModeTag(elo: number): string {
  const opt = ELO_OPTIONS.find(o => o.value === elo);
  if (opt?.mode === "skill") return `Skill ${opt.skill}/20`;
  return "UCI ELO";
}

export default function Play({ onGameEnd }: PlayProps) {
  const boardTheme = useBoardTheme();
  const [state, setState]             = useState<GameState | null>(null);
  const [loading, setLoading]         = useState(false);
  const [colorChoice, setColorChoice] = useState<"white" | "black">("white");
  const [eloChoice, setEloChoice]     = useState(1500);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [hintMove, setHintMove] = useState<{ from_sq: string; to_sq: string } | null>(null);
  const [hintError, setHintError] = useState(false);
  const [replyFen, setReplyFen] = useState<string | null>(null);
  const [replyMove, setReplyMove] = useState<{ from_sq: string; to_sq: string } | null>(null);
  const [replyError, setReplyError] = useState(false);
  const [prevFen, setPrevFen] = useState<string | null>(null);
  const [lastPlayerUci, setLastPlayerUci] = useState<string | null>(null);
  const [prevBest, setPrevBest] = useState<{ from_sq: string; to_sq: string } | null>(null);
  const [prevBestError, setPrevBestError] = useState(false);
  const [bestFlash, setBestFlash] = useState(false);

  async function startGame() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_color: colorChoice, engine_elo: eloChoice }),
      });
      const data = await res.json();
      setState({
        gameId: data.game_id,
        fen: data.fen,
        playerColor: colorChoice,
        engineElo: eloChoice,
        gameOver: false,
        result: null,
        evalCp: null,
        lastMoveDelta: null,
        assisted: false,
      });
    } finally {
      setLoading(false);
    }
  }

  const onDrop = useCallback(
    ({ piece, sourceSquare, targetSquare }: {
      piece: { isSparePiece: boolean; position: string; pieceType: string };
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!state || state.gameOver || loading || !targetSquare) return false;
      const isPawn = piece.pieceType.endsWith("P");
      const isPromotion =
        isPawn &&
        ((piece.pieceType.startsWith("w") && targetSquare[1] === "8") ||
          (piece.pieceType.startsWith("b") && targetSquare[1] === "1"));
      makeMove(sourceSquare + targetSquare + (isPromotion ? "q" : ""));
      return true;
    },
    [state, loading]
  );

  const onSquareClick = useCallback(
    ({ square, piece }: { square: string; piece?: { pieceType: string } | null }) => {
      if (!state || state.gameOver || loading) return;
      if (selectedSquare) {
        const chess = new Chess(state.fen);
        const movingPiece = chess.get(selectedSquare as any);
        const isPromotion =
          movingPiece?.type === "p" &&
          ((movingPiece.color === "w" && square[1] === "8") ||
            (movingPiece.color === "b" && square[1] === "1"));
        setSelectedSquare(null);
        makeMove(selectedSquare + square + (isPromotion ? "q" : ""));
      } else if (piece) {
        const isPlayerPiece =
          (state.playerColor === "white" && piece.pieceType.startsWith("w")) ||
          (state.playerColor === "black" && piece.pieceType.startsWith("b"));
        if (isPlayerPiece) setSelectedSquare(square);
      }
    },
    [state, loading, selectedSquare]
  );

  async function requestHint() {
    if (!state || loading) return;
    setHintError(false);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/hint`);
      if (res.ok) {
        const data = await res.json();
        setHintMove(data);
        setTimeout(() => setHintMove(null), HINT_DISPLAY_MS);
        if (!state.gameOver) setState((s) => s ? { ...s, assisted: true } : s);
      } else {
        setHintError(true);
      }
    } catch {
      setHintError(true);
    } finally {
      setLoading(false);
    }
  }

  async function requestPrevBest() {
    if (!prevFen || loading) return;
    setPrevBestError(false);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/engine/best`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: prevFen }),
      });
      if (res.ok) {
        const data = await res.json();
        const engineUci = data.from_sq + data.to_sq;
        if (engineUci === lastPlayerUci) {
          setBestFlash(true);
          setTimeout(() => setBestFlash(false), BEST_FLASH_MS + 100);
        } else {
          setPrevBest(data);
          setTimeout(() => setPrevBest(null), EVAL_DISPLAY_MS);
        }
      } else {
        setPrevBestError(true);
      }
    } catch {
      setPrevBestError(true);
    } finally {
      setLoading(false);
    }
  }

  async function requestReply() {
    if (!replyFen || loading) return;
    setReplyError(false);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/engine/best`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: replyFen }),
      });
      if (res.ok) {
        setReplyMove(await res.json());
        setTimeout(() => setReplyMove(null), REPLY_DISPLAY_MS);
      } else {
        setReplyError(true);
      }
    } catch {
      setReplyError(true);
    } finally {
      setLoading(false);
    }
  }

  async function makeMove(uci: string) {
    if (!state) return;
    setHintMove(null);
    setReplyMove(null);
    setReplyError(false);
    setPrevBest(null);
    setPrevBestError(false);
    setBestFlash(false);
    const fenBeforeMove = state.fen;
    const chess = new Chess(state.fen);
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return;
    }
    const fenAfterPlayerMove = chess.fen();
    setPrevFen(fenBeforeMove);
    setLastPlayerUci(uci.slice(0, 4));
    setReplyFen(fenAfterPlayerMove);
    setState((s) => s ? { ...s, fen: chess.fen() } : s);

    const evalBeforeMove = state.evalCp;
    setLoading(true);
    const moveStart = Date.now();
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uci }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.engine_move) {
        const elapsed = Date.now() - moveStart;
        const remaining = Math.max(0, ENGINE_MOVE_MIN_MS - elapsed);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      }
      const newEval: number | null = data.eval_cp ?? null;
      let lastMoveDelta: number | null = null;
      if (evalBeforeMove !== null && newEval !== null) {
        lastMoveDelta = state.playerColor === "white"
          ? newEval - evalBeforeMove
          : evalBeforeMove - newEval;
      }
      setState((s) =>
        s ? { ...s, fen: data.fen, evalCp: newEval, lastMoveDelta, gameOver: data.game_over, result: data.result ?? null } : s
      );
    } finally {
      setLoading(false);
    }
  }

  async function resign() {
    if (!state || state.gameOver || loading) return;
    const res = await fetch(`${API}/api/game/${state.gameId}/resign`, { method: "POST" });
    const data = await res.json();
    setState((s) => (s ? { ...s, gameOver: true, result: data.result } : s));
  }

  async function abort() {
    if (!state) return;
    await fetch(`${API}/api/game/${state.gameId}/abort`, { method: "POST" });
    setSelectedSquare(null);
    setHintMove(null);
    setHintError(false);
    setReplyFen(null);
    setReplyMove(null);
    setReplyError(false);
    setPrevFen(null);
    setLastPlayerUci(null);
    setPrevBest(null);
    setPrevBestError(false);
    setBestFlash(false);
    setState(null);
  }

  function fmt(cp: number) {
    return cp > 0 ? `+${(cp / 100).toFixed(2)}` : (cp / 100).toFixed(2);
  }

  const sidebarStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingTop: 4,
    minWidth: 180,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-dim)",
    marginBottom: 2,
  };

  // ── Setup screen ─────────────────────────────────────────
  if (!state) {
    return (
      <div style={{ maxWidth: 340 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-bright)", marginBottom: 24 }}>
          New Game
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 28 }}>
          <div>
            <div style={labelStyle}>Play as</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["white", "black"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setColorChoice(c)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    background: colorChoice === c ? "var(--gold)" : "var(--raised)",
                    borderColor: colorChoice === c ? "var(--gold)" : "var(--border-hi)",
                    color: colorChoice === c ? "#0e0f13" : "var(--text)",
                    fontWeight: colorChoice === c ? 600 : 400,
                    textTransform: "capitalize",
                  }}
                >
                  {c === "white" ? "♔ White" : "♚ Black"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={labelStyle}>Engine strength</div>
            <select
              value={eloChoice}
              onChange={(e) => setEloChoice(Number(e.target.value))}
              style={{
                width: "100%",
                background: "var(--raised)",
                border: "1px solid var(--border-hi)",
                color: "var(--text)",
                borderRadius: "var(--radius)",
                padding: "8px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <optgroup label="Skill Level (approximate)">
                {ELO_OPTIONS.filter(o => o.mode === "skill").map(o => (
                  <option key={o.value} value={o.value}>{o.label} — Skill {o.skill}/20</option>
                ))}
              </optgroup>
              <optgroup label="UCI ELO (calibrated)">
                {ELO_OPTIONS.filter(o => o.mode === "uci").map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            </select>
            {(() => {
              const opt = ELO_OPTIONS.find(o => o.value === eloChoice);
              return (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", marginTop: 5 }}>
                  {opt?.mode === "skill"
                    ? `Skill ${opt.skill}/20 · move randomization, not calibrated`
                    : "calibrated strength · directly set in Stockfish"}
                </div>
              );
            })()}
          </div>
        </div>

        <button className="primary" onClick={startGame} disabled={loading} style={{ width: "100%", padding: "10px 0", fontSize: 14 }}>
          {loading ? "Starting…" : "Start Game"}
        </button>
      </div>
    );
  }

  // ── Active game ──────────────────────────────────────────
  const evalPos = state.evalCp !== null
    ? (state.playerColor === "white" ? state.evalCp : -state.evalCp)
    : null;

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0 }}>
        <Chessboard
          options={{
            position: state.fen,
            onPieceDrop: onDrop,
            onSquareClick: onSquareClick,
            boardOrientation: state.playerColor,
            boardStyle: { width: 500, height: 500, borderRadius: "var(--radius)" },
            darkSquareStyle: { backgroundColor: boardTheme.dark },
            lightSquareStyle: { backgroundColor: boardTheme.light },
            squareStyles: {
              ...(selectedSquare ? { [selectedSquare]: { backgroundColor: "rgba(201, 168, 76, 0.4)" } } : {}),
              ...(hintMove ? {
                [hintMove.from_sq]: { backgroundColor: "rgba(56,142,255,0.70)", boxShadow: "inset 0 0 0 3px rgba(56,142,255,0.95)" },
                [hintMove.to_sq]:   { backgroundColor: "rgba(56,142,255,0.50)", boxShadow: "inset 0 0 0 3px rgba(56,142,255,0.75)" },
              } : {}),
              ...(replyMove ? {
                [replyMove.from_sq]: { backgroundColor: "rgba(72,200,120,0.65)", boxShadow: "inset 0 0 0 3px rgba(72,200,120,0.90)" },
                [replyMove.to_sq]:   { backgroundColor: "rgba(72,200,120,0.45)", boxShadow: "inset 0 0 0 3px rgba(72,200,120,0.70)" },
              } : {}),
              ...(prevBest ? {
                [prevBest.from_sq]: { backgroundColor: "rgba(168,100,255,0.65)", boxShadow: "inset 0 0 0 3px rgba(168,100,255,0.90)" },
                [prevBest.to_sq]:   { backgroundColor: "rgba(168,100,255,0.45)", boxShadow: "inset 0 0 0 3px rgba(168,100,255,0.70)" },
              } : {}),
            },
          }}
        />
      </div>

      <div style={sidebarStyle}>
        {/* Game info */}
        <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={labelStyle}>Playing as</div>
          <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-bright)", textTransform: "capitalize" }}>
            {state.playerColor}
          </div>
          <div style={{ ...labelStyle, marginTop: 10 }}>Engine</div>
          <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-bright)" }}>
            {state.engineElo < 1320 ? "~" : ""}{state.engineElo}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>
            {engineModeTag(state.engineElo)}
          </div>
        </div>

        {/* Eval */}
        {evalPos !== null && (
          <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            <div style={labelStyle}>Position</div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              color: evalPos >= 0 ? "var(--win)" : "var(--loss)",
              fontWeight: 500,
            }}>
              {fmt(evalPos)}
            </div>
            {state.lastMoveDelta !== null && (
              <>
                <div style={{ ...labelStyle, marginTop: 10 }}>Last move</div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  color: state.lastMoveDelta >= 0 ? "var(--win)" : "var(--loss)",
                }}>
                  {fmt(state.lastMoveDelta)}
                </div>
              </>
            )}
          </div>
        )}

        {/* Show Best — available during game and after */}
        <button onClick={requestHint} disabled={loading} title="Show best move (Stockfish full strength)">
          {hintMove ? "Hint shown ↑" : "Show Best"}
        </button>
        {hintMove && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(56,142,255,0.9)" }}>
            {hintMove.from_sq} → {hintMove.to_sq}
          </div>
        )}
        {hintError && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)" }}>
            hint unavailable
          </div>
        )}

        {/* Evaluate last move — retrospective on player's last move; not assisted */}
        {prevFen && !state.gameOver && (
          <>
            <button onClick={requestPrevBest} disabled={loading} title="Show what you should have played instead of your last move">
              {prevBest ? "Evaluated ↑" : "Evaluate last move"}
            </button>
            {bestFlash && <span className="best-flash">★ Best!</span>}
            {prevBest && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(168,100,255,0.9)" }}>
                {prevBest.from_sq} → {prevBest.to_sq}
              </div>
            )}
            {prevBestError && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)" }}>
                unavailable
              </div>
            )}
          </>
        )}

        {/* Best opponent reply — show engine's response to player's last move; not assisted */}
        {replyFen && !state.gameOver && (
          <>
            <button onClick={requestReply} disabled={loading} title="Show best engine reply to your last move (not counted as assisted)">
              {replyMove ? "Opponent reply shown ↑" : "Best opponent reply"}
            </button>
            {replyMove && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(72,200,120,0.9)" }}>
                {replyMove.from_sq} → {replyMove.to_sq}
              </div>
            )}
            {replyError && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)" }}>
                reply unavailable
              </div>
            )}
          </>
        )}

        {/* Status / actions */}
        {state.gameOver ? (
          <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            <div style={labelStyle}>Game over</div>
            <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-bright)", marginBottom: state.assisted ? 6 : 12 }}>
              {state.result}
            </div>
            {state.assisted && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
                assisted
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button className="primary" onClick={() => onGameEnd(state!.gameId)}>Review Game</button>
              <button onClick={() => setState(null)}>New Game</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={resign} disabled={loading}>Resign</button>
            <button className="danger-ghost" onClick={abort}>Abort</button>
          </div>
        )}

        {loading && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>
            engine thinking…
          </div>
        )}
      </div>
    </div>
  );
}
