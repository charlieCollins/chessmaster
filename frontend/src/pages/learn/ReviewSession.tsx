// frontend/src/pages/learn/ReviewSession.tsx
// Solve every position that's due for review (missed puzzles and book drills), oldest first.
import { useEffect, useState } from "react";
import { getReviews, judge, postAttempt, type AttemptResponse, type ReviewItem } from "./api";
import SolveBoard, { type SolveResult } from "./SolveBoard";
import { BackLink } from "./TopicLesson";
import { PageHead } from "../../ui";
import { drillToLine, lichessToLine } from "./solveLine";

const STEP_DAYS = [1, 3, 7, 21];

function nextDue(a: AttemptResponse | undefined): string {
  if (!a) return "";
  if (!a.review) return "Learned. It leaves your reviews.";
  return `Comes back in ${STEP_DAYS[a.review.step]} day${STEP_DAYS[a.review.step] === 1 ? "" : "s"}.`;
}

export default function ReviewSession({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [last, setLast] = useState<AttemptResponse | undefined>(undefined);

  useEffect(() => {
    getReviews().then(d => setItems(d.items)).catch(e => setError(String(e.message ?? e)));
  }, []);

  const header = (
    <>
      <BackLink onClick={onBack} />
      <PageHead title="Review"
        lead={items && items.length > 0 && i < items.length
          ? `Position ${i + 1} of ${items.length}. Positions you missed before, spaced out so they stick.`
          : "Positions you missed before, spaced out so they stick."} />
    </>
  );

  if (error) return <div>{header}<p className="error" role="alert">{error}</p></div>;
  if (!items) return <div>{header}<p className="muted">Loading…</p></div>;
  if (items.length === 0)
    return <div>{header}<div className="empty-state"><h3>Nothing due</h3><p style={{ margin: "0 auto" }}>Come back tomorrow, or practise a topic.</p></div></div>;

  if (i >= items.length) {
    const solved = results.filter(Boolean).length;
    return (
      <div>
        {header}
        <div className="panel stack" style={{ alignItems: "flex-start", maxWidth: 560 }}>
          <h2>{solved} of {items.length} solved first try</h2>
          <p className="muted">
            Solved positions come back after a longer gap (1, 3, 7, then 21 days). Missed ones start again tomorrow.
          </p>
          <button className="primary" onClick={onBack}>Back to Learn</button>
        </div>
      </div>
    );
  }

  const item = items[i];
  const onResult = (r: SolveResult) => {
    setResults(rs => [...rs, r.solved && !r.revealed]);
    postAttempt({ kind: item.kind, ref: item.ref, topic: item.topic, context: "review", ...r,
      puzzle_rating: item.kind === "puzzle" ? item.position.rating : null })
      .then(setLast).catch(() => setLast(undefined));
  };
  const line = item.kind === "puzzle" ? lichessToLine(item.position) : drillToLine(item.position);
  const label = item.kind === "puzzle"
    ? `Puzzle rated ${item.position.rating}${item.topic ? `, from ${item.topic.replace(/-/g, " ")}` : ""}`
    : `${item.position.book_title}, section ${item.position.section_title}, diagram ${item.position.fig.slice(3)}`;

  return (
    <div>
      {header}
      <div className="row small muted" style={{ marginBottom: 14 }}>
        <span>{label}</span>
        {last && results.length === i + 1 && <span style={{ color: "var(--text)" }}>{nextDue(last)}</span>}
      </div>
      <SolveBoard
        key={`${item.kind}:${item.ref}`}
        line={line}
        judge={item.kind === "book" ? (fen, uci, expected) => judge(fen, uci, expected).then(r => r.accepted) : undefined}
        onResult={onResult}
        onNext={() => { setI(i + 1); setLast(undefined); }}
        nextLabel={i + 1 < items.length ? "Next" : "Finish"}
      />
    </div>
  );
}
