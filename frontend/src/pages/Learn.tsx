// frontend/src/pages/Learn.tsx
import { useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { OPENINGS, E4_OPENINGS, D4_OPENINGS, FLANK_OPENINGS } from "../data/openings";
import type { OpeningKey } from "../data/openings";
import { useBoardTheme } from "../themes";

// ── Helpers ───────────────────────────────────────────────────────────────────

type SqStyles = Record<string, { backgroundColor: string }>;

const GOLD   = "rgba(201,168,76,0.40)";
const RED    = "rgba(224,90,90,0.42)";
const BLUE   = "rgba(74,158,255,0.38)";
const GREEN  = "rgba(82,183,136,0.38)";
const KNIGHT = "rgba(201,168,76,0.70)";

function sq(squares: string[], color: string): SqStyles {
  return Object.fromEntries(squares.map(s => [s, { backgroundColor: color }]));
}

const BOARD = 200;

function MiniBoard({
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

function TipCard({
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

function SectionLabel({ children }: { children: string }) {
  return <div className="section-label" style={{ marginBottom: 14 }}>{children}</div>;
}

// ── Opening utilities ─────────────────────────────────────────────────────────

function fenAtPly(moves: string[], ply: number): string {
  const chess = new Chess();
  for (let i = 0; i < ply; i++) {
    try { chess.move(moves[i]); } catch { break; }
  }
  return chess.fen();
}

function pairMoves(moves: string[]): Array<{ n: number; w: string; b: string | null }> {
  const pairs: Array<{ n: number; w: string; b: string | null }> = [];
  for (let i = 0; i < moves.length; i += 2)
    pairs.push({ n: i / 2 + 1, w: moves[i], b: moves[i + 1] ?? null });
  return pairs;
}

// ── Knights lesson ────────────────────────────────────────────────────────────

function KnightsLesson({ onBack }: { onBack: () => void }) {

  // ── precomputed square styles ──

  // Tip 1a — knight on d4: attacks c6 e6 f5 f3 e2 c2 b3 b5
  const d4 = {
    ...sq(["d4"], KNIGHT),
    ...sq(["c6","e6","f5","f3","e2","c2","b3","b5"], GOLD),
  };
  // Tip 1b — knight on h4 (rim): attacks g6 f5 f3 g2
  const h4 = {
    ...sq(["h4"], KNIGHT),
    ...sq(["g6","f5","f3","g2"], GOLD),
  };
  // Tip 1c — knight on a1 (corner): attacks b3 c2
  const a1 = {
    ...sq(["a1"], KNIGHT),
    ...sq(["b3","c2"], GOLD),
  };

  // Tip 2 — color switching: knight on d4 (light) attacks only dark squares
  // d4 is light (4+4=8 even); attacks are all dark. Same styles as tip 1a.

  // Tip 3 — fork: Nc7 attacks Ra8 and Ke8
  const fork = {
    ...sq(["c7"], KNIGHT),
    ...sq(["a8","e8"], RED),
  };

  // Tip 4 — outpost: Ne5 protected by d4 pawn
  const outpost = {
    ...sq(["e5"], KNIGHT),
    ...sq(["d4"], GREEN),
  };

  // Tip 5 — 4-move diagonal: knight at a1, target c3, path via b3→d4→b5
  const fourMove = {
    ...sq(["a1"], KNIGHT),
    ...sq(["b3","d4","b5"], BLUE),
    ...sq(["c3"], RED),
  };

  // Tip 6 — flee diagonally: knight at d4, king at h8 (far diagonal, safe)
  const flee = {
    ...sq(["d4"], RED),
    ...sq(["c6","e6","f5","f3","e2","c2","b3","b5"], RED),
    ...sq(["h8"], GREEN),
    ...sq(["g7","f6","e5"], "rgba(82,183,136,0.18)"), // escape path
  };

  // Tip 7 — push off outpost: Ne6 under threat from pawn push f4→f5
  const pushOff = {
    ...sq(["e6"], RED),            // enemy knight
    ...sq(["f4"], KNIGHT),         // your pawn
    ...sq(["f5"], GREEN),          // pawn's destination (attacks e6)
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ghost" onClick={onBack}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>
          Knights
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>♞ movement · tactics · escapes</span>
      </div>

      {/* ── Section 1 ── */}
      <section>
        <SectionLabel>The Basics</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Rim is Dim — Center is King"
            body="A knight in the center of the board controls up to 8 squares. On the edge it controls 4, and in the corner just 2. Every move your knight spends on the rim is wasted potential. The goal is always to find a central square or a strong outpost."
          >
            <MiniBoard fen="8/8/8/8/3N4/8/8/8 w - - 0 1" styles={d4} caption="d4 → 8 squares" />
            <MiniBoard fen="8/8/8/8/7N/8/8/8 w - - 0 1" styles={h4} caption="h4 → 4 squares" />
            <MiniBoard fen="8/8/8/8/8/8/8/N7 w - - 0 1" styles={a1} caption="a1 → 2 squares" />
          </TipCard>

          <TipCard
            title="Knights Always Change Square Color"
            body="A knight on a light square always lands on a dark square, and vice versa. This has a critical consequence: if you need your knight to return to the same color square it started on, it always takes an even number of moves. This 'parity' is the root of the 4-move diagonal rule below."
          >
            <MiniBoard
              fen="8/8/8/8/3N4/8/8/8 w - - 0 1"
              styles={d4}
              caption="d4 is a light square — all 8 attacked squares are dark"
            />
          </TipCard>

          <TipCard
            title="Knights Are Slow — Plan Ahead"
            body="Unlike a bishop or queen that can cross the board in one move, a knight needs 4–5 moves to travel from one side to the other. Rerouting a knight takes time. Place your knight where it can stay active for many moves — don't move it unless you have a clear destination."
          >
            <MiniBoard
              fen="8/8/8/8/8/8/8/N7 w - - 0 1"
              styles={{
                ...sq(["a1"], KNIGHT),
                ...sq(["b3","d4","f5","e7","g8"], BLUE),
              }}
              caption="a1→b3→d4→f5→e7→g8: a knight needs 5 moves to cross the board"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 2 ── */}
      <section>
        <SectionLabel>Attacking with Knights</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="The Fork — Two Pieces, One Move"
            body="The fork is the knight's signature weapon. Because the knight attacks in all directions simultaneously, it can threaten two (or even three) enemy pieces at once. Your opponent can only save one. Look for knight fork opportunities whenever your opponent's king and a major piece are on the same color square with a knight square between them."
          >
            <MiniBoard
              fen="r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1"
              styles={fork}
              caption="Nc7+ forks Ra8 and Ke8 — black must move the king and lose the rook"
            />
            <MiniBoard
              fen="8/8/8/1N6/8/p7/r7/1k2K3 w - - 0 1"
              styles={{
                ...sq(["b5"], KNIGHT),
                ...sq(["a3","c3","a7","d4","d6","c7"], GOLD),
                ...sq(["a2","k1".replace("k","b")], RED),
              }}
              caption="Nb5 attacks Ra2, Bk1, and pawn simultaneously — a triple fork"
            />
          </TipCard>

          <TipCard
            title="The Outpost — A Knight's Dream Square"
            body="An outpost is an advanced square that cannot be attacked by any enemy pawn. A knight on an outpost, especially one supported by your own pawn, becomes a permanent fixture — your opponent has no easy way to dislodge it. Outpost knights, particularly on e5, d5, or f5, often decide games entirely on their own."
          >
            <MiniBoard
              fen="8/pp1p2pp/8/4N3/3P4/8/8/8 w - - 0 1"
              styles={outpost}
              caption="Ne5 on outpost — d4 pawn protects it (green). Black's pawns on a7/b7/d7/g7/h7 can never attack e5"
            />
          </TipCard>

          <TipCard
            title="Knights Shine in Closed Positions"
            body="In open positions, bishops dominate with long diagonal sweeps. But when pawn chains lock the center, knights become the superior piece — they can hop over the locked pawns to reach any square. If you have a knight vs your opponent's bishop in a closed position, you're likely better off."
          >
            <MiniBoard
              fen="r1bqkb1r/pp1p1ppp/2n1pn2/2p5/2P1P3/2N2N2/PP1P1PPP/R1BQKB1R w KQkq - 0 6"
              caption="Closed center — knights leap over the pawn wall, bishops are blocked"
            />
            <MiniBoard
              fen="6k1/5pp1/7p/8/8/7P/5PP1/6K1 w - - 0 1"
              styles={sq(["a1","b1","c1","d1","e1","f1","h1","a8","b8","c8","d8","e8","f8","h8"], GREEN)}
              caption="Open position — bishops sweep long diagonals, knights struggle to keep up"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 3 ── */}
      <section>
        <SectionLabel>Avoiding and Escaping Knights</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="The 4-Move Diagonal Rule"
            body='A square exactly 2 files AND 2 ranks away from a knight (diagonally) requires a minimum of 4 moves to reach — even though it looks close. This is because both squares share the same color, and the knight must toggle color twice to get there. The path from a1 to c3 is: a1→b3→d4→b5→c3 (four hops). When a knight is threatening you, putting yourself 2 squares diagonally away buys you 4 full tempos to escape or counter.'
          >
            <MiniBoard
              fen="8/8/8/8/8/8/8/N7 w - - 0 1"
              styles={fourMove}
              caption="a1 → b3(1) → d4(2) → b5(3) → c3(4) — shortest path is 4 moves"
            />
          </TipCard>

          <TipCard
            title="Flee Diagonally to Maximize Distance"
            body="When a knight is chasing your king or an important piece, moving diagonally away from it is your best escape strategy. Knights cannot pursue along diagonals efficiently — they must take indirect L-shaped detours. Each diagonal step you take forces the knight to spend 2–3 moves catching up. A king on h8 with the enemy knight on d4 has plenty of time."
          >
            <MiniBoard
              fen="7k/8/8/8/3n4/8/8/8 w - - 0 1"
              styles={flee}
              caption="Knight on d4 (red) threatens red squares. King on h8 (green) is 4 files and 4 ranks away — completely safe. Diagonal squares g7/f6/e5 show the escape corridor."
              flip
            />
          </TipCard>

          <TipCard
            title="Push the Knight Off Its Outpost"
            body="When your opponent's knight is sitting on a strong outpost, your primary goal is to attack it with a pawn advance. Once a pawn threatens the outpost square, the knight must move or be captured. A knight that gets evicted from its outpost loses all its power and must wander until it finds another home — which often costs crucial tempos."
          >
            <MiniBoard
              fen="8/8/4n3/8/5P2/8/8/8 w - - 0 1"
              styles={pushOff}
              caption="f4-f5 (green) directly attacks Ne6 (red). The knight must retreat — push the pawn!"
            />
          </TipCard>

        </div>
      </section>

    </div>
  );
}

// ── Bishops lesson ────────────────────────────────────────────────────────────

function BishopsLesson({ onBack }: { onBack: () => void }) {

  // ── precomputed square styles ──

  const BISH = "rgba(201,168,76,0.70)";

  // Tip 1a — good bishop: e2 (LIGHT), own pawns on d4+f4 (DARK) — diagonals open
  const goodBishop = {
    ...sq(["e2"], BISH),
    ...sq(["d4","f4"], GREEN),
    ...sq(["d3","c4","b5","a6"], GOLD),
    ...sq(["f3","g4","h5"], GOLD),
  };

  // Tip 1b — bad bishop: e2 (LIGHT), own pawns on d3+f3 (LIGHT) — BLOCKING diagonals
  const badBishop = {
    ...sq(["e2"], BISH),
    ...sq(["d3","f3"], RED),
    ...sq(["c4","b5","a6"], "rgba(224,90,90,0.18)"),
    ...sq(["g4","h5"], "rgba(224,90,90,0.18)"),
  };

  // Tip 2 — bishop pair: b2 (DARK) + g2 (LIGHT) — together cover all 64 squares
  const bishopPair = {
    ...sq(["b2","g2"], BISH),
    ...sq(["a1","c3","d4","e5","f6","g7","h8"], "rgba(74,158,255,0.22)"),  // b2 dark diagonal
    ...sq(["h1","f3","e4","d5","c6","b7","a8"], "rgba(201,168,76,0.22)"),  // g2 light diagonal
  };

  // Tip 3 — open vs blocked
  const openBish = {
    ...sq(["a2"], BISH),
    ...sq(["b3","c4","d5","e6","f7","g8"], GOLD),
  };
  const closedBish = {
    ...sq(["c2"], BISH),
    ...sq(["d3"], RED),
    ...sq(["e4","f5","g6","h7"], "rgba(224,90,90,0.18)"),
  };

  // Tip 4 — fianchetto: bishop on g2, controlling the long h1–a8 diagonal
  const fianchetto = {
    ...sq(["g2"], BISH),
    ...sq(["f3","e4","d5","c6","b7","a8"], GOLD),
    ...sq(["h1"], "rgba(201,168,76,0.35)"),
  };

  // Tip 5 — pin: Bb2 (DARK) pins Nd4 (DARK) against Kf6 (DARK) — all same diagonal
  const pinStyles = {
    ...sq(["b2"], BISH),
    ...sq(["d4"], RED),
    ...sq(["f6"], "rgba(224,90,90,0.45)"),
    ...sq(["c3","e5"], "rgba(201,168,76,0.35)"),
  };

  // Tip 6 — blocking diagonal: enemy bishop on a8, our pawn on d5 neutralises it
  const blockStyles = {
    ...sq(["a8"], "rgba(224,90,90,0.65)"),
    ...sq(["d5"], GREEN),
    ...sq(["b7","c6"], "rgba(224,90,90,0.25)"),
    ...sq(["e4","f3","g2","h1"], "rgba(82,183,136,0.25)"),
  };

  // Tip 7 — color weakness: own pawns on dark squares → light squares permanently weak
  const colorWeak = {
    ...sq(["b4","d4","f4"], GREEN),
    ...sq(["c4","e4","b5","d5","f5","c3","e3"], "rgba(224,90,90,0.20)"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ghost" onClick={onBack}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>
          Bishops
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>♝ diagonals · pair · color control</span>
      </div>

      {/* ── Section 1 ── */}
      <section>
        <SectionLabel>The Basics</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Good vs Bad Bishop"
            body="A bishop's effectiveness hinges entirely on its relationship with its own pawns. When your pawns occupy the same-colored squares as your bishop, they block its diagonals and trap it permanently — this is the 'bad bishop.' When your pawns sit on the opposite color, the diagonals stay open and the piece remains active for the whole game. Before pushing central pawns, always check: am I slowly building a prison for my own bishop?"
          >
            <MiniBoard
              fen="8/8/8/8/3P1P2/8/4B3/8 w - - 0 1"
              styles={goodBishop}
              caption="Good bishop — pawns on dark squares (green) leave the light diagonals fully open"
            />
            <MiniBoard
              fen="8/8/8/8/8/3P1P2/4B3/8 w - - 0 1"
              styles={badBishop}
              caption="Bad bishop — own pawns (red) on the same light squares seal every diagonal"
            />
          </TipCard>

          <TipCard
            title="The Bishop Pair"
            body="Two bishops together are one of chess's most powerful combinations. One controls all 32 light squares, the other all 32 dark squares — together they dominate every corner of the board. An opponent down to one bishop is permanently blind to half the board. The bishop pair is especially fearsome in open and semi-open positions with long unobstructed diagonals. Preserving your bishop pair while denying it to your opponent is a major strategic goal."
          >
            <MiniBoard
              fen="6k1/8/8/8/8/8/1B4B1/6K1 w - - 0 1"
              styles={bishopPair}
              caption="Bb2 sweeps the dark diagonal (blue), Bg2 sweeps the light diagonal (gold) — together they cover the entire board"
            />
          </TipCard>

          <TipCard
            title="Bishops Need Open Lines"
            body="A bishop on an open diagonal can reach across the board in a single move — a devastating long-range weapon. But close the center with pawns and that same bishop becomes a tall pawn, unable to do anything useful. Before committing to a pawn structure, ask whether it opens or closes your bishop's key diagonals. In a truly blocked position, consider trading the bishop for a knight that can leap over the pawns instead."
          >
            <MiniBoard
              fen="8/8/8/8/8/8/B7/8 w - - 0 1"
              styles={openBish}
              caption="Bishop on a2 sweeps the entire b3–g8 diagonal — unstoppable long-range reach"
            />
            <MiniBoard
              fen="8/8/8/8/8/3P4/2B5/8 w - - 0 1"
              styles={closedBish}
              caption="Own pawn on d3 (red) sits on the same light color — the diagonal toward h7 is permanently sealed"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 2 ── */}
      <section>
        <SectionLabel>Attacking with Bishops</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="The Fianchetto — Dominating the Long Diagonal"
            body="Developing your bishop to g2 (via pawns to g3) is called a fianchetto. The bishop on g2 controls the entire h1–a8 diagonal — one of the most influential lines on the board — while simultaneously guarding the castled king behind it. The setup is a long-term investment: keep the g3 pawn structure intact and the bishop dominates all game. If your opponent breaks the pawn shield (h5-h6), the bishop's power and your king's safety collapse together."
          >
            <MiniBoard
              fen="6k1/pp4pp/8/8/8/6P1/PPPPPPBP/6K1 w - - 0 1"
              styles={fianchetto}
              caption="Fianchettoed bishop on g2 — controls the full h1–a8 long diagonal while shielding the king on g1"
            />
          </TipCard>

          <TipCard
            title="The Pin Along the Diagonal"
            body="Bishops excel at absolute pins — where the pinned piece literally cannot move without exposing the king to check. A bishop on b2 pinning a knight on d4 against the king on f6 means the knight is frozen: any move reveals a check. This restricts your opponent's options drastically and lets you pile pressure on the pinned piece with pawns or rooks. The best counters to a pin are: moving the king off the line, interposing a piece, or capturing the bishop. Use pins early to strangle enemy development."
          >
            <MiniBoard
              fen="8/8/5k2/8/3n4/8/1B6/4K3 w - - 0 1"
              styles={pinStyles}
              caption="Bb2 pins Nd4 against Kf6 — the knight cannot move legally without exposing the king to check"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 3 ── */}
      <section>
        <SectionLabel>Defending Against Bishops</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Block the Long Diagonal"
            body="The most effective counter to an aggressive bishop is to close its diagonal with a pawn. Unlike a piece, a pawn cannot be chased away by the enemy bishop — it simply sits on the key square and neutralises the attacker for the rest of the game. Identify the bishop's key diagonal, find the square that cuts it in half, and plant a pawn there. The bishop becomes a passive spectator unable to contribute to the attack. The square to block is usually the one that splits the diagonal closest to your own position."
          >
            <MiniBoard
              fen="b7/8/8/3P4/8/8/8/7K w - - 0 1"
              styles={blockStyles}
              caption="Black bishop on a8 (red) neutralised — white pawn on d5 (green) blocks the diagonal; king on h1 is completely safe"
            />
          </TipCard>

          <TipCard
            title="Color Weakness — A Permanent Scar"
            body="When you trade away a bishop, you permanently lose control of all the squares it used to defend. If your pawns are locked on the same color as the lost bishop, the consequences are catastrophic: your pawns become easy targets and your opponent's pieces can occupy any square in that color complex with complete impunity — you can never challenge them there. Before offering a bishop trade, always ask: will my remaining pieces be able to cover those squares? A color weakness can silently decide games even when material is equal."
          >
            <MiniBoard
              fen="8/8/8/8/1P1P1P2/8/8/6K1 w - - 0 1"
              styles={colorWeak}
              caption="All white pawns on dark squares — the light squares (red) are permanent outposts for the opponent. Without the light-squared bishop, nothing can ever defend them."
            />
          </TipCard>

        </div>
      </section>

    </div>
  );
}

// ── Rooks lesson ──────────────────────────────────────────────────────────────

function RooksLesson({ onBack }: { onBack: () => void }) {

  const ROOK = "rgba(201,168,76,0.70)";

  // Tip 1a — open e-file: rook on e1, no pawns on e-file
  const openFile = {
    ...sq(["e1"], ROOK),
    ...sq(["e2","e3","e4","e5","e6","e7","e8"], GOLD),
  };
  // Tip 1b — blocked rook: rook on d1, own pawn on d2 seals the file
  const blockedRook = {
    ...sq(["d1"], ROOK),
    ...sq(["d2"], RED),
    ...sq(["d3","d4","d5","d6","d7","d8"], "rgba(224,90,90,0.18)"),
  };

  // Tip 2 — rook on 7th rank: e7 rook flanked by enemy pawns
  const seventhRank = {
    ...sq(["e7"], ROOK),
    ...sq(["a7","b7","c7","d7","f7","g7","h7"], RED),
    ...sq(["h8"], "rgba(224,90,90,0.35)"),
  };

  // Tip 3 — doubled rooks on d-file targeting d7 pawn
  const doubledRooks = {
    ...sq(["d1","d2"], ROOK),
    ...sq(["d3","d4","d5","d6","d7"], GOLD),
    ...sq(["d8"], "rgba(201,168,76,0.20)"),
  };

  // Tip 4a — correct: rook on a1 BEHIND passed pawn on a5
  const behindPawn = {
    ...sq(["a1"], ROOK),
    ...sq(["a2","a3","a4"], GOLD),
    ...sq(["a5"], GREEN),
    ...sq(["a6","a7","a8"], "rgba(82,183,136,0.30)"),
  };
  // Tip 4b — wrong: rook on a7 IN FRONT of passed pawn on a5
  const inFrontPawn = {
    ...sq(["a7"], RED),
    ...sq(["a5"], GREEN),
    ...sq(["a6"], "rgba(224,90,90,0.28)"),
  };

  // Tip 5 — back rank checkmate: rook on d1 checks king trapped by own pawns
  const backRank = {
    ...sq(["d1"], "rgba(224,90,90,0.65)"),
    ...sq(["g1"], "rgba(224,90,90,0.55)"),
    ...sq(["f2","g2","h2"], "rgba(224,90,90,0.38)"),
    ...sq(["e1","f1","h1"], "rgba(224,90,90,0.20)"),
  };

  // Tip 6 — rook cuts off king: Rd1 blocks black king from crossing to queenside
  const cutOff = {
    ...sq(["d1"], ROOK),
    ...sq(["d2","d3","d4","d5","d6","d7","d8"], GOLD),
    ...sq(["f7"], "rgba(224,90,90,0.35)"),
    ...sq(["a7","b7","c7"], "rgba(82,183,136,0.22)"),
  };

  // Tip 7a — connected rooks: clear back rank, rooks can see each other
  const connectedRooks = {
    ...sq(["a1","h1"], ROOK),
    ...sq(["b1","c1","d1","f1","g1"], GOLD),
  };
  // Tip 7b — disconnected: knight and bishop blocking the view between rooks
  const disconnectedRooks = {
    ...sq(["a1","h1"], ROOK),
    ...sq(["b1"], "rgba(224,90,90,0.38)"),
    ...sq(["f1"], "rgba(224,90,90,0.38)"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ghost" onClick={onBack}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>
          Rooks
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>♜ open files · 7th rank · endgames</span>
      </div>

      {/* ── Section 1 ── */}
      <section>
        <SectionLabel>The Basics</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Rooks Need Open Files"
            body="A rook blocked by its own pawn is worth almost nothing — it's a passive piece waiting for something to happen. The first goal is always to put your rook on an open file (no pawns of either color) or a half-open file (only the opponent's pawn blocking). From an open file a rook can penetrate deep into the opponent's position, create threats on the 7th rank, and coordinate with the other rook. Creating open files — through pawn exchanges or sacrifices — is one of the most important strategic ideas in chess."
          >
            <MiniBoard
              fen="8/pppp1ppp/8/8/8/8/PPPP1PPP/4RK2 w - - 0 1"
              styles={openFile}
              caption="Open e-file — rook on e1 controls all 8 squares of the file with no obstructions"
            />
            <MiniBoard
              fen="8/pppppppp/8/8/8/8/PPPPPPPP/3RK3 w - - 0 1"
              styles={blockedRook}
              caption="Blocked rook — own pawn on d2 (red) seals the file; the rook has nowhere to go"
            />
          </TipCard>

          <TipCard
            title="The 7th Rank — The Pig"
            body="A rook on the 7th rank (your opponent's 2nd rank) is so powerful it earns a nickname: 'the pig.' It sits behind all of the opponent's undeveloped pawns and attacks them all simultaneously. The enemy king is also usually forced to the back rank where it cowers in the corner. A rook on the 7th is especially devastating when it's supported by another rook on the same rank — two rooks on the 7th can be unstoppable."
          >
            <MiniBoard
              fen="7k/ppppRppp/8/8/8/8/8/6K1 w - - 0 1"
              styles={seventhRank}
              caption="Re7 on the 7th rank — every black pawn (red) is under attack. The king on h8 is pinned to the corner"
            />
          </TipCard>

          <TipCard
            title="Doubled Rooks — The Battery"
            body="Two rooks on the same file form a battery — one of the most powerful attacking formations. The front rook does the work while the back rook defends it and doubles the firepower. A doubled rook battery on an open file can break through any defense given time. The principle extends to ranks as well: two rooks on the 7th rank simultaneously threatening multiple pawns and a trapped king is often decisive."
          >
            <MiniBoard
              fen="7k/3p4/8/8/8/8/3R4/3R3K w - - 0 1"
              styles={doubledRooks}
              caption="Rooks on d1 and d2 — the entire d-file is dominated. The d7 pawn is under relentless pressure"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 2 ── */}
      <section>
        <SectionLabel>Attacking with Rooks</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Rook Behind the Passed Pawn"
            body="In endgames with passed pawns, the placement of the rook relative to the pawn is critical. The correct principle: your own rook belongs BEHIND your passed pawn — it pushes the pawn forward and supports it all the way to promotion. Your rook should ALSO go behind the opponent's passed pawn — attacking it from behind means the rook gains value as the pawn advances, while a rook in front of a pawn gets pushed back and loses activity."
          >
            <MiniBoard
              fen="8/8/8/P7/8/8/8/R6K w - - 0 1"
              styles={behindPawn}
              caption="Rook behind the passer (correct) — Ra1 supports the a5 pawn all the way to a8"
            />
            <MiniBoard
              fen="R7/8/8/P7/8/8/8/7K w - - 0 1"
              styles={inFrontPawn}
              caption="Rook in front (wrong) — Ra7 is passive; as the pawn advances the rook just gets in the way"
            />
          </TipCard>

          <TipCard
            title="The Back Rank — Your Pawn Shield Becomes a Prison"
            body="Castling behind a pawn shield is good for king safety — until those same pawns trap the king on the back rank. If your opponent's rook or queen gets to your first rank and your king has no escape square, it's checkmate. The solution is to create a 'luft' (breathing room): advance one pawn one square — h3 or g3 — to give the king an escape. Always check for back rank threats before playing an otherwise natural move."
          >
            <MiniBoard
              fen="8/8/8/8/8/8/5PPP/3r2K1 b - - 0 1"
              styles={backRank}
              caption="Rd1# — back rank checkmate. The f2/g2/h2 pawns (red) that protected the king now trap it. One luft pawn (h3 or g3) would have prevented this."
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 3 ── */}
      <section>
        <SectionLabel>Endgame Principles</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Cut Off the Enemy King"
            body="In rook endgames, restricting the opponent's king is as important as promoting your own pawn. Place your rook on a rank or file that the enemy king cannot cross — this keeps the king 'cut off' from reaching the action while you advance your pawn. A king cut off from the center by just one rank can be the difference between a win and a draw. The wider the cutoff, the more powerful the restriction."
          >
            <MiniBoard
              fen="8/5k2/8/8/8/8/8/3R3K w - - 0 1"
              styles={cutOff}
              caption="Rd1 controls the entire d-file (gold) — the black king on f7 cannot cross to the a–c files (green area) to defend its pawns"
            />
          </TipCard>

          <TipCard
            title="Connect Your Rooks — The First Priority"
            body="An unconnected rook is a rook that has to defend itself. Connected rooks — nothing between them on the back rank — can instantly shift to any file, defend each other, and double on any open file in one move. Connecting your rooks is the first major milestone of the opening: develop your knights and bishops, castle, then clear the back rank. Until your rooks are connected, your position is not fully mobilised. Unconnected rooks are a sign that development is incomplete."
          >
            <MiniBoard
              fen="4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"
              styles={connectedRooks}
              caption="Connected rooks — the back rank is clear (gold). Either rook can swing to any file instantly"
            />
            <MiniBoard
              fen="4k3/8/8/8/8/8/8/RN2KB1R w KQ - 0 1"
              styles={disconnectedRooks}
              caption="Unconnected — the knight on b1 and bishop on f1 (red) block the rooks from seeing each other"
            />
          </TipCard>

        </div>
      </section>

    </div>
  );
}

// ── Pawns lesson ──────────────────────────────────────────────────────────────

function PawnsLesson({ onBack }: { onBack: () => void }) {

  // Tip 1: Connected (c4+d4) vs Isolated (d4 alone)
  const connected = {
    ...sq(["c4","d4"], GREEN),
    ...sq(["b5","c5","d5","e5"], GOLD),
  };
  const isolated = {
    ...sq(["d4"], RED),
    ...sq(["c3","c4","c5","e3","e4","e5"], "rgba(224,90,90,0.13)"),
  };

  // Tip 2: Not a passed pawn (black c6 guards d5) vs true passed pawn (d5, clear path)
  const notPassed = {
    ...sq(["d4"], "rgba(201,168,76,0.70)"),
    ...sq(["c6"], "rgba(224,90,90,0.60)"),
    ...sq(["d5"], "rgba(224,90,90,0.28)"),
  };
  const passedPawn = {
    ...sq(["d5"], GREEN),
    ...sq(["d6","d7","d8"], "rgba(82,183,136,0.28)"),
  };

  // Tip 3: Doubled pawns (d2+d3, bad) vs healthy spread (c4+e4)
  const doubledPawns = {
    ...sq(["d2","d3"], RED),
    ...sq(["d1","d4"], "rgba(224,90,90,0.18)"),
  };
  const healthyPair = {
    ...sq(["c4","e4"], GREEN),
    ...sq(["b5","c5","d5","e5","f5"], GOLD),
  };

  // Tip 4: Pawn chain — d5 (head) protected by c4 (base). Black c5 attacks base.
  const pawnChain = {
    ...sq(["d5"], GREEN),
    ...sq(["c4"], RED),
    ...sq(["c5"], "rgba(224,90,90,0.60)"),
    ...sq(["b4"], GOLD),
  };

  // Tip 5: Lever — b4-b5 breaks against black's c6 pawn
  const leverStyles = {
    ...sq(["b4","c4"], GREEN),
    ...sq(["b5"], GOLD),
    ...sq(["c6","b7"], RED),
  };

  // Tip 6: Outside passed pawn — a5 passer pulls king away, f7/g7/h7 fall
  const outsidePasser = {
    ...sq(["a5"], GREEN),
    ...sq(["a6","a7","a8"], "rgba(82,183,136,0.28)"),
    ...sq(["f7","g7","h7"], "rgba(224,90,90,0.28)"),
  };

  // Tip 7: Key squares for d4 pawn — c6, d6, e6 (king reaching any = guaranteed win)
  const keySquaresStyles = {
    ...sq(["d4"], GREEN),
    ...sq(["d5"], GOLD),
    ...sq(["c6","d6","e6"], BLUE),
    ...sq(["d7","d8"], "rgba(82,183,136,0.22)"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ghost" onClick={onBack}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>
          Pawns
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>♟ structure · breaks · endgames</span>
      </div>

      {/* ── Section 1 ── */}
      <section>
        <SectionLabel>Pawn Structure</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Connected vs Isolated Pawns"
            body="Connected pawns sit on adjacent files and can defend each other — a pawn that attacks one runs into the other recapturing. They also control a broader swathe of squares as a unit. An isolated pawn has no friendly pawns on either neighboring file, so it can only be defended by pieces — never another pawn. This makes it a permanent target: your opponent occupies the open file with a rook, places a piece in front to blockade it, and piles on. Avoid creating isolated pawns unless you're getting concrete compensation in return."
          >
            <MiniBoard
              fen="8/8/8/8/2PP4/8/8/8 w - - 0 1"
              styles={connected}
              caption="Connected c4+d4 — they cover each other and jointly control b5–e5"
            />
            <MiniBoard
              fen="8/8/8/8/3P4/8/8/8 w - - 0 1"
              styles={isolated}
              caption="Isolated d4 — no pawns on c or e files (red area). A piece blockades on d5 and the rook piles in"
            />
          </TipCard>

          <TipCard
            title="The Passed Pawn — A Criminal on the Run"
            body="A passed pawn is one that no enemy pawn can ever capture or block — there are no opposing pawns on the same file or adjacent files ahead of it. Nimzowitsch called it 'a criminal that must be restrained at once.' Left alone it will march to the 8th rank and become a queen. In endgames a passed pawn is often worth more than any tactical trick. The attacking side must advance it actively; the defending side must blockade it with a piece — ideally a knight planted on the promotion square."
          >
            <MiniBoard
              fen="8/8/2p5/8/3P4/8/8/8 w - - 0 1"
              styles={notPassed}
              caption="Not passed — black's c6 pawn (red) guards d5, blocking the white d4 pawn's advance"
            />
            <MiniBoard
              fen="8/8/8/3P4/8/8/8/8 w - - 0 1"
              styles={passedPawn}
              caption="Passed pawn — d5 has a clear runway all the way to d8. No black pawn can stop it"
            />
          </TipCard>

          <TipCard
            title="Doubled Pawns — Strength in Width, not Depth"
            body="Doubled pawns — two of the same color stacked on one file — are a structural weakness. The rear pawn can never advance while the front one is there, and they cannot protect each other laterally. Two pawns on adjacent files control 4 squares; the same two pawns doubled may control far fewer. Doubled pawns also cede the adjacent files to the opponent. You can sometimes accept doubled pawns willingly if you win the bishop pair or gain open lines for your rooks in compensation — but you must use the compensation quickly."
          >
            <MiniBoard
              fen="8/8/8/8/8/3P4/3P4/8 w - - 0 1"
              styles={doubledPawns}
              caption="Doubled d-pawns (red) — the d2 pawn is permanently blocked. Neither can protect the other"
            />
            <MiniBoard
              fen="8/8/8/8/2P1P3/8/8/8 w - - 0 1"
              styles={healthyPair}
              caption="Healthy spread — c4 and e4 on separate files jointly control b5–f5"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 2 ── */}
      <section>
        <SectionLabel>Pawn Strategy</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Pawn Chains — Always Attack the Base"
            body="A pawn chain is a diagonal sequence of pawns, each protected by the one behind it. The chain is only as strong as its weakest link: the BASE — the pawn at the back that has no pawn support. The head of the chain is well protected; the base is the target. When you face a pawn chain, find the base and attack it with pawns or pieces. When you have a pawn chain, guard the base carefully and try to extend the chain further. Nimzowitsch called this the most important positional rule for understanding pawn play."
          >
            <MiniBoard
              fen="8/8/8/2pP4/2P5/8/8/8 w - - 0 1"
              styles={pawnChain}
              caption="White's chain: c4 (base, red) supports d5 (head, green). Black's c5 attacks the base — if c4 falls, d5 becomes isolated"
            />
          </TipCard>

          <TipCard
            title="The Lever — Cracking Open the Position"
            body="A lever is a pawn advance that directly attacks an enemy pawn, forcing an exchange or structural concession. Levers are the chess player's scalpel for creating open files and shifting the pawn landscape. The push b4-b5 against a fixed c6 pawn is a classic minority attack lever: after b5xc6 black either recaptures (opening the b-file for white's rooks) or leaves it (creating a passed c-pawn for white). Identifying the correct lever — and the right moment to play it — separates positional players from tactical ones."
          >
            <MiniBoard
              fen="8/1p6/2p5/8/1PP5/8/8/8 w - - 0 1"
              styles={leverStyles}
              caption="b4-b5 (gold) is the lever — it attacks black's fixed c6 pawn (red). After b5xc6 white wins open lines or a passed pawn"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 3 ── */}
      <section>
        <SectionLabel>Pawn Endgames</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="The Outside Passed Pawn — A Decoy Weapon"
            body="In king and pawn endgames, a passed pawn on the far flank is a powerful decoy even if it appears to be 'lost.' The enemy king must race across the board to stop it from promoting — and while it does, your king is free to harvest the undefended pawns on the other side. The further the passer is from the main cluster of pawns, the more effective the decoy. Creating an outside passed pawn by a well-timed pawn trade is often the key to winning a theoretically equal ending."
          >
            <MiniBoard
              fen="8/5ppp/8/P3k3/8/8/4K3/8 w - - 0 1"
              styles={outsidePasser}
              caption="The a5 passer (green) forces the black king to abandon the kingside — white's king then picks up f7/g7/h7 (red)"
            />
          </TipCard>

          <TipCard
            title="Key Squares — The King Must Lead"
            body="Every pawn has 'key squares' — specific squares where, if your king reaches one, promotion is guaranteed no matter where the enemy king stands. For a pawn on its 4th rank, the key squares are the three squares two ranks ahead of it. Get your king to a key square and the pawn promotes; keep the enemy king off those squares and it's a draw. In all pawn endgames, king activation toward the key squares is the top priority — rook pawns (a and h) are the exception, as their key squares are more limited."
          >
            <MiniBoard
              fen="8/8/8/8/3P4/8/8/4K3 w - - 0 1"
              styles={keySquaresStyles}
              caption="Key squares for d4 (blue) — once white's king reaches c6, d6, or e6, promotion is guaranteed regardless of where the black king is"
            />
          </TipCard>

        </div>
      </section>

    </div>
  );
}

