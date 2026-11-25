// frontend/src/pages/learn/Openings.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { OPENINGS, E4_OPENINGS, D4_OPENINGS, FLANK_OPENINGS } from "../../data/openings";
import type { OpeningKey } from "../../data/openings";
import { useBoardTheme } from "../../themes";
import { useBoardSize, fenAtPly, pairMoves } from "./boardUtils";
import { useNarrow } from "../../viewport";
import { PageHead, SectionHead, StepIcon } from "../../ui";
import { BackLink } from "./TopicLesson";

// ── Opening components ────────────────────────────────────────────────────────

export function OpeningCard({
  openingKey, onSelect,
}: { openingKey: OpeningKey; onSelect: (k: OpeningKey) => void }) {
  const o = OPENINGS[openingKey];
  return (
    <button className="topic-card" onClick={() => onSelect(openingKey)}>
      <span className="topic-icon" aria-hidden>{o.icon}</span>
      <span className="topic-title">{o.name}</span>
      <span className="topic-desc"><span className="mono">{o.firstMoves}</span></span>
      <span className="topic-foot xsmall muted">{o.lines.length} lines</span>
    </button>
  );
}

export function OpeningsHub({
  onSelect, onBack,
}: { onSelect: (k: OpeningKey) => void; onBack: () => void }) {
  const groups: [string, OpeningKey[]][] = [["1.e4 openings", E4_OPENINGS], ["1.d4 openings", D4_OPENINGS], ["Flank openings", FLANK_OPENINGS]];
  return (
    <div>
      <BackLink onClick={onBack} />
      <PageHead title="Openings" lead="Pick an opening, then step through its main lines move by move." />
      {groups.map(([title, keys]) => (
        <section key={title}>
          <SectionHead title={title} />
          <div className="topic-grid">
            {keys.map(k => <OpeningCard key={k} openingKey={k} onSelect={onSelect} />)}
          </div>
        </section>
      ))}
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

  return (
    <div>
      <BackLink onClick={onBack} label="Openings" />
      <PageHead title={opening.name} lead={<span className="mono">{opening.firstMoves}</span>} />

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Line selector */}
        <div className="stack sm" style={{ width: narrow ? "100%" : 240 }}>
          <span className="small" style={{ fontWeight: 600 }}>Lines</span>
          <div role="radiogroup" aria-label="Line" className="seg" style={{ flexDirection: "column", display: "flex" }}>
            {opening.lines.map((l, i) => (
              <button key={i} role="radio" aria-checked={lineIdx === i} onClick={() => selectLine(i)}
                style={{ justifyContent: "flex-start", whiteSpace: "normal", height: "auto", minHeight: 38, textAlign: "left", padding: "8px 12px" }}>
                {l.name}
              </button>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>{line.description}</p>
        </div>

        {/* Board + nav */}
        <div style={{ flexShrink: 0 }}>
          <div className="board-frame">
            <Chessboard
              options={{
                position: fen,
                boardStyle: { width: boardSize - 12, height: boardSize - 12, borderRadius: 4 },
                allowDragging: false,
                darkSquareStyle: { backgroundColor: boardTheme.dark },
                lightSquareStyle: { backgroundColor: boardTheme.light },
              }}
            />
          </div>
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            {[
              { label: <StepIcon dir="first" />, name: "Start", action: () => setPly(0), disabled: ply === 0 },
              { label: <StepIcon dir="prev" />, name: "Previous move", action: retreat, disabled: ply === 0 },
              { label: <StepIcon dir="next" />, name: "Next move", action: advance, disabled: ply === line.moves.length },
              { label: <StepIcon dir="last" />, name: "End", action: () => setPly(line.moves.length), disabled: ply === line.moves.length },
            ].map(({ label, name, action, disabled }) => (
              <button key={name} aria-label={name} title={name} onClick={action} disabled={disabled} style={{ width: 52, padding: 0 }}>
                {label}
              </button>
            ))}
            <span className="small muted" style={{ marginLeft: 6 }}>Move {Math.ceil(ply / 2)} of {Math.ceil(line.moves.length / 2)}</span>
          </div>
        </div>

        {/* Move table */}
        <div className="table-wrap" style={{ flex: 1, minWidth: 220, maxHeight: narrow ? undefined : boardSize, overflowY: narrow ? undefined : "auto" }}>
          <table className="move-table">
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: "calc(50% - 20px)" }} />
              <col style={{ width: "calc(50% - 20px)" }} />
            </colgroup>
            <thead style={{ position: "sticky", top: 0, background: "var(--raised)" }}>
              <tr><th></th><th>White</th><th>Black</th></tr>
            </thead>
            <tbody>
              {pairs.map(({ n, w, b }) => {
                const wPly = n * 2 - 1;
                const bPly = n * 2;
                return (
                  <tr key={n} ref={Math.ceil(ply / 2) === n ? activeRowRef : null}>
                    <td className="move-num">{n}.</td>
                    <td><span className={`move-cell${ply === wPly ? " active" : ""}`} onClick={() => setPly(wPly)}>{w}</span></td>
                    <td>{b && <span className={`move-cell${ply === bPly ? " active" : ""}`} onClick={() => setPly(bPly)}>{b}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
