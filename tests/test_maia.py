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
