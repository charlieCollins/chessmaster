// frontend/src/pages/learn/shared.tsx
import { Chessboard } from "react-chessboard";
import { useBoardTheme } from "../../themes";
import type { SqStyles } from "./boardUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────



export const GOLD   = "rgba(201,168,76,0.40)";
export const RED    = "rgba(224,90,90,0.42)";
export const BLUE   = "rgba(74,158,255,0.38)";
export const GREEN  = "rgba(82,183,136,0.38)";
export const KNIGHT = "rgba(201,168,76,0.70)";


export const BOARD = 200;

export function MiniBoard({
  fen, styles = {}, caption, flip = false,
}: { fen: string; styles?: SqStyles; caption?: string; flip?: boolean }) {
  const t = useBoardTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <Chessboard options={{
        position: fen,
        boardStyle: { width: BOARD, height: BOARD, borderRadius: "var(--radius)" },
        squareStyles: styles,
        allowDragging: false,
        boardOrientation: flip ? "black" : "white",
        darkSquareStyle: { backgroundColor: t.dark },
        lightSquareStyle: { backgroundColor: t.light },
      }} />
      {caption && (
        <div style={{
          fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)",
          textAlign: "center", maxWidth: BOARD, lineHeight: 1.5,
        }}>
          {caption}
        </div>
      )}
    </div>
  );
}

export function TipCard({
  title, body, children,
}: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "20px 24px",
    }}>
      <h3 style={{
        fontFamily: "var(--font-display)", fontSize: 16,
        color: "var(--text-bright)", marginBottom: 10,
      }}>
        {title}
      </h3>
      <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.75, marginBottom: 18 }}>
        {body}
      </p>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <div className="section-label" style={{ marginBottom: 14 }}>{children}</div>;
}



