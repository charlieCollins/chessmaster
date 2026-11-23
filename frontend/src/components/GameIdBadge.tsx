// frontend/src/components/GameIdBadge.tsx
// Shows a game's public ID (e.g. "k7m2qx") with click-to-copy, so it can be
// pasted into a conversation ("in game k7m2qx, why was move 14 a blunder?").
// The full game lives in games/<id>.pgn.
import { useEffect, useRef, useState } from "react";

export default function GameIdBadge({ id, size = 12 }: { id: string | null | undefined; size?: number }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!id) return null;

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id!);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — the ID is still visible to select by hand */
    }
  }

  return (
    <button
      className="ghost"
      onClick={copy}
      title={`Game ID — click to copy. Saved as games/${id}.pgn`}
      style={{
        fontFamily: "var(--font-mono)", fontSize: size, padding: "1px 6px",
        color: copied ? "var(--good)" : "var(--gold)", letterSpacing: "0.06em",
        border: "1px solid var(--border-hi)", borderRadius: 4, cursor: "copy",
      }}
    >
      {copied ? "copied" : id}
    </button>
  );
}
