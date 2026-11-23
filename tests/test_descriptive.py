# tests/test_descriptive.py
# English descriptive notation ("P - K Kt 4") -> python-chess moves, used to
# verify transcribed book diagrams and to modernise the book text.
import chess
import pytest

from corpus_tools.descriptive import parse_move, parse_line, DescriptiveError


def san(fen_or_board, text):
    board = fen_or_board if isinstance(fen_or_board, chess.Board) else chess.Board(fen_or_board)
    return board.san(parse_move(board, text))


def test_pawn_push_with_qualified_file():
    # Capablanca Example 10: White to play 1. P - K Kt 4
    assert san("8/p6p/4k3/8/4K3/8/P5PP/8 w - - 0 1", "P - K Kt 4") == "g4"


def test_files_count_from_the_movers_side():
    b = chess.Board()
    assert san(b, "P - K 4") == "e4"
    b.push_san("e4")
    assert san(b, "P - K 4") == "e5"          # Black's K4 is e5
    b.push_san("e5")
    assert san(b, "Kt - K B 3") == "Nf3"
    b.push_san("Nf3")
    assert san(b, "Kt - Q B 3") == "Nc6"


def test_unqualified_file_resolved_by_legality():
    # Only one bishop can reach a "B 4": unqualified is fine
    b = chess.Board("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1")
    assert san(b, "B - B 4") == "Bf4"
    # After 1.e4 e5 both Nc3 and Nf3 are "Kt - B 3": ambiguous
    b = chess.Board()
    b.push_san("e4"); b.push_san("e5")
    with pytest.raises(DescriptiveError):
        parse_move(b, "Kt - B 3")


def test_sq_means_first_rank_and_annotations_ignored():
    b = chess.Board("4k3/8/8/8/8/8/8/R3K3 w Q - 0 1")
    assert san(b, "R - Q sq !") == "Rd1"
    assert san(b, "K - Q 2 ch") == "Kd2"


def test_captures_by_piece_type():
    b = chess.Board("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1")
    assert san(b, "P × P") == "exd5"
    assert san(b, "P x P") == "exd5"


def test_capture_with_qualifiers():
    # Two pawns can take on d5; "K P × P" picks the e-pawn
    b = chess.Board("4k3/8/8/3p4/2P1P3/8/8/4K3 w - - 0 1")
    assert san(b, "K P × P") == "exd5"
    assert san(b, "B P × P") == "cxd5"
    with pytest.raises(DescriptiveError):
        parse_move(b, "P × P")


def test_capture_of_qualified_target():
    b = chess.Board("4k3/8/8/3p1p2/4P3/8/8/4K3 w - - 0 1")
    assert san(b, "P × K B P") == "exf5"
    assert san(b, "P × Q P") == "exd5"


def test_castling_and_promotion():
    b = chess.Board("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
    assert san(b, "Castles") == "O-O"
    assert san(b, "Castles Q R") == "O-O-O"
    assert san(b, "O - O - O") == "O-O-O"
    b = chess.Board("8/P7/8/8/8/8/7k/4K3 w - - 0 1")
    assert san(b, "P - R 8 (Q)") == "a8=Q"
    assert san(b, "P - R 8 = Kt") == "a8=N"


def test_origin_square_in_parentheses_disambiguates():
    b = chess.Board("4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1")
    with pytest.raises(DescriptiveError):
        parse_move(b, "Kt - K 4")
    assert san(b, "Kt (Kt 3) - K 4") == "Nge4"
    # Compact spellings in the books: "(Kt3)", "-K4", "KKt4"
    assert san(b, "Kt(Kt3)-K4") == "Nge4"
    assert san(b, "Kt (KKt3) - K 4") == "Nge4"


def test_unreadable_square_is_a_descriptive_error():
    with pytest.raises(DescriptiveError):
        parse_move(chess.Board(), "P - K X")


def test_illegal_move_raises():
    with pytest.raises(DescriptiveError):
        parse_move(chess.Board(), "P - K 5")


def test_parse_line_numbered_pairs_and_black_first():
    b = chess.Board("8/p6p/4k3/8/4K3/8/P5PP/8 w - - 0 1")
    moves = parse_line(b, "1. P - K Kt 4. 1. ........ P - Q R 4. 2. P - Q R 4, K - B 3; 3. P - R 4, K - K 3.")
    assert [m for m in moves] == ["g4", "a5", "a4", "Kf6", "h4", "Ke6"]
    # The board passed in is not modified
    assert b.fen() == "8/p6p/4k3/8/4K3/8/P5PP/8 w - - 0 1"


def test_parse_line_black_to_move_ellipsis():
    b = chess.Board("4k3/8/8/8/8/8/4P3/4K3 b - - 0 1")
    assert parse_line(b, "1. ... K - Q 2; 2. P - K 4, K - K 3.") == ["Kd7", "e4", "Ke6"]


def test_check_annotation_disambiguates():
    # Capablanca, Game 2: "R - B 5 ch" is Rf5+, not Rc5
    fen = "5k2/pp4pp/2n1B3/3R4/8/3P2P1/Pr3PKP/8 w - - 3 28"
    assert san(fen, "R - B 5 ch") == "Rf5+"
    assert san(fen, "R - B 5") == "Rc5"         # no "ch" -> the quiet move


def test_parse_line_uses_later_moves_to_resolve_ambiguity():
    # "Kt - K 4" could be Nce4 or Nge4; only after Nce4 can a knight reach "R 5" (Ng3-h5)
    b = chess.Board("4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1")
    assert parse_line(b, "1. Kt - K 4, K - Q 1; 2. Kt - R 5") == ["Nce4", "Kd8", "Nh5"]


def test_result_words_are_not_moves():
    b = chess.Board("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")
    assert parse_line(b, "1. P - K 4, Resigns.") == ["e4"]


def test_side_qualified_piece_is_the_one_furthest_toward_that_side():
    # Capablanca Game 7: rooks a8 and d8; "K R" is the d8 rook (the one nearer the king's side)
    b = chess.Board("r2r1k2/8/8/8/8/8/8/4K3 b - - 0 1")
    assert san(b, "K R - Kt 1") == "Rdb8"
    assert san(b, "Q R - Kt 1") == "Rab8"


def test_missing_dash_is_tolerated():
    assert san(chess.Board(), "P K 4 !") == "e4"


def test_move_number_without_period():
    from corpus_tools.descriptive import split_moves
    assert split_moves("4 ........ P × P") == ["P × P"]
    assert split_moves("3...P - Kt 3; 4 P - B 6") == ["P - Kt 3", "P - B 6"]
