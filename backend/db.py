# backend/db.py
import os
import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chess.db")

_engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
    played_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    source = Column(String, default="local")
    analyzed = Column(Integer, default=0)       # 0 = not analyzed, 1 = analyzed
    assisted = Column(Integer, default=0)       # 1 if player used hint during this game


class Move(Base):
    __tablename__ = "moves"
    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    ply = Column(Integer, nullable=False)        # 1-indexed
    uci = Column(String, nullable=False)         # e.g. "e2e4"
    san = Column(String, nullable=False)         # e.g. "e4"
    classification = Column(String, nullable=True)   # blunder/mistake/inaccuracy/good
    eval_cp = Column(Float, nullable=True)       # centipawn eval AFTER this move (white POV)
    best_uci = Column(String, nullable=True)     # what engine would have played
    eval_loss_cp = Column(Float, nullable=True)  # cp lost vs best move (always >= 0)


def init_db():
    Base.metadata.create_all(_engine)
    # Safe migrations for columns added after initial schema
    with _engine.connect() as conn:
        for stmt in [
            "ALTER TABLE games ADD COLUMN assisted INTEGER DEFAULT 0",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # Column already exists


def get_db_session() -> Session:
    return SessionLocal()


# FastAPI dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
