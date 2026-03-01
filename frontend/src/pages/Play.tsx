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
}

export default function Play({ onGameEnd }: PlayProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [colorChoice, setColorChoice] = useState<"white" | "black">("white");
  const [eloChoice, setEloChoice] = useState(1500);

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
      });
    } finally {
      setLoading(false);
    }
  }

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece: { isSparePiece: boolean; position: string; pieceType: string }; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!state || state.gameOver || loading) return false;
      if (!targetSquare) return false;

      const chess = new Chess(state.fen);
      const movingPiece = chess.get(sourceSquare as any);
      const isPromotion =
        movingPiece?.type === "p" &&
        ((movingPiece.color === "w" && targetSquare[1] === "8") ||
          (movingPiece.color === "b" && targetSquare[1] === "1"));
      const uci = sourceSquare + targetSquare + (isPromotion ? "q" : "");

      makeMove(uci);
      return true;
    },
    [state, loading]
  );

  async function makeMove(uci: string) {
    if (!state) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uci }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setState((s) =>
        s
          ? {
              ...s,
              fen: data.fen,
              evalCp: data.eval_cp ?? null,
              gameOver: data.game_over,
              result: data.result ?? null,
            }
          : s
      );
      if (data.game_over) {
        onGameEnd(state.gameId);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resign() {
    if (!state || state.gameOver) return;
    const res = await fetch(`${API}/api/game/${state.gameId}/resign`, { method: "POST" });
    const data = await res.json();
    setState((s) => (s ? { ...s, gameOver: true, result: data.result } : s));
    if (state) onGameEnd(state.gameId);
  }

  function evalBar(evalCp: number | null, playerColor: "white" | "black") {
    if (evalCp === null) return null;
    const fromPlayerPov = playerColor === "white" ? evalCp : -evalCp;
    const display =
      fromPlayerPov > 0
        ? `+${(fromPlayerPov / 100).toFixed(2)}`
        : (fromPlayerPov / 100).toFixed(2);
    const color = fromPlayerPov >= 0 ? "#4a9" : "#c55";
    return (
      <span style={{ color, fontWeight: "bold", fontSize: 14 }}>
        Eval: {display}
      </span>
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
              <option value={800}>800 (Beginner)</option>
              <option value={1200}>1200 (Casual)</option>
              <option value={1500}>1500 (Intermediate)</option>
              <option value={2000}>2000 (Strong)</option>
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
              boardOrientation: state.playerColor,
              boardStyle: { width: 500, height: 500 },
            }}
          />
        </div>
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>Playing as: <strong>{state.playerColor}</strong></div>
          <div>Engine ELO: <strong>{state.engineElo}</strong></div>
          {evalBar(state.evalCp, state.playerColor)}
          {state.gameOver ? (
            <div>
              <strong>Game Over</strong> — {state.result}
              <br />
              <button onClick={() => setState(null)} style={{ marginTop: 8 }}>
                New Game
              </button>
            </div>
          ) : (
            <button onClick={resign} disabled={loading} style={{ marginTop: 8 }}>
              Resign
            </button>
          )}
          {loading && (
            <div style={{ color: "#888", fontSize: 12 }}>Engine thinking...</div>
          )}
        </div>
      </div>
    </div>
  );
}
