// frontend/src/pages/Learn.tsx
// Learn hub: corpus topics by group (from /api/learn), review queue, openings.
import { useEffect, useState } from "react";
import type { OpeningKey } from "../data/openings";
import { getStatus, getTopics, type LearnStatus, type TopicStatus, type TopicSummary, type TopicsResponse } from "./learn/api";
import Progress, { StateTag } from "./learn/Progress";
import { Meter, PageHead, SectionHead, Segmented } from "../ui";
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

function TopicCard({ icon, title, description, footer, onClick }: {
  icon: string; title: string; description: string; footer?: React.ReactNode; onClick: () => void;
}) {
  return (
    <button className="topic-card" onClick={onClick}>
      <span className="topic-icon" aria-hidden>{icon}</span>
      <span className="topic-title">{title}</span>
      <span className="topic-desc">{description}</span>
      {footer && <span className="topic-foot">{footer}</span>}
    </button>
  );
}

function CardFooter({ topic, state }: { topic: TopicSummary; state?: TopicStatus }) {
  const { accuracy, attempts, solved } = topic.progress;
  return (
    <>
      {state ? <StateTag state={state.status} /> : <span />}
      {attempts > 0 && (
        <span className="row xsmall muted" style={{ gap: 8, flexWrap: "nowrap" }}>
          {accuracy !== null && <span style={{ width: 56 }}><Meter value={accuracy} /></span>}
          {solved} of {attempts}
        </span>
      )}
    </>
  );
}

type View =
  | { kind: "hub" }
  | { kind: "progress" }
  | { kind: "topic"; slug: string }
  | { kind: "review" }
  | { kind: "openings"; key: OpeningKey | null };

export default function Learn() {
  const [view, setView] = useState<View>({ kind: "hub" });
  const [data, setData] = useState<TopicsResponse | null>(null);
  const [status, setStatus] = useState<LearnStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listing = view.kind === "hub" || view.kind === "progress";
  useEffect(() => {
    if (!listing) return;
    Promise.all([getTopics(), getStatus()])
      .then(([d, st]) => { setData(d); setStatus(st); setError(null); })
      .catch(() => setError("Couldn't reach the server. Check your connection and reload."));
  }, [listing]);

  const toHub = () => setView({ kind: "hub" });

  if (view.kind === "topic") return <TopicLesson slug={view.slug} onBack={toHub} />;
  if (view.kind === "review") return <ReviewSession onBack={toHub} />;
  if (view.kind === "openings" && !view.key)
    return <OpeningsHub onSelect={k => setView({ kind: "openings", key: k })} onBack={toHub} />;
  if (view.kind === "openings" && view.key)
    return <OpeningDetail openingKey={view.key} onBack={() => setView({ kind: "openings", key: null })} />;

  const openTopic = (slug: string) => setView({ kind: "topic", slug });
  const states = new Map(status?.groups.flatMap(g => g.topics.map(t => [t.slug, t] as const)) ?? []);
  const due = data?.reviews_due ?? 0;

  return (
    <div>
      <PageHead
        title="Learn"
        lead="Each topic: read the ideas and Capablanca's lesson, find his moves on the board, then solve real puzzles at your level."
        actions={data && (due
          ? <button className="primary lg" onClick={() => setView({ kind: "review" })}>Review {due} position{due === 1 ? "" : "s"}</button>
          : <span className="small muted">Nothing to review today</span>)}
      />
      <div className="row between" style={{ marginBottom: 8 }}>
        <Segmented<"hub" | "progress"> label="Learn view" value={view.kind === "progress" ? "progress" : "hub"}
          onChange={k => setView({ kind: k })}
          options={[{ value: "hub", label: "Topics" }, { value: "progress", label: "My progress" }]} />
        {data && <span className="small muted">Puzzle rating <b style={{ color: "var(--accent)", fontWeight: 600 }}>{Math.round(data.rating)}</b></span>}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Loading topics…</p>}

      {view.kind === "progress" && status && <div style={{ marginTop: 24 }}><Progress status={status} onOpen={openTopic} /></div>}

      {view.kind === "hub" && data && data.groups.map(g => (
        <section key={g.group}>
          <SectionHead title={g.group} aside={(() => {
            const passed = g.topics.filter(t => states.get(t.slug)?.status === "passed").length;
            return passed ? `${passed} of ${g.topics.length} passed` : undefined;
          })()} />
          <div className="topic-grid">
            {g.topics.map(t => (
              <TopicCard key={t.slug} icon={ICONS[t.slug] ?? "♟"} title={t.title} description={t.summary}
                footer={<CardFooter topic={t} state={states.get(t.slug)} />} onClick={() => openTopic(t.slug)} />
            ))}
            {g.group === "Strategy" && (
              <TopicCard icon="♙" title="Openings" description="18 openings and 58 lines: Italian, Spanish, Sicilian, French, Caro-Kann, Queen's Gambit and more."
                onClick={() => setView({ kind: "openings", key: null })} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
