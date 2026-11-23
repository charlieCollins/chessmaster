// frontend/src/pages/learn/ReviewSession.tsx
// Solve every position that's due for review (missed puzzles and book drills), oldest first.
import { useEffect, useState } from "react";
import { getReviews, judge, postAttempt, type AttemptResponse, type ReviewItem } from "./api";
import SolveBoard, { type SolveResult } from "./SolveBoard";
import { drillToLine, lichessToLine } from "./solveLine";

const STEP_DAYS = [1, 3, 7, 21];

function nextDue(a: AttemptResponse | undefined): string {
  if (!a) return "";
  if (!a.review) return "Learned — it leaves the review queue.";
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
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
      <button className="ghost" onClick={onBack} style={{ fontSize: 12 }}>← Learn</button>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>Review</h2>
      {items && items.length > 0 && i < items.length && (
        <span className="mono dim" style={{ fontSize: 12 }}>{i + 1} of {items.length}</span>
      )}
    </div>
  );

  if (error) return <div>{header}<div style={{ color: "var(--loss)", fontSize: 13 }}>{error}</div></div>;
  if (!items) return <div>{header}<div className="dim mono">Loading…</div></div>;
  if (items.length === 0)
    return <div>{header}<p className="dim">Nothing due — come back tomorrow.</p></div>;

  if (i >= items.length) {
    const solved = results.filter(Boolean).length;
    return (
      <div>
        {header}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-bright)" }}>
            {solved} of {items.length} solved first try
          </div>
          <p className="dim" style={{ fontSize: 13 }}>
            Solved positions come back after a longer gap (1 → 3 → 7 → 21 days); missed ones start again tomorrow.
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
    ? `Puzzle · rated ${item.position.rating}${item.topic ? ` · ${item.topic}` : ""}`
    : `${item.position.book_title}, §${item.position.section_title} · Diagram ${item.position.fig.slice(3)}`;

  return (
    <div>
      {header}
      <div className="mono dim" style={{ fontSize: 12, marginBottom: 12 }}>
        {label}{last && results.length === i + 1 ? ` · ${nextDue(last)}` : ""}
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
