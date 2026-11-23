# backend/db.py
import os
import datetime
import logging
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


class Game(Base):
    __tablename__ = "games"
    id = Column(Integer, primary_key=True, autoincrement=True)
    pgn = Column(String, nullable=True)
    result = Column(String, default="*")        # "1-0", "0-1", "1/2-1/2", "*"
    player_color = Column(String, default="white")  # "white" or "black"
    engine_elo = Column(Integer, default=1500)
    engine = Column(String, default="stockfish")   # "stockfish" | "maia" (opponent family)
    played_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    source = Column(String, default="local")
    analyzed = Column(Integer, default=0)       # 0 = not analyzed, 1 = analyzed
    assisted = Column(Integer, default=0)       # 1 if player used hint during this game


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


def init_db():
    Base.metadata.create_all(_engine)
    # Safe migrations for columns added after initial schema
    with _engine.connect() as conn:
        for stmt in [
            "ALTER TABLE games ADD COLUMN assisted INTEGER DEFAULT 0",
            "ALTER TABLE moves ADD COLUMN best_uci TEXT",
            "ALTER TABLE moves ADD COLUMN eval_loss_cp REAL",
            "ALTER TABLE games ADD COLUMN engine TEXT DEFAULT 'stockfish'",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except OperationalError as e:
                if "duplicate column name" not in str(e).lower():
                    raise
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
