// frontend/src/pages/Home.tsx
import { useState, useEffect, useRef } from "react";
import { API } from "../config";
import GameIdBadge from "../components/GameIdBadge";
import { type EngineKind, opponentLabel } from "../opponents";
import { useNarrow } from "../viewport";
import { PageHead, QualityDot, SectionHead, Stat } from "../ui";
import { QUALITIES } from "../classify";

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

/** Review + delete (with a Yes/No confirm in the same footprint, so rows don't reflow). */
function RowActions({ confirming, onReview, onAsk, onConfirm, onCancel }: {
  confirming: boolean; onReview: () => void; onAsk: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
      <button className="sm" onClick={onReview}>Review</button>
      <div style={{ width: 96, display: "flex", gap: 4 }}>
        {confirming ? (
          <>
            <button className="danger sm" style={{ flex: 1, padding: 0, color: "var(--loss)" }} title="Yes, delete this game" onClick={onConfirm}>Delete</button>
            <button className="quiet sm" style={{ flex: 1, padding: 0 }} title="Keep this game" onClick={onCancel}>Keep</button>
          </>
        ) : (
          <button className="danger sm" style={{ flex: 1 }} title="Delete this game (asks to confirm)" onClick={onAsk}>Delete</button>
        )}
      </div>
    </div>
  );
}

const OUTCOME_CLASS = { Win: "win", Loss: "loss", Draw: "draw" } as const;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }),
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
  const narrow = useNarrow();

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

  if (loading) {
    return <p className="muted" style={{ paddingTop: 64, textAlign: "center" }}>Loading your games…</p>;
  }
  if (!stats || !games) return <p className="error" role="alert">{loadError ?? "Couldn't load your games."}</p>;

  const s = stats;
  const g = games;
  const counted = QUALITIES.reduce((n, k) => n + (s.move_counts[k] ?? 0), 0);
  const rowActions = (row: GameRow) => (
    <RowActions
      confirming={confirmDeleteId === row.game_id}
      onReview={() => onReview(row.game_id)}
      onAsk={() => setConfirmDeleteId(row.game_id)}
      onConfirm={() => { deleteGame(row.game_id); setConfirmDeleteId(null); }}
      onCancel={() => setConfirmDeleteId(null)}
    />
  );

  return (
    <div>
      <PageHead
        title="Your games"
        lead={s.total ? "Every finished game, and how accurately you played it." : "Finish a game and it shows up here, ready to review."}
        actions={<button className="primary lg" onClick={onPlay}>New game</button>}
      />

      <div className="stats">
        <Stat value={s.total} label="Played" />
        <Stat value={s.wins} label="Won" tone="var(--win)" />
        <Stat value={s.losses} label="Lost" tone="var(--loss)" />
        <Stat value={s.draws} label="Drawn" />
        <Stat value={s.accuracy !== null ? `${s.accuracy}%` : "–"} label="Accuracy" tone="var(--accent)" />
      </div>

      {s.analyzed_games > 0 && counted > 0 && (
        <div className="panel tight" style={{ marginTop: 12 }}>
          <div className="row between small" style={{ marginBottom: 10 }}>
            <span style={{ fontWeight: 600 }}>Your moves</span>
            <span className="muted">from {s.analyzed_games} analysed game{s.analyzed_games !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }} aria-hidden>
            {QUALITIES.map(k => s.move_counts[k] ? (
              <div key={k} style={{ flex: s.move_counts[k], background: `var(--${k})` }} />
            ) : null)}
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            {QUALITIES.map(k => (
              <span key={k}><QualityDot q={k} /><b style={{ color: "var(--text)", fontWeight: 600 }}>{s.move_counts[k] ?? 0}</b>{k}</span>
            ))}
          </div>
        </div>
      )}

      <SectionHead title="History" aside={g.length ? `${g.length} game${g.length !== 1 ? "s" : ""}` : undefined} />
      {deleteError && <p className="error" role="alert" style={{ marginBottom: 8 }}>{deleteError}</p>}

      {g.length === 0 ? (
        <div className="empty-state">
          <h3>No finished games yet</h3>
          <p style={{ margin: "0 auto 16px" }}>Abandoned games aren't saved. Play one to the end to see it here.</p>
          <button className="primary" onClick={onPlay}>Play a game</button>
        </div>
      ) : narrow ? (
        // Phones: one card per game instead of the wide table
        <div className="stack sm">
          {g.map(row => {
            const outcome = playerOutcome(row);
            return (
              <div key={row.game_id} className="panel tight stack sm">
                <div className="row" style={{ gap: 10 }}>
                  <span className={OUTCOME_CLASS[outcome]} style={{ fontWeight: 600, minWidth: 36 }}>{outcome}</span>
                  <span style={{ color: "var(--text-strong)", fontWeight: 500 }}>{opponentLabel(row.engine, row.engine_elo)}</span>
                  <span style={{ marginLeft: "auto" }}><GameIdBadge id={row.public_id} size={12} /></span>
                </div>
                <div className="row small muted" style={{ gap: "2px 14px" }}>
                  <span>As {row.player_color}</span>
                  <span>{Math.ceil(row.move_count / 2)} moves</span>
                  <span>{row.accuracy !== null ? `${Math.round(row.accuracy)}% accuracy` : "Not analysed"}</span>
                  {row.assisted && <span>Assisted</span>}
                  <span>{fmtDate(row.played_at)}</span>
                </div>
                {rowActions(row)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Result</th>
                <th>Opponent</th>
                <th>As</th>
                <th className="num">Moves</th>
                <th className="num">Accuracy</th>
                <th>Played</th>
                <th>Game</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {g.map(row => {
                const outcome = playerOutcome(row);
                return (
                  <tr key={row.game_id}>
                    <td>
                      <span className={OUTCOME_CLASS[outcome]} style={{ fontWeight: 600 }}>{outcome}</span>
                      {row.assisted && <span className="tag" style={{ marginLeft: 8, height: 22 }} title="A hint or take-back was used">Assisted</span>}
                    </td>
                    <td style={{ color: "var(--text-strong)", fontWeight: 500 }}>{opponentLabel(row.engine, row.engine_elo)}</td>
                    <td style={{ textTransform: "capitalize" }}>{row.player_color}</td>
                    <td className="num">{Math.ceil(row.move_count / 2)}</td>
                    <td className="num" title={row.analyzed ? undefined : "Not analysed yet. Open Review to analyse it."}>
                      {row.accuracy !== null ? `${Math.round(row.accuracy)}%` : <span className="faint">–</span>}
                    </td>
                    <td className="muted">{fmtDate(row.played_at)}</td>
                    <td><GameIdBadge id={row.public_id} size={12} /></td>
                    <td>{rowActions(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
