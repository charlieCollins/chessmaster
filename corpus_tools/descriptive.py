"""English descriptive chess notation -> python-chess moves.

Old books (Capablanca, Lasker, Staunton, Philidor) write moves from the mover's
side of the board: "P - K 4" is e4 for White and e5 for Black; files are named
after the pieces that start on them (Q R = a, Q Kt = b, Q B = c, Q = d, K = e,
K B = f, K Kt = g, K R = h). Unqualified names ("B 3") mean either side.

Instead of parsing into a square directly, every legal move is tested against
the description; exactly one must match. That handles all the shorthand the
books use ("P × P", "K P × P", "R × Kt ch", "Kt (Q 2) - B 3", "P - R 8 (Q)").
"""
from __future__ import annotations

import re

import chess


class DescriptiveError(ValueError):
    """The text doesn't describe exactly one legal move."""


PIECES = {"K": chess.KING, "Q": chess.QUEEN, "R": chess.ROOK, "Kt": chess.KNIGHT,
          "N": chess.KNIGHT, "B": chess.BISHOP, "P": chess.PAWN}
# Files named by piece: queen's side first, then king's side
FILE_PAIRS = {"R": (0, 7), "Kt": (1, 6), "N": (1, 6), "B": (2, 5)}
SIDE_FILES = {"Q": range(0, 4), "K": range(4, 8)}
FILE_TOKENS = {"R", "Kt", "N", "B", "Q", "K"}
# Trailing remarks that don't describe the move itself
NOISE = {"ch", "dis", "dbl", "double", "mate", "checkmate", "e.p.", "ep", "!", "?", "!!", "??",
         "!?", "?!", "draws", "wins", "and", "+", "#"}


def _files(tokens: list[str]) -> set[int] | None:
    """File set named by tokens like ["K", "Kt"], ["B"], ["Q"]. None = no constraint."""
    if not tokens:
        return None
    if len(tokens) == 1:
        t = tokens[0]
        if t in FILE_PAIRS:
            return set(FILE_PAIRS[t])
        if t == "Q":
            return {3}
        if t == "K":
            return {4}
    if len(tokens) == 2 and tokens[0] in ("Q", "K") and tokens[1] in FILE_PAIRS:
        return {FILE_PAIRS[tokens[1]][0 if tokens[0] == "Q" else 1]}
    raise DescriptiveError(f"can't read file {' '.join(tokens)!r}")


def _square_matches(tokens: list[str], square: int, color: chess.Color) -> bool:
    """Does a square description like ["K", "Kt", "4"] / ["Q", "sq"] name `square` for `color`?"""
    rank_tok = tokens[-1]
    if rank_tok != "sq" and not (rank_tok.isdigit() and 1 <= int(rank_tok) <= 8):
        raise DescriptiveError(f"can't read square {' '.join(tokens)!r}")
    rank = 1 if rank_tok == "sq" else int(rank_tok)
    real_rank = rank if color == chess.WHITE else 9 - rank
    files = _files(tokens[:-1])
    return chess.square_rank(square) == real_rank - 1 and (files is None or chess.square_file(square) in files)


def _piece_matches(tokens: list[str], piece_type: int, square: int) -> bool:
    """Does a piece description like ["K", "B", "P"] / ["Q", "R"] / ["Kt"] fit this piece on this square?"""
    if PIECES[tokens[-1]] != piece_type:
        return False
    quals = tokens[:-1]
    if not quals:
        return True
    f = chess.square_file(square)
    if piece_type == chess.PAWN:          # "K B P" = f-pawn, "R P" = a- or h-pawn
        return f in _files(quals)
    return True   # "K R" / "Q Kt": resolved against the board in _side_pieces


def _side_pieces(board: chess.Board, mover: list[str], color: chess.Color) -> set[int] | None:
    """For "K R" / "Q Kt" style names: the piece(s) of that type furthest toward
    that side. (The books mean the piece that started there; without the game's
    history, the one nearest that side is the natural reading.)"""
    ptype = PIECES[mover[-1]]
    quals = mover[:-1]
    if ptype == chess.PAWN or len(quals) != 1 or quals[0] not in SIDE_FILES:
        return None
    squares = list(board.pieces(ptype, color))
    if len(squares) < 2:
        return None
    files = [chess.square_file(sq) for sq in squares]
    edge = max(files) if quals[0] == "K" else min(files)
    return {sq for sq, f in zip(squares, files) if f == edge}