// ── Queens lesson ─────────────────────────────────────────────────────────────

function QueensLesson({ onBack }: { onBack: () => void }) {

  const QUEEN_C = "rgba(201,168,76,0.70)";

  // Tip 1a — central queen on d4: controls 27 squares
  const queenCenter = {
    ...sq(["d4"], QUEEN_C),
    ...sq(["a4","b4","c4","e4","f4","g4","h4"], GOLD),          // rank
    ...sq(["d1","d2","d3","d5","d6","d7","d8"], GOLD),          // file
    ...sq(["e5","f6","g7","h8","c3","b2","a1"], GOLD),          // NE / SW diagonal
    ...sq(["c5","b6","a7","e3","f2","g1"], GOLD),               // NW / SE diagonal
  };

  // Tip 1b — corner queen on a1: only 21 squares, one diagonal gone
  const queenCorner = {
    ...sq(["a1"], QUEEN_C),
    ...sq(["b1","c1","d1","e1","f1","g1","h1"], GOLD),          // rank
    ...sq(["a2","a3","a4","a5","a6","a7","a8"], GOLD),          // file
    ...sq(["b2","c3","d4","e5","f6","g7","h8"], GOLD),          // one diagonal
  };

  // Tip 2a — early queen on h5, about to be kicked by ...g6
  const earlyQueen = {
    ...sq(["h5"], QUEEN_C),
    ...sq(["g6"], RED),
    ...sq(["h4","f3","e2","h3"], "rgba(224,90,90,0.18)"),
  };

  // Tip 2b — proper development: queen on d1, Bc4+Nf3+castled
  const properDev = {
    ...sq(["d1"], QUEEN_C),
    ...sq(["c4","f3","g1"], GREEN),
  };

  // Tip 3 — queen fork: Qe4 attacks Rb1 and Rh7 on the SAME diagonal
  const queenFork = {
    ...sq(["e4"], QUEEN_C),
    ...sq(["b1","h7"], RED),
    ...sq(["f5","g6"], "rgba(201,168,76,0.22)"),
    ...sq(["d3","c2"], "rgba(201,168,76,0.22)"),
  };

  // Tip 4 — skewer: Qa1+ forces king on c3 to move, rook on e5 is won
  const skewerStyles = {
    ...sq(["a1"], QUEEN_C),
    ...sq(["c3"], "rgba(224,90,90,0.55)"),
    ...sq(["e5"], "rgba(224,90,90,0.35)"),
    ...sq(["b2","d4"], "rgba(201,168,76,0.28)"),
  };

  // Tip 5 — pin: Qb2 pins Bd4 against Kf6 on the same dark diagonal
  const queenPin = {
    ...sq(["b2"], QUEEN_C),
    ...sq(["d4"], RED),
    ...sq(["f6"], "rgba(224,90,90,0.45)"),
    ...sq(["c3","e5"], "rgba(201,168,76,0.28)"),
  };

  // Tip 6 — queen + rook checkmate: Ra8 + Qg7# with Kh6 guarding the queen
  const matingNet = {
    ...sq(["g7"], QUEEN_C),
    ...sq(["a8"], "rgba(201,168,76,0.50)"),
    ...sq(["g8"], "rgba(224,90,90,0.55)"),
    ...sq(["f8","h8","f7","h7"], "rgba(224,90,90,0.20)"),
  };

  // Tip 7 — perpetual check: queen bounces h6↔g6 while king shuttles h8↔g8
  const perpetual = {
    ...sq(["f6"], QUEEN_C),
    ...sq(["h6","g6"], GOLD),
    ...sq(["h8"], "rgba(224,90,90,0.40)"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ghost" onClick={onBack}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>
          Queens
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>♛ tactics · mating patterns · perpetual</span>
      </div>

      {/* ── Section 1 ── */}
      <section>
        <SectionLabel>Understanding the Queen</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Central Power — 27 Squares vs 21"
            body="The queen combines the rook's ranks and files with the bishop's diagonals — the most mobile piece on the board. But its range depends critically on where it stands. A queen in the center of the board controls up to 27 squares simultaneously; in the corner it loses two whole diagonals and drops to 21. More importantly, a central queen can shift instantly to any part of the board. An edge queen is slow to redeploy and contributes far less. Activate the queen toward the center — but only when it's safe."
          >
            <MiniBoard
              fen="8/8/8/8/3Q4/8/8/8 w - - 0 1"
              styles={queenCenter}
              caption="Queen on d4 — 27 squares covered across 4 directions: rank, file, and both diagonals"
            />
            <MiniBoard
              fen="8/8/8/8/8/8/8/Q7 w - - 0 1"
              styles={queenCorner}
              caption="Queen on a1 — only 21 squares; one diagonal is completely missing"
            />
          </TipCard>

          <TipCard
            title="Don't Rush the Queen — Tempo Is Everything"
            body="Developing the queen early is one of the most common mistakes at every level. The queen is too valuable to risk in the opening — every time an enemy minor piece attacks it, you must move again, handing your opponent a free developing tempo. Opponents build a full army while your queen runs around. The rule: develop your knights and bishops first, castle your king to safety, THEN bring the queen to a square where it joins the action without being chased. The queen works best when it arrives into a position already prepared by the other pieces."
          >
            <MiniBoard
              fen="rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3"
              styles={earlyQueen}
              caption="Qh5 looks aggressive — but g6 (red) kicks it away. Black develops for free while white retreats"
            />
            <MiniBoard
              fen="r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 7"
              styles={properDev}
              caption="Queen on d1, Bc4 and Nf3 active, king castled (green) — a coordinated, developed position"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 2 ── */}
      <section>
        <SectionLabel>Queen Tactics</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="The Fork — Long-Range Double Attack"
            body="The queen's diagonal and linear reach lets it fork pieces from great distances no other piece can match. The key is noticing when two enemy pieces share the same rank, file, or diagonal — with a queen move that attacks both simultaneously. Queen forks involving the king (giving check) are especially powerful: the opponent must respond to the check first, guaranteeing the other piece is lost. Always scan for potential queen forks before making your move; they often appear suddenly in positions that look quiet."
          >
            <MiniBoard
              fen="8/7r/8/8/4Q3/8/8/1r2K3 w - - 0 1"
              styles={queenFork}
              caption="Qe4 attacks Rb1 and Rh7 along the same diagonal — both rooks (red) are hit simultaneously. One is lost"
            />
          </TipCard>

          <TipCard
            title="The Skewer — Step Aside and Lose What's Behind"
            body="A skewer is the reverse of a pin. Instead of hiding behind a more valuable piece, the more valuable piece is attacked directly — and must move, revealing the piece behind it. Queen skewers are especially lethal because the queen attacks along all lines. The classic pattern: queen checks the king along a diagonal, the king is forced to move, and the rook (or other piece) sitting behind the king is captured for free. Watch for king and rook alignment on any rank, file, or diagonal — it's an invitation for a skewer."
          >
            <MiniBoard
              fen="8/8/8/4r3/8/2k5/8/Q3K3 w - - 0 1"
              styles={skewerStyles}
              caption="Qa1+ skewers the king on c3 — it must step off the diagonal, and the rook on e5 (red) is won for free"
            />
          </TipCard>

          <TipCard
            title="The Pin — Nailing a Piece to the Line"
            body="A pin restricts an enemy piece that cannot move without exposing something more valuable behind it. Queen pins are especially powerful because the queen attacks on ranks, files, AND diagonals — far more pin opportunities than a rook or bishop alone. An absolute pin (the king is directly behind the pinned piece) means the piece literally cannot move legally. Once a piece is pinned, pile on with more attackers: pawns, rooks, or another queen. The opponent can only break the pin by moving the king, interposing another piece, or capturing the pinning queen."
          >
            <MiniBoard
              fen="8/8/5k2/8/3b4/8/1Q6/4K3 w - - 0 1"
              styles={queenPin}
              caption="Qb2 pins the bishop on d4 against the king on f6 — the bishop cannot move without exposing the king to check"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 3 ── */}
      <section>
        <SectionLabel>Mating Patterns and Drawing Resources</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Queen + Rook — The Cage Mate"
            body="The queen and rook together can force checkmate against a lone king in the corner with precision. The rook seals off an entire rank or file to confine the king to the back rank; the queen then marches up to deliver the final blow. In the classic position: the rook on a8 controls the entire 8th rank, and the queen on g7 covers every escape square — f8, h8, f7, and h7 are all covered by the queen alone. The critical detail: the white king on h6 must guard the queen so the black king cannot simply capture it."
          >
            <MiniBoard
              fen="R5k1/6Q1/7K/8/8/8/8/8 w - - 0 1"
              styles={matingNet}
              caption="Ra8 + Qg7# — checkmate. Every escape square is covered by the queen; white king on h6 protects her"
            />
          </TipCard>

          <TipCard
            title="Perpetual Check — Snatching a Draw"
            body="When you're losing — down material or facing a queening pawn — the queen's mobility sometimes provides a last resort: perpetual check. If you can force the enemy king to oscillate between two squares with endless checks, the game is drawn by repetition. The queen bounces between two checking squares while the king has no choice but to shuffle back and forth. Look for perpetual check when: you're losing a piece, your position is collapsing, or your opponent threatens promotion. The queen alone can sometimes save a game no other piece could."
          >
            <MiniBoard
              fen="7k/8/5Q2/8/8/8/8/6K1 w - - 0 1"
              styles={perpetual}
              caption="White plays Qh6+ Kg8, Qg6+ Kh8, Qh6+... forever. King shuttles h8↔g8; neither side can escape the repetition"
            />
          </TipCard>

        </div>
      </section>

    </div>
  );
}

