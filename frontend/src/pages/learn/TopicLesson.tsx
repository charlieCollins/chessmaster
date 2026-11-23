// frontend/src/pages/learn/TopicLesson.tsx
// One topic: Read (ideas + Capablanca) → Find the move (his diagrams) → Practise (Lichess puzzles).
import { useEffect, useState } from "react";
import { getPuzzles, getTopic, judge, postAttempt, type Puzzle, type TopicDetail } from "./api";
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
    <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: "1px solid var(--border)" }}>
      {steps.map(([s, label], i) => (
        <button key={s} className="ghost" onClick={() => onStep(s)} style={{
          fontSize: 13, padding: "8px 14px", borderRadius: 0, border: "none",
          borderBottom: step === s ? "2px solid var(--gold)" : "2px solid transparent",
          color: step === s ? "var(--text-bright)" : "var(--text-dim)",
        }}>
          {i + 1}. {label}
        </button>
      ))}
    </div>
  );
}

function Read({ topic, onOpenLesson }: { topic: TopicDetail; onOpenLesson: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {topic.ideas.length > 0 && (
        <section>
          <div className="section-label" style={{ marginBottom: 10 }}>Key ideas</div>
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18, maxWidth: 760 }}>
            {topic.ideas.map((idea, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.65 }}>{idea}</li>)}
          </ul>
        </section>
      )}
      {topic.piece_lesson && (
        <div>
          <button className="primary" onClick={onOpenLesson} style={{ fontSize: 13 }}>Open the {topic.title} lesson cards</button>
        </div>
      )}
      {topic.drill_tip && (
        <section>
          <div className="section-label" style={{ marginBottom: 10 }}>How to practise</div>
          <p style={{ fontSize: 13, color: "var(--text-dim)", maxWidth: 760, lineHeight: 1.6 }}>{topic.drill_tip}</p>
        </section>
      )}
      {topic.sections.map(s => (
        <section key={`${s.book_title}-${s.section}`}>
          <div className="section-label" style={{ marginBottom: 6 }}>{s.book_title} — {s.author}</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--text-bright)", marginBottom: 12 }}>
            {s.section}. {s.title}
          </h3>
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
      <div className="mono dim" style={{ fontSize: 12, marginBottom: 12 }}>
        Drill {i + 1} of {topic.drills.length} · {drill.book_title}, §{drill.section_title} · Diagram {drill.fig.slice(3)}
        <button className="ghost" style={{ fontSize: 11, marginLeft: 12 }} onClick={() => setRound(round + 1)}>restart</button>
      </div>
      <SolveBoard
        key={`${drill.ref}-${round}`}
        line={drillToLine(drill)}
        judge={(fen, uci, expected) => judge(fen, uci, expected).then(r => r.accepted)}
        onResult={onResult}
        onNext={() => { setI((i + 1) % topic.drills.length); setRound(0); }}
        nextLabel={i + 1 < topic.drills.length ? "Next drill" : "Back to the first drill"}
        prompt={`Find ${drill.fen.split(" ")[1] === "b" ? "Black" : "White"}'s move — as Capablanca played it`}
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

  if (error) return <div style={{ color: "var(--loss)", fontSize: 13 }}>{error}</div>;
  if (!puzzles) return <div className="dim mono">Loading puzzles…</div>;
  if (puzzles.length === 0) return <div className="dim">No new puzzles near your rating for this topic.</div>;

  if (i >= puzzles.length) {
    const solved = results.filter(Boolean).length;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-bright)" }}>
          {solved}/{puzzles.length} solved first try
        </div>
        <div className="mono dim" style={{ fontSize: 13 }}>
          Puzzle rating {rating !== null ? Math.round(rating) : "—"}. Missed ones are in your review queue.
        </div>
        <button className="primary" onClick={load}>Next set ›</button>
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
      <div className="mono dim" style={{ fontSize: 12, marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>Puzzle {i + 1} of {puzzles.length} · rated {p.rating}</span>
        <span>your rating {rating !== null ? Math.round(rating) : "—"}{delta ? ` · last: ${delta}` : ""}</span>
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

  if (lesson && PIECE_LESSONS[slug]) {
    const Lesson = PIECE_LESSONS[slug];
    return <Lesson onBack={() => setLesson(false)} />;
  }

  const steps: [Step, string][] = [["read", "Read"]];
  if (topic?.drills.length) steps.push(["find", "Find the move"]);
  if (topic?.themes.length) steps.push(["practise", "Practise"]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
        <button className="ghost" onClick={onBack} style={{ fontSize: 12 }}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>{topic?.title ?? "…"}</h2>
        {topic && <span className="mono dim" style={{ fontSize: 12 }}>{topic.group}</span>}
      </div>
      {topic && <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>{topic.summary}</p>}
      {error && <div style={{ color: "var(--loss)", fontSize: 13 }}>{error}</div>}
      {topic && (
        <>
          <StepTabs steps={steps} step={step} onStep={setStep} />
          {step === "read" && <Read topic={topic} onOpenLesson={() => setLesson(true)} />}
          {step === "find" && <FindTheMove topic={topic} />}
          {step === "practise" && (topic.puzzles_available
            ? <Practise topic={topic} />
            : <div style={{ color: "var(--text-dim)", fontSize: 13 }}>Puzzle database not built — run <code>scripts/build_corpus.py puzzles</code>.</div>)}
        </>
      )}
    </div>
  );
}