def _is_square(tokens: list[str]) -> bool:
    return bool(tokens) and (tokens[-1].isdigit() or tokens[-1] == "sq")


def _tokenize(text: str) -> list[str]:
    t = text.replace("×", " x ").replace("—", "-").replace("–", "-")
    t = re.sub(r"(?<=\s)[xX](?=\s)|^[xX](?=\s)", " x ", t)
    t = re.sub(r"([()=\-])", r" \1 ", t)
    # Compact spellings: "KKt3" -> "K Kt 3", "K2" -> "K 2", "QRP" -> "Q R P"
    t = re.sub(r"(Kt|[KQRBNP])(?=(Kt|[KQRBNP]|\d|sq\b))", r"\1 ", t)
    return [w for w in t.replace(",", " ").split() if w]


def _parse_castle(board: chess.Board, words: list[str]) -> chess.Move | None:
    joined = "".join(words).upper()
    if joined.startswith("O-O") or joined.startswith("0-0"):
        long = joined.startswith("O-O-O") or joined.startswith("0-0-0")
    elif words and words[0].lower().startswith("castle"):
        long = "Q" in words[1:] or "QR" in joined[7:]
    else:
        return None
    for m in board.legal_moves:
        if board.is_castling(m) and board.is_queenside_castling(m) == long:
            return m
    raise DescriptiveError(f"castling not legal: {' '.join(words)}")


CHECK_WORDS = {"ch", "check", "mate", "checkmate", "+", "#"}
RESULT_WORDS = re.compile(r"^(resigns?|resigned|drawn?|draws|wins|abandoned)\W*$", re.I)


def candidates(board: chess.Board, text: str) -> list[chess.Move]:
    """All legal moves the text could mean. When several fit, the check marks
    decide: the books always write "ch"/"mate", so a move without one is quiet."""
    words = _tokenize(text)
    gives_check = any(w.lower() in CHECK_WORDS for w in words)
    words = [w for w in words if w.lower() not in NOISE and w not in NOISE]
    if not words:
        raise DescriptiveError(f"empty move {text!r}")

    castle = _parse_castle(board, words)
    if castle is not None:
        return [castle]

    found = _match(board, words, text)
    if len(found) > 1:
        consistent = [m for m in found if board.gives_check(m) == gives_check]
        if consistent:
            found = consistent
    return found


def parse_move(board: chess.Board, text: str) -> chess.Move:
    """The single legal move `text` describes; DescriptiveError if none or several."""
    found = candidates(board, text)
    if len(found) != 1:
        what = "no legal move" if not found else f"ambiguous ({', '.join(board.san(m) for m in found)})"
        raise DescriptiveError(f"{text!r}: {what} in {board.fen()}")
    return found[0]


def _match(board: chess.Board, words: list[str], text: str) -> list[chess.Move]:
    # Promotion: "(Q)" or "= Q" at the end
    promo = None
    if len(words) >= 3 and words[-3] == "(" and words[-1] == ")" and words[-2] in PIECES and words[-2] not in ("K", "P"):
        promo = PIECES[words[-2]]; words = words[:-3]
    elif len(words) >= 2 and words[-2] == "=" and words[-1] in PIECES:
        promo = PIECES[words[-1]]; words = words[:-2]

    # Split mover | op | target, pulling out "(square)" groups
    groups: list[list[str]] = []
    cur: list[str] = []
    paren: list[str] | None = None
    origin = target_sq = None
    op = None
    for w in words:
        if w == "(":
            paren = []
        elif w == ")":
            if op is None:
                origin = paren
            else:
                target_sq = paren
            paren = None
        elif paren is not None:
            paren.append(w)
        elif w in ("-", "x", "X") and op is None:
            op = "x" if w in ("x", "X") else "-"
            groups.append(cur); cur = []
        else:
            cur.append(w)
    groups.append(cur)
    if op is None and len(groups) == 1:          # misprint without the dash: "P K 4"
        for k in range(1, len(cur)):
            if cur[k - 1] in PIECES and all(t in FILE_TOKENS for t in cur[:k - 1]) and _is_square(cur[k:]):
                groups, op = [cur[:k], cur[k:]], "-"
                break
    if op is None or len(groups) != 2 or not groups[0] or not groups[1]:
        raise DescriptiveError(f"can't read move {text!r}")
    mover, target = groups
    if mover[-1] not in PIECES or any(t not in FILE_TOKENS for t in mover[:-1]):
        raise DescriptiveError(f"can't read piece {' '.join(mover)!r}")

    color = board.turn
    allowed_from = _side_pieces(board, mover, color)
    matches = []
    for m in board.legal_moves:
        if board.is_castling(m):
            continue
        piece = board.piece_at(m.from_square)
        if not _piece_matches(mover, piece.piece_type, m.from_square):
            continue
        if allowed_from is not None and m.from_square not in allowed_from:
            continue
        if origin and not _square_matches(origin, m.from_square, color):
            continue
        if op == "-":
            if board.is_capture(m) or not _square_matches(target, m.to_square, color):
                continue
        else:
            if not board.is_capture(m):
                continue
            if _is_square(target):
                if not _square_matches(target, m.to_square, color):
                    continue
            else:
                cap_sq = m.to_square
                if board.is_en_passant(m):
                    cap_sq = m.to_square + (-8 if color == chess.WHITE else 8)
                captured = board.piece_at(cap_sq)
                if target[-1] not in PIECES or not _piece_matches(target, captured.piece_type, cap_sq):
                    continue
            if target_sq and not _square_matches(target_sq, m.to_square, color):
                continue
        if m.promotion and m.promotion != (promo or chess.QUEEN):
            continue
        matches.append(m)
    return matches


