# tests/test_learn_progress.py
import os
os.environ.setdefault("DATABASE_URL", "sqlite://")

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, inspect

from backend.db import init_db
from backend.learn_progress import (START_RATING, REVIEW_DAYS, expected_score, update_rating,
                                    next_review, topic_progress, topic_status,
                                    PASS_MIN_PUZZLES, PASS_ACCURACY)

T = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)


def test_constants():
    assert START_RATING == 1300.0 and REVIEW_DAYS == (1, 3, 7, 21)


def test_expected_score_equal_ratings_is_half():
    assert expected_score(1300, 1300) == pytest.approx(0.5)
    assert expected_score(1300, 1700) == pytest.approx(1 / 11)


def test_update_uses_k40_then_k20():
    assert update_rating(1300, 1300, True, 0) == pytest.approx(1320)
    assert update_rating(1300, 1300, False, 0) == pytest.approx(1280)
    assert update_rating(1300, 1300, True, 29) == pytest.approx(1320)
    assert update_rating(1300, 1300, True, 30) == pytest.approx(1310)


def test_miss_enters_queue_at_step0():
    assert next_review(None, False, T) == (0, T + timedelta(days=1))


def test_solve_not_in_queue_stays_out():
    assert next_review(None, True, T) is None


def test_steps_advance_then_graduate():
    assert next_review(0, True, T) == (1, T + timedelta(days=3))
    assert next_review(1, True, T) == (2, T + timedelta(days=7))
    assert next_review(2, True, T) == (3, T + timedelta(days=21))
    assert next_review(3, True, T) is None


def test_review_miss_resets():
    assert next_review(2, False, T) == (0, T + timedelta(days=1))


def test_progress_needs_five():
    assert topic_progress([True] * 4) == {"attempts": 4, "solved": 4, "accuracy": None}


def test_progress_last_20():
    p = topic_progress([False] * 5 + [True] * 20)
    assert p == {"attempts": 20, "solved": 20, "accuracy": 1.0}


def test_tables_created():
    eng = create_engine("sqlite://")
    init_db(eng)
    names = set(inspect(eng).get_table_names())
    assert {"learn_attempts", "learn_reviews", "learn_user_state"} <= names


def _puz(attempts, solved):
    return {"attempts": attempts, "solved": solved, "accuracy": solved / attempts if attempts >= 5 else None}


def test_status_new_then_studied():
    assert topic_status(studied=False, has_puzzles=True, puzzles=_puz(0, 0), drills_total=2, drills_tried=0, drills_solved=0) == "new"
    assert topic_status(studied=True, has_puzzles=True, puzzles=_puz(0, 0), drills_total=2, drills_tried=0, drills_solved=0) == "studied"


def test_status_practising_until_enough_good_puzzles():
    assert (PASS_MIN_PUZZLES, PASS_ACCURACY) == (10, 0.7)
    assert topic_status(studied=False, has_puzzles=True, puzzles=_puz(3, 3), drills_total=0, drills_tried=0, drills_solved=0) == "practising"
    assert topic_status(studied=True, has_puzzles=True, puzzles=_puz(10, 6), drills_total=0, drills_tried=0, drills_solved=0) == "practising"
    assert topic_status(studied=True, has_puzzles=True, puzzles=_puz(10, 7), drills_total=0, drills_tried=0, drills_solved=0) == "passed"
    assert topic_status(studied=True, has_puzzles=True, puzzles=_puz(9, 9), drills_total=0, drills_tried=0, drills_solved=0) == "practising"


def test_status_book_only_topic_passes_when_every_drill_is_solved():
    kw = dict(studied=True, has_puzzles=False, puzzles=_puz(0, 0), drills_total=3)
    assert topic_status(**kw, drills_tried=1, drills_solved=1) == "practising"
    assert topic_status(**kw, drills_tried=3, drills_solved=2) == "practising"
    assert topic_status(**kw, drills_tried=3, drills_solved=3) == "passed"
    assert topic_status(studied=True, has_puzzles=False, puzzles=_puz(0, 0), drills_total=0,
                        drills_tried=0, drills_solved=0) == "studied"     # nothing to pass
