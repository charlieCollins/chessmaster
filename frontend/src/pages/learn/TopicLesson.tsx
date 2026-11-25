// frontend/src/pages/learn/TopicLesson.tsx
// One topic: Read (ideas + Capablanca) → Find the move (his diagrams) → Practise (Lichess puzzles).
import { useEffect, useState } from "react";
import { getPuzzles, getTopic, judge, markStudied, postAttempt, type Puzzle, type TopicDetail } from "./api";
import { PageHead } from "../../ui";
import BookText from "./BookText";
import { PIECE_LESSONS } from "./lessonMap";
import SolveBoard, { type SolveResult } from "./SolveBoard";
import { drillToLine, lichessToLine } from "./solveLine";

type Step = "read" | "find" | "practise";
const VISITED_KEY = "learn.visited.";

function visitedBefore(slug: string): boolean {
  try { return localStorage.getItem(VISITED_KEY + slug) === "1"; } catch { return false; }
}

function markVisited(slug: string): void {
  try { localStorage.setItem(VISITED_KEY + slug, "1"); } catch { /* storage unavailable */ }
}

function StepTabs({ steps, step, onStep }: { steps: [Step, string][]; step: Step; onStep: (s: Step) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label="Lesson steps">
      {steps.map(([s, label], i) => (
        <button key={s} role="tab" aria-selected={step === s} onClick={() => onStep(s)}>
          <span className="step-no">{i + 1}</span>{label}
        </button>
      ))}
    </div>
  );
}

/** Back to the Learn hub; the same control on every Learn sub-page. */
export function BackLink({ onClick, label = "Learn" }: { onClick: () => void; label?: string }) {
  return <button className="quiet sm back-link" onClick={onClick}>‹ {label}</button>;
}

function Read({ topic, onOpenLesson }: { topic: TopicDetail; onOpenLesson: () => void }) {
  return (
    <div className="stack lg">
      {topic.ideas.length > 0 && (
        <section>
          <h2 style={{ fontSize: 21, marginBottom: 10 }}>Key ideas</h2>
          <ul className="stack sm" style={{ paddingLeft: 20, maxWidth: "70ch" }}>
            {topic.ideas.map((idea, i) => <li key={i}>{idea}</li>)}
          </ul>
        </section>
      )}
      {topic.piece_lesson && (
        <div>
          <button onClick={onOpenLesson}>Open the {topic.title.toLowerCase()} lesson cards</button>
        </div>
      )}
      {topic.drill_tip && (
        <section>
          <h2 style={{ fontSize: 21, marginBottom: 8 }}>How to practise</h2>
          <p className="muted">{topic.drill_tip}</p>
        </section>
      )}
      {topic.sections.map(s => (
        <section key={`${s.book_title}-${s.section}`}>
          <div className="small muted" style={{ marginBottom: 4 }}>From <i>{s.book_title}</i> by {s.author}</div>
          <h2 style={{ fontSize: 21, marginBottom: 14 }}>{s.section}. {s.title}</h2>
          <BookText blocks={s.blocks} diagrams={topic.diagrams} />
        </section>
      ))}
    </div>
  );
}

function FindTheMove({ topic }: { topic: TopicDetail }) {
  const [i, setI] = useState(0);
  const [round, setRound] = useState(0);              // bump to re-try the same drill
  const drill = topic.drills[i];
  const onResult = (r: SolveResult) => {
    postAttempt({ kind: "book", ref: drill.ref, topic: topic.slug, context: "lesson", ...r }).catch(() => {});
  };
  return (
    <div>
      <div className="row small muted" style={{ marginBottom: 14 }}>
        <b style={{ color: "var(--text)", fontWeight: 600 }}>Position {i + 1} of {topic.drills.length}</b>
        <span>{drill.book_title}, section {drill.section_title}, diagram {drill.fig.slice(3)}</span>
        <button className="quiet sm" onClick={() => setRound(round + 1)}>Start over</button>
      </div>
      <SolveBoard
        key={`${drill.ref}-${round}`}
        line={drillToLine(drill)}
        judge={(fen, uci, expected) => judge(fen, uci, expected).then(r => r.accepted)}
        onResult={onResult}
        onNext={() => { setI((i + 1) % topic.drills.length); setRound(0); }}
        nextLabel={i + 1 < topic.drills.length ? "Next drill" : "Back to the first drill"}
        prompt={`Find ${drill.fen.split(" ")[1] === "b" ? "Black" : "White"}'s move, as Capablanca played it`}
      />
    </div>
  );
}