_MOVE_NO = re.compile(r"^(\d+)(\.+)(.*)$")


def split_moves(text: str) -> list[str]:
    """Split "1. P - K 4, P - K 4; 2. Kt - K B 3." into individual move texts.

    A number followed by '.' is a move number unless it comes right after a file
    name (then it's a rank: "Kt 4."). "........" / "..." stand for a skipped move.
    """
    t = text.replace("×", " × ").replace(",", " , ").replace(";", " ; ")
    moves, cur, prev = [], [], None

    def flush():
        if cur:
            moves.append(" ".join(cur))
            cur.clear()

    for w in t.split():
        after_file = prev is not None and prev.rstrip(".") in FILE_TOKENS
        if w.isdigit() and not after_file:          # "4 ........ P × P": number without its period
            flush(); prev = w; continue
        mn = _MOVE_NO.match(w)
        if mn and not after_file:
            flush()
            rest = mn.group(3).lstrip(".")
            prev = w
            if rest:
                cur.append(rest); prev = rest
            continue
        if RESULT_WORDS.match(w):
            flush(); prev = w; continue
        if w in (",", ";") or re.fullmatch(r"\.{2,}|…+", w):
            flush(); prev = w; continue
        if w.endswith(".") and not w.endswith("e.p."):
            core = w.rstrip(".")
            if core:
                cur.append(core)
            flush(); prev = core or w; continue
        cur.append(w); prev = w
    flush()
    return moves


def resolve_line(board: chess.Board, move_texts: list[str]) -> tuple[list[chess.Move], str | None]:
    """Read a sequence of move texts from `board`, using later moves to settle
    ambiguous earlier ones (backtracking). Returns (moves read, error or None);
    on error the moves are the longest readable prefix."""
    best: list[chess.Move] = []
    best_err: str | None = None

    def solve(b: chess.Board, i: int, acc: list[chess.Move]) -> bool:
        nonlocal best, best_err
        if i == len(move_texts):
            best, best_err = list(acc), None
            return True
        try:
            cands = candidates(b, move_texts[i])
            if not cands:
                raise DescriptiveError(f"{move_texts[i]!r}: no legal move in {b.fen()}")
        except DescriptiveError as e:
            if len(acc) >= len(best):
                best, best_err = list(acc), str(e)
            return False
        for m in cands:
            b.push(m); acc.append(m)
            if solve(b, i + 1, acc):
                return True
            b.pop(); acc.pop()
        if len(cands) > 1 and len(acc) >= len(best):
            best = list(acc)
            best_err = f"{move_texts[i]!r}: ambiguous ({', '.join(b.san(m) for m in cands)}) in {b.fen()}"
        return False

    solve(board.copy(), 0, [])
    return best, best_err


def parse_line(board: chess.Board, text: str) -> list[str]:
    """Play a run of descriptive moves from `board` (not modified); return SAN list."""
    moves, err = resolve_line(board, split_moves(text))
    if err:
        raise DescriptiveError(err)
    b = board.copy()
    out = []
    for m in moves:
        out.append(b.san(m))
        b.push(m)
    return out
