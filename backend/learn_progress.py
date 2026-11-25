# backend/learn_progress.py
"""Pure rules for the Learn area: puzzle rating, spaced review, topic progress."""
from __future__ import annotations

from datetime import datetime, timedelta

START_RATING = 1300.0
REVIEW_DAYS = (1, 3, 7, 21)       # gap before review step 0, 1, 2, 3
PROVISIONAL_ATTEMPTS = 30         # K = 40 until this many rated attempts, then 20
PROGRESS_WINDOW = 20
PROGRESS_MIN = 5


def expected_score(rating: float, puzzle_rating: float) -> float:
    return 1.0 / (1.0 + 10 ** ((puzzle_rating - rating) / 400.0))


def update_rating(rating: float, puzzle_rating: float, solved: bool, rated_attempts: int) -> float:
    k = 40.0 if rated_attempts < PROVISIONAL_ATTEMPTS else 20.0
    return rating + k * ((1.0 if solved else 0.0) - expected_score(rating, puzzle_rating))


def next_review(step: int | None, solved: bool, now: datetime) -> tuple[int, datetime] | None:
    """New (step, due) for a position after an attempt; None = not (or no longer) queued.
    `step` is None when the position isn't in the review queue."""
    if not solved:
        return 0, now + timedelta(days=REVIEW_DAYS[0])
    if step is None or step + 1 >= len(REVIEW_DAYS):
        return None
    return step + 1, now + timedelta(days=REVIEW_DAYS[step + 1])


def topic_progress(results: list[bool]) -> dict:
    """First-try results, oldest first → progress over the most recent PROGRESS_WINDOW."""
    recent = results[-PROGRESS_WINDOW:]
    solved = sum(recent)
    acc = solved / len(recent) if len(recent) >= PROGRESS_MIN else None
    return {"attempts": len(recent), "solved": solved, "accuracy": acc}


PASS_MIN_PUZZLES = 10             # a puzzle topic is passed with >= 70% of the last 10–20 rated puzzles solved
PASS_ACCURACY = 0.7


def topic_status(*, studied: bool, has_puzzles: bool, puzzles: dict, drills_total: int,
                 drills_tried: int, drills_solved: int) -> str:
    """new → studied (lesson read) → practising (any attempt) → passed.
    Puzzle topics pass on recent puzzle accuracy; book-only topics when every drill's latest try is solved."""
    if has_puzzles:
        if puzzles["attempts"] >= PASS_MIN_PUZZLES and puzzles["solved"] / puzzles["attempts"] >= PASS_ACCURACY:
            return "passed"
    elif drills_total and drills_solved == drills_total:
        return "passed"
    if puzzles["attempts"] or drills_tried:
        return "practising"
    return "studied" if studied else "new"
