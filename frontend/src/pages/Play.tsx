// frontend/src/pages/Play.tsx
import { useState, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

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
  lastMoveDelta: number | null;  // eval gained (+) or lost (-) by player's last move
}

export default function Play({ onGameEnd }: PlayProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [colorChoice, setColorChoice] = useState<"white" | "black">("white");
  const [eloChoice, setEloChoice] = useState(1500);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

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

      // piece.pieceType is e.g. "wP" (white pawn) or "bP" (black pawn)
      const isPawn = piece.pieceType.endsWith("P");
      const isPromotion =
        isPawn &&
        ((piece.pieceType.startsWith("w") && targetSquare[1] === "8") ||
          (piece.pieceType.startsWith("b") && targetSquare[1] === "1"));
      const uci = sourceSquare + targetSquare + (isPromotion ? "q" : "");

      makeMove(uci);
      return true;
    },
    [state, loading]
  );

  const onSquareClick = useCallback(
    ({ square, piece }: { square: string; piece?: { pieceType: string } | null }) => {
      if (!state || state.gameOver || loading) return;

      if (selectedSquare) {
        // second click — attempt move
        const uci = selectedSquare + square;
        const chess = new Chess(state.fen);
        const movingPiece = chess.get(selectedSquare as any);
        const isPromotion =
          movingPiece?.type === "p" &&
          ((movingPiece.color === "w" && square[1] === "8") ||
            (movingPiece.color === "b" && square[1] === "1"));
        setSelectedSquare(null);
        makeMove(uci + (isPromotion ? "q" : ""));
      } else if (piece) {
        // first click — select the piece (only player's own pieces)
        const isPlayerPiece =
          (state.playerColor === "white" && piece.pieceType.startsWith("w")) ||
          (state.playerColor === "black" && piece.pieceType.startsWith("b"));
        if (isPlayerPiece) setSelectedSquare(square);
      }
    },
    [state, loading, selectedSquare]
  );

  async function makeMove(uci: string) {
    if (!state) return;

    // Optimistically show the player's move immediately
    const chess = new Chess(state.fen);
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return; // illegal move, bail
    }
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
        const remaining = Math.max(0, 500 - elapsed);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      }
      const newEval: number | null = data.eval_cp ?? null;
      let lastMoveDelta: number | null = null;
      if (evalBeforeMove !== null && newEval !== null) {
        // positive delta = player gained eval (good), negative = lost eval (bad)
        lastMoveDelta = state.playerColor === "white"
          ? newEval - evalBeforeMove
          : evalBeforeMove - newEval;
      }
      setState((s) =>
        s
          ? {
              ...s,
              fen: data.fen,
              evalCp: newEval,
              lastMoveDelta,
              gameOver: data.game_over,
              result: data.result ?? null,
            }
          : s
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
    setState(null);
  }

  function fmt(cp: number) {
    return cp > 0 ? `+${(cp / 100).toFixed(2)}` : (cp / 100).toFixed(2);
  }

  function evalDisplay(evalCp: number | null, lastMoveDelta: number | null, playerColor: "white" | "black") {
    if (evalCp === null) return null;
    const pos = playerColor === "white" ? evalCp : -evalCp;
    const posColor = pos >= 0 ? "#4a9" : "#c55";
    return (
      <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: posColor }}>
          <strong>Position:</strong> {fmt(pos)}
        </span>
        {lastMoveDelta !== null && (
          <span style={{ color: lastMoveDelta >= 0 ? "#4a9" : "#c55" }}>
            <strong>Last move:</strong> {fmt(lastMoveDelta)}
          </span>
        )}
      </div>
    );
  }

  if (!state) {
    return (
      <div>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>New Game</h2>
        <div style={{ marginBottom: 8 }}>
          <label>Play as:{" "}
            <select value={colorChoice} onChange={(e) => setColorChoice(e.target.value as "white" | "black")}>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Engine ELO:{" "}
            <select value={eloChoice} onChange={(e) => setEloChoice(Number(e.target.value))}>
              <option value={400}>400 (Just learning)</option>
              <option value={800}>800 (Novice)</option>
              <option value={1200}>1200 (Intermediate)</option>
              <option value={1500}>1500 (Club player)</option>
              <option value={2000}>2000 (Expert)</option>
            </select>
          </label>
        </div>
        <button onClick={startGame} disabled={loading}>
          {loading ? "Starting..." : "Start Game"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 500 }}>
          <Chessboard
            options={{
              position: state.fen,
              onPieceDrop: onDrop,
              onSquareClick: onSquareClick,
              boardOrientation: state.playerColor,
              boardStyle: { width: 500, height: 500 },
              squareStyles: selectedSquare
                ? { [selectedSquare]: { backgroundColor: "rgba(255, 255, 0, 0.5)" } }
                : {},
            }}
          />
        </div>
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>Playing as: <strong>{state.playerColor}</strong></div>
          <div>Engine ELO: <strong>{state.engineElo}</strong></div>
          {evalDisplay(state.evalCp, state.lastMoveDelta, state.playerColor)}
          {state.gameOver ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <strong>Game Over — {state.result}</strong>
              <button onClick={() => onGameEnd(state!.gameId)}>Review Game</button>
              <button onClick={() => setState(null)}>New Game</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <button onClick={resign} disabled={loading}>Resign</button>
              <button onClick={abort} style={{ color: "#888" }}>Abort</button>
            </div>
          )}
          {loading && (
            <div style={{ color: "#888", fontSize: 12 }}>Engine thinking...</div>
          )}
        </div>
      </div>
    </div>
  );
}