function Practise({ topic }: { topic: TopicDetail }) {
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [delta, setDelta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [set, setSet] = useState(0);                 // bump to fetch the next set
  useEffect(() => {
    let live = true;
    getPuzzles(topic.slug, 10)
      .then(d => { if (live) { setPuzzles(d.puzzles); setRating(d.rating); } })
      .catch(e => { if (live) setError(String(e.message ?? e)); });
    return () => { live = false; };
  }, [topic.slug, set]);
  const load = () => {
    setPuzzles(null); setI(0); setResults([]); setDelta(null); setError(null); setSet(n => n + 1);
  };

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!puzzles) return <p className="muted">Loading puzzles…</p>;
  if (puzzles.length === 0) return <p className="muted">You've seen every puzzle near your rating in this topic. Try another topic.</p>;

  if (i >= puzzles.length) {
    const solved = results.filter(Boolean).length;
    return (
      <div className="panel stack" style={{ alignItems: "flex-start", maxWidth: 520 }}>
        <h2>{solved} of {puzzles.length} solved first try</h2>
        <p className="muted">
          Your puzzle rating is {rating !== null ? Math.round(rating) : "–"}. The ones you missed come back in your reviews.
        </p>
        <button className="primary" onClick={load}>Next 10 puzzles</button>
      </div>
    );
  }

  const p = puzzles[i];
  const onResult = (r: SolveResult) => {
    setResults(rs => [...rs, r.solved && !r.revealed]);
    postAttempt({ kind: "puzzle", ref: p.id, topic: topic.slug, context: "lesson", puzzle_rating: p.rating, ...r })
      .then(a => {
        if (a.rated && a.rating_before !== null && a.rating_after !== null) {
          const d = Math.round(a.rating_after - a.rating_before);
          setDelta(`${Math.round(a.rating_before)} → ${Math.round(a.rating_after)} (${d >= 0 ? "+" : ""}${d})`);
          setRating(a.rating_after);
        }
      })
      .catch(() => {});
  };
  return (
    <div>
      <div className="row small muted" style={{ marginBottom: 14, gap: "4px 18px" }}>
        <b style={{ color: "var(--text)", fontWeight: 600 }}>Puzzle {i + 1} of {puzzles.length}</b>
        <span>Puzzle rated {p.rating}</span>
        <span>Your rating {rating !== null ? Math.round(rating) : "–"}{delta ? `, last change ${delta}` : ""}</span>
      </div>
      <SolveBoard key={p.id} line={lichessToLine(p)} onResult={onResult}
        onNext={() => setI(i + 1)} nextLabel={i + 1 < puzzles.length ? "Next puzzle" : "Finish set"} />
    </div>
  );
}

export default function TopicLesson({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("read");
  const [lesson, setLesson] = useState(false);

  const [visited] = useState(() => visitedBefore(slug));   // read once, before this visit is recorded
  useEffect(() => {
    markVisited(slug);
    getTopic(slug)
      .then(t => {
        setTopic(t);
        if (visited && t.themes.length) setStep("practise");
      })
      .catch(e => setError(String(e.message ?? e)));
  }, [slug, visited]);

  // Opening the reading counts as having studied the topic (shown on My progress)
  useEffect(() => {
    if (topic && step === "read") markStudied(topic.slug).catch(() => {});
  }, [topic, step]);

  if (lesson && PIECE_LESSONS[slug]) {
    const Lesson = PIECE_LESSONS[slug];
    return <Lesson onBack={() => setLesson(false)} />;
  }

  const steps: [Step, string][] = [["read", "Read"]];
  if (topic?.drills.length) steps.push(["find", "Find the move"]);
  if (topic?.themes.length) steps.push(["practise", "Practise"]);

  return (
    <div>
      <BackLink onClick={onBack} />
      <PageHead title={topic?.title ?? "Loading…"} lead={topic?.summary} />
      {error && <p className="error" role="alert">{error}</p>}
      {topic && (
        <>
          <StepTabs steps={steps} step={step} onStep={setStep} />
          {step === "read" && <Read topic={topic} onOpenLesson={() => setLesson(true)} />}
          {step === "find" && <FindTheMove topic={topic} />}
          {step === "practise" && (topic.puzzles_available
            ? <Practise topic={topic} />
            : <p className="muted">The puzzle database isn't installed on this server yet.</p>)}
        </>
      )}
    </div>
  );
}
