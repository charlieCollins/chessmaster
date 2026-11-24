// frontend/src/pages/learn/Openings.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { OPENINGS, E4_OPENINGS, D4_OPENINGS, FLANK_OPENINGS } from "../../data/openings";
import type { OpeningKey } from "../../data/openings";
import { useBoardTheme } from "../../themes";
import { useBoardSize, fenAtPly, pairMoves } from "./boardUtils";
import { useNarrow } from "../../viewport";

// ── Opening components ────────────────────────────────────────────────────────

export function OpeningCard({
  openingKey, onSelect,
}: { openingKey: OpeningKey; onSelect: (k: OpeningKey) => void }) {
  const o = OPENINGS[openingKey];
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={() => onSelect(openingKey)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--raised)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderColor: hovered ? "var(--gold)" : "var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px",
        cursor: "pointer", width: 190, userSelect: "none",
        transition: "border-color var(--transition), background var(--transition)",
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{o.icon}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--text-bright)", marginBottom: 4 }}>
        {o.name}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", marginBottom: 6, letterSpacing: "0.04em" }}>
        {o.firstMoves}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.55 }}>
        {o.lines.length} lines
      </div>
    </div>
  );
}

export function OpeningsHub({
  onSelect, onBack,
}: { onSelect: (k: OpeningKey) => void; onBack: () => void }) {
  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-display)", fontSize: 13, color: "var(--text-dim)",
    letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ghost" onClick={onBack}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>
          Openings
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>pick an opening family to study</span>
      </div>

      <section>
        <div style={labelStyle}>1.e4 Openings</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {E4_OPENINGS.map(k => <OpeningCard key={k} openingKey={k} onSelect={onSelect} />)}
        </div>
      </section>

      <section>
        <div style={labelStyle}>1.d4 Openings</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {D4_OPENINGS.map(k => <OpeningCard key={k} openingKey={k} onSelect={onSelect} />)}
        </div>
      </section>

      <section>
        <div style={labelStyle}>Flank Openings</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {FLANK_OPENINGS.map(k => <OpeningCard key={k} openingKey={k} onSelect={onSelect} />)}
        </div>
      </section>
    </div>
  );
}

export function OpeningDetail({
  openingKey, onBack,
}: { openingKey: OpeningKey; onBack: () => void }) {
  const opening = OPENINGS[openingKey];
  const [lineIdx, setLineIdx] = useState(0);
  const [ply, setPly] = useState(0);
  const boardTheme = useBoardTheme();
  // FIX 5 — responsive board size
  const boardSize = useBoardSize(420);
  const narrow = useNarrow();
  // FIX 6 — ref for active row auto-scroll
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  const line = opening.lines[lineIdx];
  const fen  = fenAtPly(line.moves, ply);
  const pairs = pairMoves(line.moves);

  function selectLine(idx: number) {
    setLineIdx(idx);
    setPly(0);
  }

  const advance = useCallback(() => setPly(p => Math.min(p + 1, line.moves.length)), [line.moves.length]);
  const retreat = useCallback(() => setPly(p => Math.max(p - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft")  retreat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, retreat]);

  // FIX 6 — scroll active row into view when ply changes
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [ply]);

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button className="ghost" onClick={onBack}>← Openings</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-bright)" }}>
          {opening.name}
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>{opening.firstMoves}</span>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* Line selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
          <div style={labelStyle}>Lines</div>
          {opening.lines.map((l, i) => (
            <button
              key={i}
              onClick={() => selectLine(i)}
              style={{
                textAlign: "left", padding: "8px 12px",
                background: lineIdx === i ? "var(--raised)" : "transparent",
                border: `1px solid ${lineIdx === i ? "var(--gold)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                color: lineIdx === i ? "var(--gold)" : "var(--text)",
                fontFamily: "var(--font-mono)", fontSize: 12,
                cursor: "pointer",
              }}
            >
              {l.name}
            </button>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.65 }}>
            {line.description}
          </div>
        </div>

        {/* Board + nav + move table */}
        <div style={{ flexShrink: 0 }}>
          <Chessboard
            options={{
              position: fen,
              boardStyle: { width: boardSize, height: boardSize, borderRadius: "var(--radius)" },
              allowDragging: false,
              darkSquareStyle: { backgroundColor: boardTheme.dark },
              lightSquareStyle: { backgroundColor: boardTheme.light },
            }}
          />

          {/* Nav controls */}
          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
            {[
              { label: "|‹", action: () => setPly(0),                         disabled: ply === 0 },
              { label: "‹",  action: retreat,                                  disabled: ply === 0 },
              { label: "›",  action: advance,                                  disabled: ply === line.moves.length },
              { label: "›|", action: () => setPly(line.moves.length),          disabled: ply === line.moves.length },
            ].map(({ label, action, disabled }) => (
              <button key={label} onClick={action} disabled={disabled}
                style={{ padding: "5px 12px", fontFamily: "var(--font-mono)" }}>
                {label}
              </button>
            ))}
            <span className="mono dim" style={{ fontSize: 11, marginLeft: 4 }}>
              {ply} / {line.moves.length}
            </span>
          </div>

          {/* Move table */}
          <div style={{
            marginTop: 10, maxHeight: narrow ? undefined : 220, overflowY: narrow ? undefined : "auto",
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            background: "var(--surface)",
          }}>
            <table className="move-table">
              <colgroup>
                <col style={{ width: 32 }} />
                <col style={{ width: "calc(50% - 16px)" }} />
                <col style={{ width: "calc(50% - 16px)" }} />
              </colgroup>
              <thead style={{ position: "sticky", top: 0, background: "var(--raised)" }}>
                <tr>
                  <th style={{ textAlign: "right", paddingRight: 8 }}>#</th>
                  <th>White</th>
                  <th>Black</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map(({ n, w, b }) => {
                  const wPly = n * 2 - 1;
                  const bPly = n * 2;
                  return (
                    <tr key={n} ref={Math.ceil(ply / 2) === n ? activeRowRef : null}>
                      <td className="move-num">{n}.</td>
                      <td style={{ padding: "2px 4px" }}>
                        <span
                          className={`move-cell${ply === wPly ? " active" : ""}`}
                          onClick={() => setPly(wPly)}
                          style={{ color: ply === wPly ? "var(--gold)" : "var(--text)" }}
                        >
                          {w}
                        </span>
                      </td>
                      <td style={{ padding: "2px 4px" }}>
                        {b && (
                          <span
                            className={`move-cell${ply === bPly ? " active" : ""}`}
                            onClick={() => setPly(bPly)}
                            style={{ color: ply === bPly ? "var(--gold)" : "var(--text)" }}
                          >
                            {b}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

