// frontend/src/pages/Review.tsx
import { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

const API = "http://localhost:8000";

const COLORS: Record<string, string> = {
  blunder: "#c00",
  mistake: "#e60",
  inaccuracy: "#ca0",
  good: "#4a9",
};

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
  const [game, setGame] = useState<GameData | null>(null);
  const [currentPly, setCurrentPly] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setCurrentPly(0);
  }, [gameId]);

  useEffect(() => {
    fetch(`${API}/api/game/${gameId}`)
      .then((r) => r.json())
      .then(setGame);
  }, [gameId]);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      await fetch(`${API}/api/game/${gameId}/analyze`, { method: "POST" });
      const res = await fetch(`${API}/api/game/${gameId}`);
      setGame(await res.json());
    } finally {
      setAnalyzing(false);
    }
  }

  function getFenAtPly(moves: MoveRecord[], ply: number): string {
    const chess = new Chess();
    let lastValidFen = chess.fen();
    for (let i = 0; i < ply; i++) {
      try {
        chess.move(moves[i].san);
        lastValidFen = chess.fen();
      } catch {
        break;
      }
    }
    return lastValidFen;
  }

  if (!game) return <div>Loading...</div>;

  const fen = getFenAtPly(game.moves, currentPly);
  const currentMove = currentPly > 0 ? game.moves[currentPly - 1] : null;

  return (
    <div>
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>
        Game Review — Result: {game.result}
      </h2>

      {!game.analyzed && (
        <button onClick={runAnalysis} disabled={analyzing} style={{ marginBottom: 12 }}>
          {analyzing ? "Analyzing... (this takes ~30s)" : "Run Analysis"}
        </button>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 480 }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: game.player_color as "white" | "black",
              boardStyle: { width: 480, height: 480 },
              allowDragging: false,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setCurrentPly(0)} disabled={currentPly === 0}>
              |&lt;
            </button>
            <button
              onClick={() => setCurrentPly((p) => Math.max(0, p - 1))}
              disabled={currentPly === 0}
            >
              &lt;
            </button>
            <button
              onClick={() => setCurrentPly((p) => Math.min(game.moves.length, p + 1))}
              disabled={currentPly === game.moves.length}
            >
              &gt;
            </button>
            <button
              onClick={() => setCurrentPly(game.moves.length)}
              disabled={currentPly === game.moves.length}
            >
              &gt;|
            </button>
            <span style={{ fontSize: 12, color: "#666", alignSelf: "center" }}>
              Ply {currentPly} / {game.moves.length}
            </span>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {currentMove && (
            <div
              style={{
                marginBottom: 12,
                padding: 8,
                background: "#f5f5f5",
                borderRadius: 4,
              }}
            >
              <div>
                <strong>Move {currentPly}:</strong> {currentMove.san}
              </div>
              {currentMove.classification && (
                <div
                  style={{
                    color: COLORS[currentMove.classification] || "#333",
                    fontWeight: "bold",
                  }}
                >
                  {currentMove.classification.toUpperCase()}
                </div>
              )}
            </div>
          )}

          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {game.moves.map((m, i) => (
              <span
                key={m.ply}
                onClick={() => setCurrentPly(i + 1)}
                style={{
                  display: "inline-block",
                  margin: "2px 4px",
                  padding: "2px 6px",
                  borderRadius: 3,
                  cursor: "pointer",
                  background: currentPly === i + 1 ? "#ddd" : "transparent",
                  color: m.classification ? COLORS[m.classification] : "#333",
                  fontWeight:
                    m.classification && m.classification !== "good"
                      ? "bold"
                      : "normal",
                  fontSize: 13,
                }}
              >
                {m.ply % 2 === 1 ? `${Math.ceil(m.ply / 2)}. ` : ""}
                {m.san}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
