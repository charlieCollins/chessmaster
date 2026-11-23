// frontend/src/pages/Learn.tsx
// Learn hub: corpus topics by group (from /api/learn), review queue, openings.
import { useEffect, useState } from "react";
import type { OpeningKey } from "../data/openings";
import { getTopics, type TopicSummary, type TopicsResponse } from "./learn/api";
import { OpeningDetail, OpeningsHub } from "./learn/Openings";
import ReviewSession from "./learn/ReviewSession";
import TopicLesson from "./learn/TopicLesson";

// Chess glyphs + a few symbols the UI font is known to have (others render as empty boxes)
const ICONS: Record<string, string> = {
  knights: "♞", bishops: "♝", rooks: "♜", pawns: "♟", queens: "♛", kings: "♚",
  forks: "♘", "pins-and-skewers": "♗", "discovered-attacks": "◎", "hanging-and-trapped-pieces": "⚠",
  "removing-the-defender": "♜", "clearance-and-interference": "♖", "sacrifices-and-king-attacks": "♛",
  "mating-patterns": "#", calculation: "♞", "basic-mates": "♔", "pawn-endings": "♙", "rook-endings": "♖",
  "minor-piece-endings": "♗", "queen-endings": "♕", "opening-principles": "♙", "initiative-and-planning": "♕",
  "pawn-structure": "♟",
};

function ProgressBar({ topic }: { topic: TopicSummary }) {
  const { accuracy, attempts, solved } = topic.progress;
  if (accuracy === null) {
    return (
      <div className="mono dim" style={{ fontSize: 11 }}>
        {attempts ? `${solved}/${attempts} first try — keep going` : "—"}
      </div>
    );
  }
  const pct = Math.round(accuracy * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--raised)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--gold)" }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>{pct}%</span>
    </div>
  );
}

function TopicCard({ icon, title, description, footer, onClick }: {
  icon: string; title: string; description: string; footer?: React.ReactNode; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--raised)" : "var(--surface)",
        border: "1px solid", borderColor: hovered ? "var(--gold)" : "var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px", cursor: "pointer",
        width: 220, display: "flex", flexDirection: "column", gap: 8,
        transition: "border-color var(--transition), background var(--transition)", userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 24, width: 28, textAlign: "center" }}>{icon}</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--text-bright)" }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55, flex: 1 }}>{description}</div>
      {footer}
    </div>
  );
}

type View =
  | { kind: "hub" }
  | { kind: "topic"; slug: string }
  | { kind: "review" }
  | { kind: "openings"; key: OpeningKey | null };

export default function Learn() {
  const [view, setView] = useState<View>({ kind: "hub" });
  const [data, setData] = useState<TopicsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view.kind !== "hub") return;
    getTopics().then(d => { setData(d); setError(null); })
      .catch(() => setError("Could not reach the server. Is the backend running?"));
  }, [view.kind]);

  const toHub = () => setView({ kind: "hub" });

  if (view.kind === "topic") return <TopicLesson slug={view.slug} onBack={toHub} />;
  if (view.kind === "review") return <ReviewSession onBack={toHub} />;
  if (view.kind === "openings" && !view.key)
    return <OpeningsHub onSelect={k => setView({ kind: "openings", key: k })} onBack={toHub} />;
  if (view.kind === "openings" && view.key)
    return <OpeningDetail openingKey={view.key} onBack={() => setView({ kind: "openings", key: null })} />;

  const openTopic = (slug: string) => setView({ kind: "topic", slug });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>Learn</h2>
        {data && (
          <span className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>
            puzzle rating <span style={{ color: "var(--gold)" }}>{Math.round(data.rating)}</span>
          </span>
        )}
        {data && (
          <button className={data.reviews_due ? "primary" : "ghost"} disabled={!data.reviews_due}
            onClick={() => setView({ kind: "review" })} style={{ marginLeft: "auto", fontSize: 12, padding: "5px 14px" }}>
            {data.reviews_due ? `Review ${data.reviews_due} due` : "No reviews due"}
          </button>
        )}
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 24 }}>
        Each topic: read the key ideas and Capablanca's lesson, find his moves on the board, then practise real puzzles at your level.
      </p>
      {error && <div style={{ color: "var(--loss)", fontFamily: "var(--font-mono)", fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {!data && !error && <div className="dim mono">Loading…</div>}
      {data && data.groups.map(g => (
        <section key={g.group} style={{ marginBottom: 28 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>{g.group}</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {g.topics.map(t => (
              <TopicCard key={t.slug} icon={ICONS[t.slug] ?? "♟"} title={t.title} description={t.summary}
                footer={<ProgressBar topic={t} />} onClick={() => openTopic(t.slug)} />
            ))}
            {g.group === "Strategy" && (
              <TopicCard icon="♟♙" title="Openings" description="18 openings / 58 lines — Italian, Spanish, Sicilian, French, Caro-Kann, Queen's Gambit and more."
                onClick={() => setView({ kind: "openings", key: null })} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
