// frontend/src/pages/learn/BookText.tsx
// A book section from book.json: paragraphs, the original move text, and diagrams as boards.
import type { ReactNode } from "react";
import type { Block, BookDiagram } from "./api";
import { MiniBoard } from "./shared";

/** Only *italic* and **bold** — the markup the book conversion produces. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export default function BookText({ blocks, diagrams }: { blocks: Block[]; diagrams: Record<string, BookDiagram> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
      {blocks.map((b, i) => {
        if (b.kind === "para")
          return <p key={i} style={{ fontSize: 14, lineHeight: 1.75, color: "var(--text)" }}>{inline(b.text)}</p>;
        if (b.kind === "moves")
          return (
            <div key={i} className="mono" style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "pre-line",
              borderLeft: "2px solid var(--border-hi)", paddingLeft: 10 }}>
              {b.text}
            </div>
          );
        const d = diagrams[b.fig];
        if (!d) return null;
        const side = d.fen.split(" ")[1] === "b" ? "Black" : "White";
        const caption = d.kind === "position" ? `Diagram ${b.fig.slice(3)} · ${side} to move` : `Diagram ${b.fig.slice(3)} · illustration`;
        return <div key={i} style={{ alignSelf: "flex-start", margin: "6px 0" }}><MiniBoard fen={d.fen} caption={caption} /></div>;
      })}
    </div>
  );
}
