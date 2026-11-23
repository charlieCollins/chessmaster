// frontend/src/pages/Home.tsx
import { useState, useEffect, useRef } from "react";
import { API } from "../config";
import GameIdBadge from "../components/GameIdBadge";
import { type EngineKind, opponentLabel } from "../opponents";

interface GameRow {
  game_id: number;
  public_id: string | null;
  result: string;
  player_color: "white" | "black";
  engine_elo: number;
  engine: EngineKind;
  played_at: string | null;
  analyzed: boolean;
  assisted: boolean;
  move_count: number;
  accuracy: number | null;
}

interface Stats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  accuracy: number | null;
  move_counts: Record<string, number>;
  analyzed_games: number;
}

interface HomeProps {
  onPlay: () => void;
  onReview: (gameId: number) => void;
}

function playerOutcome(g: GameRow): "Win" | "Loss" | "Draw" {
  if (g.result === "1/2-1/2") return "Draw";
  if ((g.player_color === "white" && g.result === "1-0") ||
      (g.player_color === "black" && g.result === "0-1")) return "Win";
  return "Loss";
}

// Fixed footprint for the Delete / Yes·No cell so confirming doesn't resize the table
const DELETE_CELL_WIDTH = 92;
const DELETE_BTN: React.CSSProperties = { padding: "3px 0", fontSize: 11, minWidth: 0, textAlign: "center" };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function Home({ onPlay, onReview }: HomeProps) {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [games, setGames]   = useState<GameRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const deleteErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reload() {
    return Promise.all([
      fetch(`${API}/api/stats`).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
      fetch(`${API}/api/games`).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
    ]).then(([s, g]) => { setStats(s); setGames(g); });
  }

  useEffect(() => {
    reload()
      .then(() => setLoading(false))
      .catch(() => {
        setLoading(false);
        setLoadError("Could not connect to server. Is the backend running?");
      });
  }, []);

  useEffect(() => {
    return () => { if (deleteErrorTimerRef.current) clearTimeout(deleteErrorTimerRef.current); };
  }, []);

  async function deleteGame(gameId: number) {
    try {
      const res = await fetch(`${API}/api/game/${gameId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
      reload().catch(() => {
        setDeleteError("Game deleted but list failed to refresh. Please reload.");
        if (deleteErrorTimerRef.current) clearTimeout(deleteErrorTimerRef.current);
        deleteErrorTimerRef.current = setTimeout(() => setDeleteError(null), 4000);
      });
    } catch {
      setDeleteError("Failed to delete game. Please try again.");
      if (deleteErrorTimerRef.current) clearTimeout(deleteErrorTimerRef.current);
      deleteErrorTimerRef.current = setTimeout(() => setDeleteError(null), 3000);
    }
  }

  const MOVE_COLORS: Record<string, string> = {
    best: "var(--best)", good: "var(--good)",
    inaccuracy: "var(--inaccuracy)", mistake: "var(--mistake)", blunder: "var(--blunder)",
  };

  if (loading) {
    return <div className="dim mono" style={{ paddingTop: 64, textAlign: "center" }}>Loading…</div>;
  }
  if (!stats || !games) return (
    <div>
      {loadError && <div style={{ color: "var(--loss)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{loadError}</div>}
    </div>
  );

  const s = stats;
  const g = games;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

      {/* Load error */}
      {loadError && (
        <div style={{ padding: "12px 16px", background: "rgba(224,90,90,0.08)", border: "1px solid var(--loss)", borderRadius: "var(--radius)", color: "var(--loss)", fontFamily: "var(--font-mono)", fontSize: 12, marginBottom: 16 }}>
          {loadError}
        </div>
      )}

      {/* CTA */}
      <div>
        <button className="primary" onClick={onPlay} style={{ fontSize: 15, padding: "10px 28px" }}>
          ▶ New Game
        </button>
      </div>

      {/* Stats */}
      <section>
        <div className="section-label">Record</div>
        <div className="stat-grid">
          <div className="stat-cell">
            <div className="stat-value">{s.total}</div>
            <div className="stat-label">Played</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value" style={{ color: "var(--win)" }}>{s.wins}</div>
            <div className="stat-label">Wins</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value" style={{ color: "var(--loss)" }}>{s.losses}</div>
            <div className="stat-label">Losses</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value" style={{ color: "var(--draw)" }}>{s.draws}</div>
            <div className="stat-label">Draws</div>
          </div>
          <div className="stat-cell">
            <div className="stat-value" style={{ color: "var(--gold)" }}>
              {s.accuracy !== null ? `${s.accuracy}%` : "—"}
            </div>
            <div className="stat-label">Accuracy</div>
          </div>
        </div>

        {/* Move breakdown */}
        {s.analyzed_games > 0 && Object.keys(s.move_counts).length > 0 && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, marginTop: 4 }}>
            {(["best", "good", "inaccuracy", "mistake", "blunder"] as const).map((k) =>
              s.move_counts[k] ? (
                <span key={k} style={{ color: MOVE_COLORS[k], fontFamily: "var(--font-mono)" }}>
                  {s.move_counts[k]} <span style={{ color: "var(--text-dim)" }}>{k}</span>
                </span>
              ) : null
            )}
            <span className="dim mono">
              from {s.analyzed_games} analyzed game{s.analyzed_games !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </section>

      {/* Game history */}
      <section>
        <div className="section-label">Game History</div>

        {deleteError && (
          <div style={{
            marginBottom: 8, padding: "6px 12px", borderRadius: 4,
            background: "var(--danger-dim, rgba(220,50,50,0.15))",
            color: "var(--loss)", fontSize: 13, fontFamily: "var(--font-mono)",
          }}>
            {deleteError}
          </div>
        )}

        {g.length === 0 ? (
          <div className="empty-state">
            No completed games yet.<br />
            <span style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8, display: "block" }}>
              Resigned or aborted games don't count — finish a game to see it here.
            </span>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Color</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>Moves</th>
                <th>Accuracy</th>
                <th>Analyzed</th>
                <th title="Used Show Best hint">Hint</th>
                <th></th>
                <th style={{ width: DELETE_CELL_WIDTH }}></th>
              </tr>
            </thead>
            <tbody>
              {g.map((row) => {
                const outcome = playerOutcome(row);
                const outcomeColor =
                  outcome === "Win" ? "var(--win)" :
                  outcome === "Loss" ? "var(--loss)" : "var(--draw)";
                return (
                  <tr key={row.game_id}>
                    <td><GameIdBadge id={row.public_id} size={11} /></td>
                    <td className="mono dim">{fmtDate(row.played_at)}</td>
                    <td style={{ textTransform: "capitalize" }}>{row.player_color}</td>
                    <td className="mono">{opponentLabel(row.engine, row.engine_elo)}</td>
                    <td style={{ color: outcomeColor, fontWeight: 600 }}>{outcome}</td>
                    <td className="mono dim">{Math.ceil(row.move_count / 2)}</td>
                    <td className="mono dim" style={{ fontSize: 12 }}>{row.accuracy !== null ? `${Math.round(row.accuracy)}%` : "—"}</td>
                    <td className="dim mono" style={{ fontSize: 12 }}>
                      {row.analyzed ? "✓" : "—"}
                    </td>
                    <td className="dim mono" style={{ fontSize: 12 }} title={row.assisted ? "Used Show Best hint during this game" : ""}>
                      {row.assisted ? "✓" : "—"}
                    </td>
                    <td>
                      <button onClick={() => onReview(row.game_id)} style={{ fontSize: 12, padding: "4px 12px" }}>
                        Review
                      </button>
                    </td>
                    <td style={{ width: DELETE_CELL_WIDTH }}>
                      {/* Both states occupy the same fixed box so the table never reflows */}
                      <div style={{ width: DELETE_CELL_WIDTH, display: "flex", gap: 4 }}>
                        {confirmDeleteId === row.game_id ? (
                          <>
                            <button className="danger-ghost" title="Yes, delete this game"
                              style={{ ...DELETE_BTN, flex: 1, color: "var(--loss)", fontWeight: 600 }}
                              onClick={() => { deleteGame(row.game_id); setConfirmDeleteId(null); }}>
                              Yes
                            </button>
                            <button className="ghost" title="Keep this game"
                              style={{ ...DELETE_BTN, flex: 1 }}
                              onClick={() => setConfirmDeleteId(null)}>
                              No
                            </button>
                          </>
                        ) : (
                          <button className="danger-ghost" title="Delete this game (asks to confirm)"
                            style={{ ...DELETE_BTN, flex: 1 }}
                            onClick={() => setConfirmDeleteId(row.game_id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
