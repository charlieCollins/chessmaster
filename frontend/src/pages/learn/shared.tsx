// frontend/src/pages/learn/shared.tsx
import { Chessboard } from "react-chessboard";
import { useBoardTheme } from "../../themes";
import type { SqStyles } from "./boardUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────



export const GOLD   = "rgba(214,168,81,0.42)";
export const RED    = "rgba(224,90,90,0.42)";
export const BLUE   = "rgba(74,158,255,0.38)";
export const GREEN  = "rgba(82,183,136,0.38)";
export const KNIGHT = "rgba(214,168,81,0.70)";


export const BOARD = 200;

export function MiniBoard({
  fen, styles = {}, caption, flip = false,
}: { fen: string; styles?: SqStyles; caption?: string; flip?: boolean }) {
  const t = useBoardTheme();
  return (
    <figure className="stack sm" style={{ alignItems: "center", width: BOARD + 12 }}>
      <div className="board-frame" style={{ padding: 4, borderRadius: 8 }}>
        <Chessboard options={{
          position: fen,
          boardStyle: { width: BOARD + 4, height: BOARD + 4, borderRadius: 3 },
          squareStyles: styles,
          allowDragging: false,
          boardOrientation: flip ? "black" : "white",
          darkSquareStyle: { backgroundColor: t.dark },
          lightSquareStyle: { backgroundColor: t.light },
        }} />
      </div>
      {caption && <figcaption className="xsmall muted" style={{ textAlign: "center", fontFamily: "var(--font-ui)", lineHeight: 1.45 }}>{caption}</figcaption>}
    </figure>
  );
}

export function TipCard({
  title, body, children,
}: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3 style={{ marginBottom: 8 }}>{sentenceCase(title)}</h3>
      <p style={{ marginBottom: 18 }}>{body}</p>
      <div className="row" style={{ gap: 20, alignItems: "flex-start" }}>{children}</div>
    </section>
  );
}

/** "The Basics" → "The basics" (keeps acronyms and notation such as "K+P"). */
function sentenceCase(t: string): string {
  return t.split(" ").map((w, i) => (i === 0 || /[A-Z].*[A-Z+]|\d/.test(w) ? w : w.toLowerCase())).join(" ");
}

export function SectionLabel({ children }: { children: string }) {
  return <h2 style={{ fontSize: 21, marginBottom: 14 }}>{sentenceCase(children)}</h2>;
}
