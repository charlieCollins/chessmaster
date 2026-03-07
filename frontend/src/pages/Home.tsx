// frontend/src/pages/Home.tsx
import { useState, useEffect } from "react";

const API = "http://localhost:8000";

interface GameRow {
  game_id: number;
  result: string;
  player_color: "white" | "black";
  engine_elo: number;
  played_at: string | null;
  analyzed: boolean;
  assisted: boolean;
  move_count: number;
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

  function reload() {
    return Promise.all([
      fetch(`${API}/api/stats`).then((r) => r.json()),
      fetch(`${API}/api/games`).then((r) => r.json()),
    ]).then(([s, g]) => { setStats(s); setGames(g); });
  }

  useEffect(() => {
    reload().then(() => setLoading(false));
  }, []);

  async function deleteGame(gameId: number) {
    await fetch(`${API}/api/game/${gameId}`, { method: "DELETE" });
    reload();
  }

  const MOVE_COLORS: Record<string, string> = {
    best: "var(--best)", good: "var(--good)",
    inaccuracy: "var(--inaccuracy)", mistake: "var(--mistake)", blunder: "var(--blunder)",
  };

  if (loading) {
    return <div className="dim mono" style={{ paddingTop: 64, textAlign: "center" }}>Loading…</div>;
  }

  const s = stats!;
  const g = games!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

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
                <th>Date</th>
                <th>Color</th>
                <th>vs ELO</th>
                <th>Result</th>
                <th>Moves</th>
                <th>Analyzed</th>
                <th title="Used Show Best hint">Hint</th>
                <th></th>
                <th></th>
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
                    <td className="mono dim">{fmtDate(row.played_at)}</td>
                    <td style={{ textTransform: "capitalize" }}>{row.player_color}</td>
                    <td className="mono">{row.engine_elo}</td>
                    <td style={{ color: outcomeColor, fontWeight: 600 }}>{outcome}</td>
                    <td className="mono dim">{Math.ceil(row.move_count / 2)}</td>
                    <td className="dim mono" style={{ fontSize: 12 }}>
                      {row.analyzed ? "✓" : "—"}
                    </td>
                    <td className="dim mono" style={{ fontSize: 12 }} title={row.assisted ? "Used Show Best hint during this game" : ""}>
                      {row.assisted ? "✓" : "—"}
                    </td>
                    <td>
                      <button onClick={() => onReview(row.game_id)} style={{ fontSize: 12, padding: "4px 12px" }}>
                        {row.analyzed ? "Review" : "Review / Analyze"}
                      </button>
                    </td>
                    <td>
                      <button
                        className="danger-ghost"
                        onClick={() => { if (confirm("Delete this game?")) deleteGame(row.game_id); }}
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        title="Delete game"
                      >
                        ✕
                      </button>
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
