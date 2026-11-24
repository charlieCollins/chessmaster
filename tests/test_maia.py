# tests/test_maia.py
import random

import chess
import pytest

from backend.engine import MaiaEngine, choose_from_policy, maia_available, parse_policy

needs_maia = pytest.mark.skipif(not maia_available(), reason="lc0/Maia weights not installed")


def test_parse_policy_reads_probabilities():
    lines = ["e7e5  (322 ) N: 0 (+ 0) (P: 41.14%) (WL: -.-----)",
             "c7c5  (264 ) N: 0 (+ 0) (P: 15.02%) (WL: -.-----)",
             "node  ( 20 ) N: 1 (+ 0) (P: 100.00%)"]   # summary line — "node" isn't a move
    assert parse_policy(lines) == {"e7e5": pytest.approx(0.4114), "c7c5": pytest.approx(0.1502)}


def test_parse_policy_handles_promotion():
    assert parse_policy(["a7a8q (1 ) N: 0 (+ 0) (P: 80.00%)"]) == {"a7a8q": pytest.approx(0.8)}


def test_choose_only_samples_moves_above_floor():
    board = chess.Board(); board.push_uci("e2e4")
    policy = {"e7e5": 0.41, "c7c5": 0.15, "g7g6": 0.03}
    picks = {choose_from_policy(board, policy, random.Random(s)) for s in range(200)}
    assert picks == {"e7e5", "c7c5"}


def test_choose_ignores_illegal_moves():
    board = chess.Board()
    assert choose_from_policy(board, {"e2e5": 0.9, "d2d4": 0.06}, random.Random(0)) == "d2d4"


def test_choose_falls_back_to_top_legal_move():
    board = chess.Board()
    assert choose_from_policy(board, {"e2e4": 0.04, "d2d4": 0.03}, random.Random(0)) == "e2e4"


@needs_maia
def test_maia_plays_legal_moves_and_varies():
    eng = MaiaEngine(level=1300, rng=random.Random(1))
    try:
        after_e4 = chess.Board(); after_e4.push_uci("e2e4")
        moves = {eng.get_best_move(after_e4.fen()) for _ in range(30)}
        assert all(chess.Move.from_uci(m) in after_e4.legal_moves for m in moves)
        assert len(moves) >= 2
    finally:
        eng.close()


@needs_maia
def test_maia_rejects_unknown_level():
    eng = MaiaEngine()
    try:
        with pytest.raises(ValueError):
            eng.set_level(1000)
    finally:
        eng.close()


@needs_maia
def test_maia_set_level_switches_network_even_for_cached_positions():
    after_e4 = chess.Board(); after_e4.push_uci("e2e4")
    fresh = MaiaEngine(level=1900)
    switched = MaiaEngine(level=1100)
    try:
        expected = fresh.policy(after_e4.fen())
        switched.policy(after_e4.fen())      # populate lc0's cache with the 1100 net
        switched.set_level(1900)
        assert switched.policy(after_e4.fen()) == pytest.approx(expected)
    finally:
        fresh.close(); switched.close()


def test_choose_accepts_lc0_king_takes_rook_castling():
    # lc0 reports castling as king-takes-rook (e1h1); standard UCI is e1g1
    board = chess.Board("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4")
    assert choose_from_policy(board, {"e1h1": 0.9}, random.Random(0)) == "e1g1"


@needs_maia
def test_maia_castles_when_its_policy_says_so():
    # 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 — Maia gives O-O ~20%
    board = chess.Board("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4")
    eng = MaiaEngine(level=1500, rng=random.Random(7))
    try:
        picks = [eng.get_best_move(board.fen()) for _ in range(100)]
        assert "e1g1" in picks
    finally:
        eng.close()


@needs_maia
def test_maia_policy_is_untempered():
    # lc0 flattens the policy by default (PolicyTemperature 1.359); Maia's
    # human-move probabilities are the raw (temperature 1.0) policy.
    import chess.engine
    from backend.engine import LC0_PATH, MAIA_WEIGHTS_DIR
    board = chess.Board(); board.push_uci("e2e4")
    raw = chess.engine.SimpleEngine.popen_uci(
        [LC0_PATH, f"--weights={MAIA_WEIGHTS_DIR / 'maia-1300.pb.gz'}", "--threads=1", "--policy-softmax-temp=1.0"])
    eng = MaiaEngine(level=1300)
    try:
        raw.configure({"VerboseMoveStats": True})
        with raw.analysis(board, chess.engine.Limit(nodes=1)) as a:
            expected = parse_policy([i["string"] for i in a if "string" in i])
        # board (not FEN) so Maia gets the move history its network expects
        assert eng.policy(board) == pytest.approx(expected, abs=1e-4)
    finally:
        raw.quit(); eng.close()


@needs_maia
def test_maia_policy_uses_move_history():
    # Maia's net reads recent moves; a bare FEN distorts it badly
    # (measured: e7e5 57% with history vs 22% from FEN alone after 1.e4)
    board = chess.Board(); board.push_uci("e2e4")
    eng = MaiaEngine(level=1300)
    try:
        assert eng.policy(board)["e7e5"] > 0.5
    finally:
        eng.close()


def test_maia_unavailable_when_lc0_cannot_run(monkeypatch, tmp_path):
    """A binary that exists but can't run here (e.g. built for another CPU) must hide Maia."""
    import backend.engine as engine
    for lv in engine.MAIA_LEVELS:
        (tmp_path / f"maia-{lv}.pb.gz").write_bytes(b"x")
    monkeypatch.setattr(engine, "MAIA_WEIGHTS_DIR", tmp_path)
    monkeypatch.setattr(engine, "LC0_PATH", "/bin/false")       # exists, exits non-zero
    engine._lc0_runs.cache_clear()
    assert engine.maia_available() is False
    monkeypatch.setattr(engine, "LC0_PATH", "/bin/true")
    engine._lc0_runs.cache_clear()
    assert engine.maia_available() is True
    engine._lc0_runs.cache_clear()


@needs_maia
def test_maia_lc0_stays_small_in_memory():
    """Maia evaluates one position per move, so lc0's network cache is wasted memory —
    on the 1 GB server it pushed the app over its memory cap (OOM kill)."""
    import chess
    eng = MaiaEngine(1300)
    try:
        board = chess.Board()
        board.push_san("e4")
        eng.get_best_move(board)
        pid = eng._engine.transport.get_pid()
        rss_kb = next(int(l.split()[1]) for l in open(f"/proc/{pid}/status") if l.startswith("VmRSS:"))
        assert rss_kb < 40 * 1024, f"lc0 uses {rss_kb // 1024} MB"
    finally:
        eng.close()
