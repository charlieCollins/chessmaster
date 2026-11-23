# tests/test_mainline.py
# Pulling the main line that follows a diagram out of move blocks and prose.
import chess

from corpus_tools.mainline import mainline_after, strip_variations

FIG8 = chess.Board("8/6p1/3k4/8/3K1PP1/8/8/8 w - - 0 1")   # Capablanca Example 8


def test_strip_variations_keeps_promotions_and_origin_squares():
    t = "1 K - K 4, K - K 3. (If 1...P - Kt 3; 2 K - Q 4) 2 P - R 8 (Q) ch, Kt (Q 2) - B 3."
    assert strip_variations(t) == "1 K - K 4, K - K 3.  2 P - R 8 (Q) ch, Kt (Q 2) - B 3."


def test_mainline_from_prose_follows_numbering_and_skips_variations():
    blocks = [
        {"kind": "para", "text": "**Example 8.**—In the above position White can't win by 1 P - B 5. "
                                 "Black's best answer would be P - Kt 3 draws."},
        {"kind": "para", "text": "White can win, however, by playing: 1 K - K 4, K - K 3. "
                                 "(If 1...P - Kt 3; 2 K - Q 4, K - K 3; 3 K - B 5, K - B 3.)"},
        {"kind": "para", "text": "2 P - B 5 ch, K - B 3; 3 K - B 4, P - Kt 3. (If this Pawn is kept back.) "
                                 "4 P - Kt 5 ch, K - B 2. White cannot force it."},
    ]
    line = mainline_after(FIG8, blocks)
    assert line.sans == ["Ke4", "Ke6", "f5+", "Kf6", "Kf4", "g6", "g5+", "Kf7"]
    assert line.error is None


def test_try_moves_that_fail_are_not_the_main_line():
    # "1 P - B 5" above is a rejected try; the line still starts from 1 K - K 4
    blocks = [{"kind": "para", "text": "White can't win by 1 P - B 5. He wins by 1 K - K 4, K - K 3."}]
    assert mainline_after(FIG8, blocks).sans == ["Ke4", "Ke6"]


def test_move_blocks_and_black_to_move():
    b = chess.Board("4k3/8/8/8/8/8/4P3/4K3 b - - 0 1")
    blocks = [{"kind": "moves", "text": "1. ........ K - Q 2.\n2. P - K 4, K - K 3."}]
    line = mainline_after(b, blocks)
    assert line.sans == ["Kd7", "e4", "Ke6"]
    assert line.side == chess.BLACK


def test_side_to_move_detected_when_unknown():
    # Same position given as White to move: the "1. ......." says Black moves first
    b = chess.Board("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")
    blocks = [{"kind": "moves", "text": "1. ........ K - Q 2.\n2. P - K 4, K - K 3."}]
    line = mainline_after(b, blocks)
    assert line.side == chess.BLACK and line.sans == ["Kd7", "e4", "Ke6"]


def test_black_to_move_diagram_without_dots():
    b = chess.Board("4k3/8/8/8/8/8/4P3/4K3 b - - 0 1")
    blocks = [{"kind": "para", "text": "Black plays 1 K - Q 2, P - K 4; 2 K - K 3."}]
    assert mainline_after(b, blocks).sans == ["Kd7", "e4", "Ke6"]
