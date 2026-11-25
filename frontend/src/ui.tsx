// frontend/src/ui.tsx
// Shared building blocks so every page uses the same pieces (styles in index.css).
import type { ReactNode } from "react";
import type { Quality } from "./classify";

/** Page title, one-line lead, optional actions on the right. */
export function PageHead({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

/** A section heading inside a page, with optional text or controls on the right. */
export function SectionHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {aside && <div className="aside">{aside}</div>}
    </div>
  );
}

export function Panel({ title, aside, tight, className, children }: {
  title?: ReactNode; aside?: ReactNode; tight?: boolean; className?: string; children?: ReactNode;
}) {
  return (
    <section className={["panel", tight && "tight", className].filter(Boolean).join(" ")}>
      {(title || aside) && (
        <div className="panel-head">
          {title && <h3>{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export interface SegOption<T> { value: T; label: ReactNode; sub?: ReactNode; title?: string; disabled?: boolean }

/** One-of-several choice shown as joined buttons (radio group). */
export function Segmented<T extends string | number>({ label, value, options, onChange, block, className }: {
  label: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void; block?: boolean; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={["seg", block && "block", className].filter(Boolean).join(" ")}>
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.sub ? "two-line" : undefined}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
          {o.sub && <span className="seg-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** A labelled control: label, the control, then an optional hint. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: string }) {
  return (
    <div className="stat">
      <div className="stat-value" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const QUALITY_COLOR: Record<Quality, string> = {
  best: "var(--best)", good: "var(--good)", inaccuracy: "var(--inaccuracy)",
  mistake: "var(--mistake)", blunder: "var(--blunder)",
};

export function QualityDot({ q }: { q: Quality }) {
  return <i className="qdot" style={{ background: QUALITY_COLOR[q] }} aria-hidden />;
}

const QUALITY_NAME: Record<Quality, string> = {
  best: "Best", good: "Good", inaccuracy: "Inaccuracy", mistake: "Mistake", blunder: "Blunder",
};

/** Colour key for move quality highlights. */
export function QualityLegend({ qualities }: { qualities: readonly Quality[] }) {
  return (
    <div className="legend">
      {qualities.map(q => <span key={q}><QualityDot q={q} />{QUALITY_NAME[q]}</span>)}
    </div>
  );
}

export function Meter({ value, tone }: { value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return <div className="meter" role="presentation"><i style={{ width: `${pct}%`, background: tone }} /></div>;
}

/** Step controls for replaying a game or line: first / previous / next / last. */
export function StepIcon({ dir }: { dir: "first" | "prev" | "next" | "last" }) {
  const flip = dir === "first" || dir === "prev";
  const bar = dir === "first" || dir === "last";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <path d={bar ? "M3 3l7 5-7 5z" : "M5 3l7 5-7 5z"} fill="currentColor" />
      {bar && <rect x="11" y="3" width="2" height="10" rx="0.5" fill="currentColor" />}
    </svg>
  );
}