// ── Kings lesson ─────────────────────────────────────────────────────────────

function KingsLesson({ onBack }: { onBack: () => void }) {

  const KING_C = "rgba(201,168,76,0.70)";

  // Tip 1a — exposed king on e1, not yet castled
  const exposedKing = {
    ...sq(["e1"], "rgba(224,90,90,0.65)"),
    ...sq(["d1","d2","e2","f1","f2"], "rgba(224,90,90,0.22)"),
  };

  // Tip 1b — castled king on g1, safe behind pawn shelter
  const castledKing = {
    ...sq(["g1"], GREEN),
    ...sq(["f2","g2","h2"], "rgba(82,183,136,0.28)"),
  };

  // Tip 2a — intact pawn shield (f7,g7,h7)
  const intactShield = {
    ...sq(["g8"], KING_C),
    ...sq(["f7","g7","h7"], GREEN),
  };

  // Tip 2b — broken pawn shield (h4 g4 pushed, only f2 left)
  const brokenShield = {
    ...sq(["g1"], "rgba(224,90,90,0.55)"),
    ...sq(["g4","h4"], "rgba(224,90,90,0.40)"),
    ...sq(["f2"], "rgba(224,90,90,0.22)"),
    ...sq(["g2","h2"], "rgba(224,90,90,0.12)"),  // the holes
  };

  // Tip 3a — centralized king on d4: controls 8 squares
  const centralKing = {
    ...sq(["d4"], GREEN),
    ...sq(["c3","d3","e3","c4","e4","c5","d5","e5"], "rgba(82,183,136,0.28)"),
  };

  // Tip 3b — corner king on a1: controls only 3 squares
  const cornerKing = {
    ...sq(["a1"], "rgba(224,90,90,0.55)"),
    ...sq(["a2","b1","b2"], "rgba(224,90,90,0.22)"),
  };

  // Tip 4 — direct opposition: Kd4 vs Kd6, d5 is the contested square
  const opposition = {
    ...sq(["d4"], GREEN),           // white king (has opposition)
    ...sq(["d6"], "rgba(224,90,90,0.55)"),  // black king (must yield)
    ...sq(["d5"], GOLD),            // contested square between them
  };

  // Tip 5a — king leading pawn: Kd6 ahead of Pd5, king paves the way
  const kingLeads = {
    ...sq(["d6"], GREEN),
    ...sq(["d5"], GOLD),
    ...sq(["d7","c7","e7"], "rgba(82,183,136,0.22)"),  // promotion path
  };

  // Tip 5b — pawn ahead of king: Pd5 stranded, Kd1 too far back
  const kingBehind = {
    ...sq(["d1"], "rgba(224,90,90,0.45)"),
    ...sq(["d5"], "rgba(224,90,90,0.25)"),
  };

  // Tip 6 — outflanking: Kd4 goes to Kc4 or Ke4 to go around Kd6
  // (Kc5 is adjacent to Kd6 so we can't show that as first move)
  const outflank = {
    ...sq(["d4"], KING_C),          // current king position
    ...sq(["d6"], "rgba(224,90,90,0.45)"),  // opposing king
    ...sq(["d5"], "rgba(201,168,76,0.18)"), // blocked direct route
    ...sq(["c4","e4"], GOLD),       // first sidestep: Kc4 or Ke4
  };

  // Tip 7 — active king eating pawns in endgame
  const kingAttacks = {
    ...sq(["b4"], GREEN),
    ...sq(["a6","b7"], "rgba(224,90,90,0.45)"),  // targets
    ...sq(["a5","b5","c5","a3","b3","c3","c4"], "rgba(82,183,136,0.18)"),  // king's reach
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="ghost" onClick={onBack}>← Learn</button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)" }}>
          Kings
        </h2>
        <span className="mono dim" style={{ fontSize: 12 }}>♚ safety · opposition · endgame</span>
      </div>

      {/* ── Section 1 ── */}
      <section>
        <SectionLabel>Keeping the King Safe</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Castle Early"
            body="Castling tucks the king behind a wall of pawns and connects your rooks. An uncastled king in the centre is a constant target — your opponent can open the e- or d-file and attack it directly. As a rule of thumb, castle before move 10."
          >
            <MiniBoard
              fen="r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 5"
              styles={exposedKing}
              caption="Ke1 exposed in the centre — any open file becomes dangerous"
            />
            <MiniBoard
              fen="r1bq1rk1/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 6 7"
              styles={castledKing}
              caption="Kg1 safely castled — the pawn shield on f2,g2,h2 absorbs attacks"
            />
          </TipCard>

          <TipCard
            title="Don't Advance Pawns in Front of the King"
            body="The pawns on f, g, and h are your king's bodyguards. Pushing them creates permanent holes — gaps that enemy pieces can occupy with no pawn to drive them away. Only advance them if you have a concrete tactical reason."
          >
            <MiniBoard
              fen="6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1"
              styles={intactShield}
              caption="f7,g7,h7 intact — both kings are equally safe"
            />
            <MiniBoard
              fen="6k1/5p1p/8/8/6PP/8/5P2/6K1 w - - 0 1"
              styles={brokenShield}
              caption="g+h pushed to 4th rank — g2 and h2 are holes, the king is exposed"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 2 ── */}
      <section>
        <SectionLabel>Activating the King in the Endgame</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="Centralize the King"
            body="When most pieces are traded off, the king transforms from liability to weapon. A centralised king controls 8 squares — more than any other piece. A king stuck in the corner controls only 3. March it to the centre as soon as queens come off the board."
          >
            <MiniBoard
              fen="8/8/8/8/3K4/8/8/8 w - - 0 1"
              styles={centralKing}
              caption="Kd4 — 8 squares controlled, king dominates the board"
            />
            <MiniBoard
              fen="8/8/8/8/8/8/8/K7 w - - 0 1"
              styles={cornerKing}
              caption="Ka1 — only 3 squares, king is passive and out of play"
            />
          </TipCard>

          <TipCard
            title="The Opposition"
            body="Two kings in 'opposition' stand on the same file or rank with exactly one square between them. The side that does NOT have to move holds the opposition — the other king must yield and let the opponent advance. Opposition is the key to king-and-pawn endgames."
          >
            <MiniBoard
              fen="8/8/3k4/8/3K4/8/8/8 b - - 0 1"
              styles={opposition}
              caption="White holds the opposition. Black (to move) must step aside — Kd5? is met by Kd5 winning the pawn"
            />
          </TipCard>

        </div>
      </section>

      {/* ── Section 3 ── */}
      <section>
        <SectionLabel>King and Pawn Technique</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <TipCard
            title="King in Front of the Pawn"
            body="In a king-and-pawn endgame, put your king in front of your pawn — not behind it. The king clears the path, seizes opposition, and shepherds the pawn to promotion. A pawn that outruns its king usually stalls and gets captured."
          >
            <MiniBoard
              fen="8/8/3K4/3P4/8/8/8/3k4 w - - 0 1"
              styles={kingLeads}
              caption="Kd6 leads Pd5 — White wins easily by shouldering out the black king"
            />
            <MiniBoard
              fen="3k4/8/8/3P4/8/8/8/3K4 w - - 0 1"
              styles={kingBehind}
              caption="Pawn on d5, Kd1 too far behind — Black blocks on d6 and holds the draw"
            />
          </TipCard>

          <TipCard
            title="Outflanking"
            body="When two kings face each other in opposition, you can break the deadlock by going sideways — outflanking. Step one square to the side (Kc4 or Ke4), forcing the enemy king to mirror you. Then you advance and regain opposition on a better square. Don't charge straight ahead; go around."
          >
            <MiniBoard
              fen="8/8/3k4/3P4/3K4/8/8/8 w - - 0 1"
              styles={outflank}
              caption="Kc4! or Ke4! — sidestep first. Direct Kd5 is met by Kd5 with opposition. Go around to force the black king back"
            />
          </TipCard>

          <TipCard
            title="King as Attacker — Eat Pawns"
            body="In pure pawn endings, your king is your strongest piece. Aggressively march it toward the opponent's pawns. Every pawn you capture is a step closer to queening. Don't be timid — an active king in the endgame often decides the game all by itself."
          >
            <MiniBoard
              fen="8/1p6/p7/8/1K6/8/8/8 w - - 0 1"
              styles={kingAttacks}
              caption="Kb4 attacks both a6 and b7. The king will gobble both pawns and queen — a classic endgame technique"
            />
          </TipCard>

        </div>
      </section>

    </div>
  );
}

