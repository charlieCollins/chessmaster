# backend/db.py
import os
import datetime
import logging
import secrets
from sqlalchemy import create_engine, event, Column, Integer, String, Float, DateTime, ForeignKey, Index, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chess.db")

_engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 10},
)

@event.listens_for(_engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


class Base(DeclarativeBase):
    pass


# Short, readable public game IDs (e.g. "k7m2qx"): no 0/1/i/l/o to misread.
PUBLIC_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
PUBLIC_ID_LENGTH = 6


def new_public_id() -> str:
    return "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(PUBLIC_ID_LENGTH))


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (Index("ux_games_public_id", "public_id", unique=True),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    pgn = Column(String, nullable=True)
    result = Column(String, default="*")        # "1-0", "0-1", "1/2-1/2", "*"
    player_color = Column(String, default="white")  # "white" or "black"
    engine_elo = Column(Integer, default=1500)
    engine = Column(String, default="stockfish")   # "stockfish" | "maia" (opponent family)
    public_id = Column(String, default=new_public_id)  # shown in the UI; names games/<id>.pgn
    played_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    source = Column(String, default="local")
    analyzed = Column(Integer, default=0)       # 0 = not analyzed, 1 = analyzed
    assisted = Column(Integer, default=0)       # 1 if player used hint during this game
    user = Column(String, default="local", index=True)  # signed-in user (email); see backend/identity.py


class Move(Base):
    __tablename__ = "moves"
    __table_args__ = (
        # One row per ply per game; also serves as the game_id lookup index.
        Index("ux_moves_game_ply", "game_id", "ply", unique=True),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    ply = Column(Integer, nullable=False)        # 1-indexed
    uci = Column(String, nullable=False)         # e.g. "e2e4"
    san = Column(String, nullable=False)         # e.g. "e4"
    classification = Column(String, nullable=True)   # best/good/inaccuracy/mistake/blunder
    eval_cp = Column(Float, nullable=True)       # centipawn eval AFTER this move (white POV)
    best_uci = Column(String, nullable=True)     # what engine would have played
    eval_loss_cp = Column(Float, nullable=True)  # raw cp lost vs best move, 0–2000 (classification uses win%)


class LearnAttempt(Base):
    """One try at a Learn position (book drill or Lichess puzzle)."""
    __tablename__ = "learn_attempts"
    __table_args__ = (Index("ix_learn_attempts_ref", "kind", "ref"), Index("ix_learn_attempts_topic", "topic"))
    id = Column(Integer, primary_key=True, autoincrement=True)
    user = Column(String, default="local", index=True)
    kind = Column(String, nullable=False)        # "puzzle" | "book"
    ref = Column(String, nullable=False)         # Lichess puzzle id | "<book slug>:<Fig>"
    topic = Column(String, nullable=True)
    context = Column(String, nullable=False)     # "lesson" | "review"
    solved = Column(Integer, nullable=False)     # 1 = solved on the first try
    revealed = Column(Integer, default=0)        # 1 = solution shown
    seconds = Column(Float, nullable=True)
    puzzle_rating = Column(Integer, nullable=True)
    rating_before = Column(Float, nullable=True)  # null when the attempt wasn't rated
    rating_after = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))


class LearnReview(Base):
    """A missed position waiting for spaced review."""
    __tablename__ = "learn_reviews"
    __table_args__ = (Index("ux_learn_reviews_user_item", "user", "kind", "ref", unique=True),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    user = Column(String, default="local", nullable=False)
    kind = Column(String, nullable=False)
    ref = Column(String, nullable=False)
    topic = Column(String, nullable=True)
    step = Column(Integer, nullable=False, default=0)
    due_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))


class LearnState(Base):
    """Per-user key/value learner state: puzzle_rating, rated_attempts.
    (Replaces the single-user learn_state table; init_db copies its rows to the owner.)"""
    __tablename__ = "learn_user_state"
    user = Column(String, primary_key=True)
    key = Column(String, primary_key=True)
    value = Column(Float, nullable=False)


def init_db(engine=None):
    engine = engine or _engine
    Base.metadata.create_all(engine)
    # Safe migrations for columns added after initial schema
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE games ADD COLUMN assisted INTEGER DEFAULT 0",
            "ALTER TABLE moves ADD COLUMN best_uci TEXT",
            "ALTER TABLE moves ADD COLUMN eval_loss_cp REAL",
            "ALTER TABLE games ADD COLUMN engine TEXT DEFAULT 'stockfish'",
            "ALTER TABLE games ADD COLUMN public_id TEXT",
            "ALTER TABLE games ADD COLUMN user TEXT",
            "ALTER TABLE learn_attempts ADD COLUMN user TEXT",
            "ALTER TABLE learn_reviews ADD COLUMN user TEXT",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except OperationalError as e:
                if "duplicate column name" not in str(e).lower():
                    raise
        # Give games created before public IDs existed an ID.
        for (gid,) in conn.execute(text("SELECT id FROM games WHERE public_id IS NULL")).fetchall():
            conn.execute(text("UPDATE games SET public_id = :pid WHERE id = :id"), {"pid": new_public_id(), "id": gid})
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_games_public_id ON games (public_id)"))
        conn.commit()
        # Per-user data (2026-11-25): rows from before sign-in belong to the owner
        # (CHESS_OWNER, set on the server in /etc/chess/chess.env; "local" otherwise).
        owner = os.getenv("CHESS_OWNER", "local")
        for table in ("games", "learn_attempts", "learn_reviews"):
            conn.execute(text(f"UPDATE {table} SET user = :o WHERE user IS NULL"), {"o": owner})
        conn.execute(text("DROP INDEX IF EXISTS ux_learn_reviews_item"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_learn_reviews_user_item ON learn_reviews (user, kind, ref)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_games_user ON games (user)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_learn_attempts_user ON learn_attempts (user)"))
        has_old_state = conn.execute(text(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='learn_state'")).first()
        if has_old_state:
            conn.execute(text("INSERT OR IGNORE INTO learn_user_state (user, key, value) "
                              "SELECT :o, key, value FROM learn_state"), {"o": owner})
        conn.commit()
        # Index for DBs created before it was part of the model.
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_moves_game_ply ON moves (game_id, ply)"))
            conn.commit()
        except Exception as e:  # existing duplicate plies; leave the DB usable
            conn.rollback()
            logging.getLogger(__name__).warning("Could not create ux_moves_game_ply: %s", e)


# FastAPI dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
