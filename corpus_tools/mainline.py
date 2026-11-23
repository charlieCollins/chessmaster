"""The main line that follows a book diagram.

Capablanca (and most old books) print the main line either in its own centred
lines / tables ("moves" blocks) or inside the prose ("White wins by 1 K - K 4,
K - K 3. (If 1...P - Kt 3; 2 K - Q 4 ...) 2 P - B 5 ch ..."). Rules:

* If the diagram's section has move blocks, they are the main line.
* Otherwise numbered move runs in the prose are used. Parenthesised variations
  are dropped, as are runs introduced by "If"/"Should"/"or". A run that restarts
  at an earlier move number replaces what came before (books state failed tries
  first: "White can't win by 1 P - B 5 ... but by 1 K - K 4").
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import chess

from .descriptive import resolve_line, split_moves


@dataclass
class Line:
    side: chess.Color
    moves: list[chess.Move] = field(default_factory=list)
    sans: list[str] = field(default_factory=list)
    source: str | None = None          # "moves" | "prose" | None
    error: str | None = None


_KEEP_PAREN = re.compile(r"^\s*(Q|R|B|Kt|N|[KQ]?\s*(R|Kt|B|Q|K)?\s*(\d|sq))\s*$")


def strip_variations(text: str) -> str:
    """Remove parenthesised variations; keep "(Q)" promotions and "(Q 2)" origin squares."""
    out, depth, buf = [], 0, []
    for ch in text:
        if ch == "(":
            if depth:
                buf.append(ch)
            depth += 1
            if depth == 1:
                buf = []
        elif ch == ")" and depth:
            depth -= 1
            if depth == 0:
                inner = "".join(buf)
                if _KEEP_PAREN.match(inner):
                    out.append(f"({inner})")
            else:
                buf.append(ch)
        elif depth:
            buf.append(ch)
        else:
            out.append(ch)
    return "".join(out)


_NUM = re.compile(r"(?<![\w.])(\d+)\s*(\.\s*\.{2,}|\.{3}|\.)?")
_MOVE_TOKEN = re.compile(r"^(K|Q|R|B|Kt|N|P|[-×x=]|ch|dis|mate|sq|e\.p\.|Castles|O|\(|\)|\d+|[KQRBNP]{1,3}\d?|Kt\d)$")
_VARIATION_CUE = re.compile(r"\b(if|should|or|instead|after|otherwise|threatening|threatens)\W*$", re.I)


def _runs(text: str) -> list[tuple[int, bool, str]]:
    """Numbered move runs in prose: (move number, black first?, run text)."""
    runs = []
    for m in _NUM.finditer(text):
        rest = text[m.end():]
        if not re.match(r"\s*(K|Q|R|B|Kt|N|P|Castles|O\s*-)\b", rest) and "..." not in (m.group(2) or "") \
                and not re.match(r"\s*\.{2,}", rest):
            continue
        if _VARIATION_CUE.search(text[max(0, m.start() - 25):m.start()]):
            continue
        black = bool(m.group(2) and ".." in m.group(2).replace(" ", ""))
        words, run = rest.split(), []
        for w in words:
            core = w.strip(".,;:!?")
            if core and not _MOVE_TOKEN.match(core):
                break
            run.append(w)
            if w.endswith(":"):
                break
        if run:
            runs.append((int(m.group(1)), black, f"{m.group(0)} {' '.join(run)}"))
    return runs


def _ply(number: int, black: bool) -> int:
    return 2 * (number - 1) + (1 if black else 0)


def _move_block_runs(text: str) -> list[tuple[int, bool, str]]:
    runs = []
    for line in text.split("\n"):
        m = re.match(r"\s*(\d+)\s*\.?\s*(\.{2,})?", line)
        if not m:
            continue
        runs.append((int(m.group(1)), bool(m.group(2)), line))
    return runs


def mainline_after(board: chess.Board, blocks: list[dict]) -> Line:
    """Main line for the diagram `board` from the blocks that follow it (up to the next diagram)."""
    move_blocks = [b for b in blocks if b["kind"] == "moves"]
    if move_blocks:
        runs = [r for b in move_blocks for r in _move_block_runs(b["text"])]
        source = "moves"
    else:
        runs = [r for b in blocks if b["kind"] == "para" for r in _runs(strip_variations(b["text"]))]
        source = "prose"
    if not runs:
        return Line(side=board.turn)

    side = chess.BLACK if runs[0][1] else board.turn
    start = board.copy()
    start.turn = side
    # The first run is the side to move's move even without "..." (a Black-to-move diagram)
    first = runs[0]
    base = _ply(first[0], side == chess.BLACK)
    line = Line(side=side, source=source)
    for k, (number, black, text) in enumerate(runs):
        idx = _ply(number, black or (k == 0 and side == chess.BLACK)) - base
        if idx < 0 or idx > len(line.moves):
            continue           # a gap or a reference to an earlier move: not the continuation
        b = start.copy()
        for mv in line.moves[:idx]:
            b.push(mv)
        moves, err = resolve_line(b, split_moves(text))
        if err and not moves:
            if idx == len(line.moves) and line.error is None:
                line.error = err
            continue
        line.moves = line.moves[:idx] + moves
        line.error = err
    b = start.copy()
    line.sans = []
    for mv in line.moves:
        line.sans.append(b.san(mv))
        b.push(mv)
    return line