// ── Opening components ────────────────────────────────────────────────────────

function OpeningCard({
  openingKey, onSelect,
}: { openingKey: OpeningKey; onSelect: (k: OpeningKey) => void }) {
  const o = OPENINGS[openingKey];
  return (
    <div
      onClick={() => onSelect(openingKey)}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px",
        cursor: "pointer", width: 190, userSelect: "none",
        transition: "border-color var(--transition), background var(--transition)",
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--gold)"; el.style.background = "var(--raised)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = ""; el.style.background = ""; }}
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

function OpeningsHub({
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

function OpeningDetail({
  openingKey, onBack,
}: { openingKey: OpeningKey; onBack: () => void }) {
  const opening = OPENINGS[openingKey];
  const [lineIdx, setLineIdx] = useState(0);
  const [ply, setPly] = useState(0);
  const boardTheme = useBoardTheme();

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
              boardStyle: { width: 420, height: 420, borderRadius: "var(--radius)" },
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
            marginTop: 10, maxHeight: 220, overflowY: "auto",
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
                    <tr key={n}>
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

// ── Learn menu ────────────────────────────────────────────────────────────────

function TopicCard({
  icon, title, description, onClick, soon = false,
}: { icon: string; title: string; description: string; onClick?: () => void; soon?: boolean }) {
  return (
    <div
      onClick={soon ? undefined : onClick}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "20px 20px",
        cursor: soon ? "default" : "pointer", opacity: soon ? 0.45 : 1,
        width: 185, transition: "border-color var(--transition), background var(--transition)",
        userSelect: "none",
      }}
      onMouseEnter={e => { if (!soon) { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--gold)"; el.style.background = "var(--raised)"; }}}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = ""; el.style.background = ""; }}
    >
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--text-bright)", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>{description}</div>
      {soon && (
        <div style={{ marginTop: 10, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.1em" }}>
          COMING SOON
        </div>
      )}
    </div>
  );
}

type Topic = "menu" | "knights" | "bishops" | "rooks" | "pawns" | "queens" | "kings" | "openings";

export default function Learn() {
  const [topic, setTopic]           = useState<Topic>("menu");
  const [openingKey, setOpeningKey] = useState<OpeningKey | null>(null);

  if (topic === "knights") return <KnightsLesson onBack={() => setTopic("menu")} />;
  if (topic === "bishops") return <BishopsLesson onBack={() => setTopic("menu")} />;
  if (topic === "rooks")   return <RooksLesson   onBack={() => setTopic("menu")} />;
  if (topic === "pawns")   return <PawnsLesson   onBack={() => setTopic("menu")} />;
  if (topic === "queens")  return <QueensLesson  onBack={() => setTopic("menu")} />;
  if (topic === "kings")   return <KingsLesson   onBack={() => setTopic("menu")} />;
  if (topic === "openings" && !openingKey)
    return <OpeningsHub onSelect={k => setOpeningKey(k)} onBack={() => setTopic("menu")} />;
  if (topic === "openings" && openingKey)
    return <OpeningDetail openingKey={openingKey} onBack={() => setOpeningKey(null)} />;

  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text-bright)", marginBottom: 8 }}>
        Learn
      </h2>
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 28 }}>
        Concepts and patterns illustrated on live boards. Click any topic to begin.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <TopicCard icon="♞" title="Knights" description="Movement, forks, outposts, and the 4-move diagonal escape rule." onClick={() => setTopic("knights")} />
        <TopicCard icon="♝" title="Bishops" description="Good vs bad bishops, the bishop pair, pins, fianchetto, and color weakness." onClick={() => setTopic("bishops")} />
        <TopicCard icon="♜" title="Rooks" description="Open files, the 7th rank, passed pawns, back rank, and endgame cutting." onClick={() => setTopic("rooks")} />
        <TopicCard icon="♟" title="Pawns" description="Connected vs isolated, passed pawns, pawn chains, levers, and key squares." onClick={() => setTopic("pawns")} />
        <TopicCard icon="♛" title="Queens" description="Central power, early development pitfalls, forks, skewers, pins, and perpetual check." onClick={() => setTopic("queens")} />
        <TopicCard icon="♚" title="Kings" description="Castling, pawn shelter, centralization, opposition, outflanking, and the active endgame king." onClick={() => setTopic("kings")} />
        <TopicCard icon="♟♙" title="Openings" description="9 opening families — Italian, Spanish, Sicilian, French, Caro-Kann, Queen's Gambit, and more." onClick={() => { setOpeningKey(null); setTopic("openings"); }} />
      </div>
    </div>
  );
}
