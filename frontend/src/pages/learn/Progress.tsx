// frontend/src/pages/learn/Progress.tsx
// "What have I studied and passed": puzzle rating over time, then every topic's state.
import { useEffect, useRef, useState } from "react";
import { Meter, SectionHead, Stat } from "../../ui";
import { useNarrow } from "../../viewport";
import type { LearnStatus, TopicState, TopicStatus } from "./api";

const STATE_LABEL: Record<TopicState, string> = {
  new: "Not started", studied: "Read", practising: "Practising", passed: "Passed",
};

export function StateTag({ state }: { state: TopicState }) {
  const cls = state === "passed" ? "tag win" : state === "practising" ? "tag accent" : "tag";
  return <span className={cls}>{state === "passed" && "✓ "}{STATE_LABEL[state]}</span>;
}

function ago(iso: string | null): string {
  if (!iso) return "–";
  const days = Math.floor((Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Puzzle rating after each rated puzzle (x = puzzles solved, so gaps between sessions don't distort it). */
function RatingChart({ history, start }: { history: { at: string; rating: number }[]; start: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);   // drawn at the container's real width so text stays 12px
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pts = [start, ...history.map(h => h.rating)];
  const H = 200, L = 44, R = 12, T = 12, B = 26;
  const lo = Math.floor((Math.min(...pts) - 20) / 50) * 50;
  const hi = Math.ceil((Math.max(...pts) + 20) / 50) * 50;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const path = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  function onMove(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((px - L) / (W - L - R)) * (pts.length - 1)))));
  }

  return (
    <div ref={box} style={{ position: "relative" }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }} role="img"
        aria-label={`Puzzle rating from ${Math.round(start)} to ${Math.round(pts[pts.length - 1])} over ${history.length} rated puzzles`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        <text x={L} y={H - 6} fontSize="12" fill="var(--text-muted)">Start</text>
        <text x={W - R} y={H - 6} fontSize="12" fill="var(--text-muted)" textAnchor="end">{history.length} puzzles</text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--line-strong)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(pts[hover])} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="panel tight small" style={{
          position: "absolute", top: 0, pointerEvents: "none", padding: "6px 10px",
          left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > pts.length / 2 ? "-110%" : "10%"})`,
        }}>
          <div style={{ fontWeight: 600 }}>{Math.round(pts[hover])}</div>
          <div className="xsmall muted">{hover === 0 ? "Starting rating" : `After puzzle ${hover}`}</div>
        </div>
      )}
    </div>
  );
}

function puzzleText(t: TopicStatus): string {
  if (!t.has_puzzles) return "–";
  const p = t.puzzles;
  if (!p.attempts) return "None yet";
  return `${p.solved} of ${p.attempts}`;
}

export default function Progress({ status, onOpen }: { status: LearnStatus; onOpen: (slug: string) => void }) {
  const narrow = useNarrow();
  const total = Object.values(status.counts).reduce((a, b) => a + b, 0);
  const first = status.rating_history.length ? status.rating_history[0] : null;
  const start = first ? 1300 : status.rating;

  return (
    <div>
      <div className="stats">
        <Stat value={Math.round(status.rating)} label="Puzzle rating" tone="var(--accent)" />
        <Stat value={`${status.counts.passed} of ${total}`} label="Topics passed" tone={status.counts.passed ? "var(--win)" : undefined} />
        <Stat value={status.counts.practising} label="Practising" />
        <Stat value={status.counts.studied} label="Read, not practised" />
        <Stat value={status.reviews_due} label={`Reviews due (${status.reviews_queued} queued)`} />
      </div>

      <SectionHead title="Puzzle rating" aside={status.rated_attempts ? `${status.rated_attempts} rated puzzles` : undefined} />
      <div className="panel">
        {status.rating_history.length >= 2
          ? <RatingChart history={status.rating_history} start={start} />
          : <p className="muted">Solve a few puzzles in any topic's Practise step and your rating's path shows up here.</p>}
      </div>

      <SectionHead title="Topics" aside="Passed = 70% of your last 10 or more puzzles solved first try" />
      <p className="small muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Topics without puzzles pass when you find every Capablanca move. Click a topic to work on it.
      </p>
      <div className="stack lg">
        {status.groups.map(g => (
          <div key={g.group}>
            <h3 style={{ marginBottom: 10 }}>{g.group}</h3>
            {narrow ? (
              <div className="stack sm">
                {g.topics.map(t => (
                  <button key={t.slug} className="panel tight" onClick={() => onOpen(t.slug)}
                    style={{ height: "auto", display: "block", textAlign: "left", width: "100%" }}>
                    <div className="row between"><b style={{ fontWeight: 600 }}>{t.title}</b><StateTag state={t.status} /></div>
                    <div className="row xsmall muted" style={{ gap: "2px 14px", marginTop: 6, fontWeight: 400 }}>
                      {t.has_puzzles && <span>Puzzles {puzzleText(t)}</span>}
                      {t.drills.total > 0 && <span>Capablanca {t.drills.solved} of {t.drills.total}</span>}
                      {t.reviews_queued > 0 && <span>{t.reviews_queued} to review</span>}
                      <span>{ago(t.last_activity ?? t.studied_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "31%" }} /><col style={{ width: "13%" }} /><col style={{ width: "20%" }} />
                    <col style={{ width: "14%" }} /><col style={{ width: "9%" }} /><col style={{ width: "13%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Topic</th><th>State</th><th>Puzzles solved</th>
                      <th>Capablanca moves</th><th className="num">To review</th><th>Last worked on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.topics.map(t => (
                      <tr key={t.slug} onClick={() => onOpen(t.slug)} style={{ cursor: "pointer" }}>
                        <td style={{ color: "var(--text-strong)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }} title={t.title}>{t.title}</td>
                        <td><StateTag state={t.status} /></td>
                        <td>
                          <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                            <span style={{ minWidth: 64 }}>{puzzleText(t)}</span>
                            {t.has_puzzles && t.puzzles.attempts > 0 &&
                              <div style={{ width: 80 }}><Meter value={t.puzzles.solved / t.puzzles.attempts}
                                tone={t.status === "passed" ? "var(--win)" : undefined} /></div>}
                          </div>
                        </td>
                        <td>{t.drills.total ? `${t.drills.solved} of ${t.drills.total}` : "–"}</td>
                        <td className="num">{t.reviews_queued || "–"}</td>
                        <td className="muted">{ago(t.last_activity ?? t.studied_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
