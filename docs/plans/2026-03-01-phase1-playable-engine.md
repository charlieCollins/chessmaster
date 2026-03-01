# Chess Trainer Phase 1: Playable Engine Interface

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local web app to play chess against Stockfish, save games to SQLite, and view post-game move-by-move analysis.

**Architecture:** FastAPI backend handles game state, Stockfish engine communication, and SQLite persistence. React (Vite + TypeScript) frontend with `react-chessboard` provides the interactive board. All communication via JSON REST API on localhost.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, python-chess, SQLAlchemy, SQLite, React (Vite + TS), react-chessboard, chess.js

---

## Prerequisites

Install Stockfish system binary (WSL2 / Ubuntu):
```bash
sudo apt update && sudo apt install -y stockfish
which stockfish  # should print /usr/games/stockfish or /usr/bin/stockfish
```

---

### Task 1: Backend scaffold + dependencies

**Files:**
- Create: `backend/__init__.py`
- Create: `requirements.txt`
- Create: `pytest.ini`

**Step 1: Create directory structure**

```bash
mkdir -p backend tests
touch backend/__init__.py
```

**Step 2: Write requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
python-chess==1.999
sqlalchemy==2.0.36
pytest==8.3.3
httpx==0.27.2
```

**Step 3: Write pytest.ini**

```ini
[pytest]
testpaths = tests
```

**Step 4: Install dependencies**

```bash
pip install -r requirements.txt
```

Expected: All packages install without errors.

**Step 5: Verify python-chess and stockfish work together**

```bash
python -c "import chess; import chess.engine; e = chess.engine.SimpleEngine.popen_uci('stockfish'); print('OK'); e.quit()"
```

Expected: prints `OK`.

**Step 6: Commit**

```bash
git init
git add requirements.txt pytest.ini backend/__init__.py
git commit -m "feat: initial backend scaffold and dependencies"
```

---

### Task 2: Database models

**Files:**
- Create: `backend/db.py`
- Create: `tests/test_db.py`

**Step 1: Write the failing test**

```python
# tests/test_db.py
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

os.environ["DATABASE_URL"] = "sqlite://"  # in-memory for tests

from backend.db import Base, Game, Move, get_db_session

def test_game_model_creates_and_reads():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        game = Game(player_color="white", engine_elo=1500, result="*")
        session.add(game)
        session.commit()
        session.refresh(game)
        assert game.id is not None
        assert game.result == "*"

def test_move_model_linked_to_game():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        game = Game(player_color="white", engine_elo=1500, result="*")
        session.add(game)
        session.commit()
        move = Move(game_id=game.id, ply=1, uci="e2e4", san="e4")
        session.add(move)
        session.commit()
        assert move.id is not None
        assert move.game_id == game.id
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_db.py -v
```

Expected: `FAIL` — `ModuleNotFoundError: No module named 'backend.db'`

**Step 3: Write backend/db.py**

```python
# backend/db.py
import os
import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
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
    played_at = Column(DateTime, default=datetime.datetime.utcnow)
    source = Column(String, default="local")
    analyzed = Column(Integer, default=0)       # 0 = not analyzed, 1 = analyzed


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


def get_db_session() -> Session:
    return SessionLocal()


# FastAPI dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Step 4: Run tests to verify they pass**

```bash
pytest tests/test_db.py -v
```

Expected: `PASSED` for both tests.

**Step 5: Commit**

```bash
git add backend/db.py tests/test_db.py
git commit -m "feat: add SQLAlchemy models for Game and Move"
```

---

### Task 3: Stockfish engine wrapper

**Files:**
- Create: `backend/engine.py`
- Create: `tests/test_engine.py`

**Step 1: Write the failing tests**

```python
# tests/test_engine.py
import chess
import pytest
from backend.engine import ChessEngine

STARTING_FEN = chess.STARTING_FEN
AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

@pytest.fixture
def engine():
    eng = ChessEngine(elo=1500)
    yield eng
    eng.close()

def test_get_best_move_returns_valid_uci(engine):
    move = engine.get_best_move(AFTER_E4_FEN)
    # UCI format: 4 chars (e2e4) or 5 chars with promotion (e7e8q)
    assert 4 <= len(move) <= 5
    # Must be a legal move
    board = chess.Board(AFTER_E4_FEN)
    assert chess.Move.from_uci(move) in board.legal_moves

def test_evaluate_returns_centipawns(engine):
    score = engine.evaluate(STARTING_FEN)
    assert score is not None
    assert isinstance(score, float)
    # Starting position is roughly equal (within 50cp)
    assert abs(score) < 50

def test_evaluate_mate_returns_large_value(engine):
    # Fool's mate — black checkmated
    fool = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    score = engine.evaluate(fool)
    assert score is not None
    assert score < -5000  # white is mated, strongly negative from white's POV
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_engine.py -v
```

Expected: `FAIL` — `ModuleNotFoundError`

**Step 3: Write backend/engine.py**

```python
# backend/engine.py
import chess
import chess.engine
from typing import Optional


class ChessEngine:
    """Wrapper around Stockfish for move generation and position evaluation."""

    def __init__(self, elo: int = 1500, stockfish_path: str = "stockfish"):
        self._engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        self.elo = elo
        self._set_elo(elo)

    def _set_elo(self, elo: int):
        self._engine.configure({"UCI_LimitStrength": True, "UCI_Elo": elo})

    def set_elo(self, elo: int):
        self.elo = elo
        self._set_elo(elo)

    def get_best_move(self, fen: str, time_limit: float = 0.1) -> str:
        board = chess.Board(fen)
        result = self._engine.play(board, chess.engine.Limit(time=time_limit))
        return result.move.uci()

    def evaluate(self, fen: str, time_limit: float = 0.1) -> Optional[float]:
        """Return centipawn evaluation from White's perspective. Mate = ±10000."""
        board = chess.Board(fen)
        info = self._engine.analyse(board, chess.engine.Limit(time=time_limit))
        score = info["score"].white()
        if score.is_mate():
            return 10000.0 if score.mate() > 0 else -10000.0
        return float(score.cp)

    def close(self):
        self._engine.quit()
```

**Step 4: Run tests to verify they pass**

```bash
pytest tests/test_engine.py -v
```

Expected: All 3 tests `PASSED`. (May take ~2-3 seconds for engine startup.)

**Step 5: Commit**

```bash
git add backend/engine.py tests/test_engine.py
git commit -m "feat: add Stockfish engine wrapper with evaluation"
```

---

### Task 4: Game state utilities

**Files:**
- Create: `backend/game_utils.py`
- Create: `tests/test_game_utils.py`

**Step 1: Write the failing tests**

```python
# tests/test_game_utils.py
import os
os.environ["DATABASE_URL"] = "sqlite://"

import chess
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.db import Base, Game, Move
from backend.game_utils import reconstruct_board, generate_pgn, classify_move

@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

def _make_game_with_moves(db):
    game = Game(player_color="white", engine_elo=1500, result="*")
    db.add(game)
    db.commit()
    # e4 e5
    db.add(Move(game_id=game.id, ply=1, uci="e2e4", san="e4"))
    db.add(Move(game_id=game.id, ply=2, uci="e7e5", san="e5"))
    db.commit()
    return game

def test_reconstruct_board_returns_correct_fen(db):
    game = _make_game_with_moves(db)
    board = reconstruct_board(game.id, db)
    expected_fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2"
    assert board.fen() == expected_fen

def test_reconstruct_board_empty_game(db):
    game = Game(player_color="white", engine_elo=1500, result="*")
    db.add(game)
    db.commit()
    board = reconstruct_board(game.id, db)
    assert board.fen() == chess.STARTING_FEN

def test_classify_move():
    assert classify_move(250) == "blunder"
    assert classify_move(150) == "mistake"
    assert classify_move(75) == "inaccuracy"
    assert classify_move(20) == "good"
    assert classify_move(-10) == "good"   # actually gained eval

def test_generate_pgn(db):
    game = _make_game_with_moves(db)
    pgn = generate_pgn(game.id, db)
    assert "e4" in pgn
    assert "e5" in pgn
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_game_utils.py -v
```

Expected: `FAIL` — `ModuleNotFoundError`

**Step 3: Write backend/game_utils.py**

```python
# backend/game_utils.py
import chess
import chess.pgn
import io
from sqlalchemy.orm import Session
from .db import Move


def reconstruct_board(game_id: int, db: Session) -> chess.Board:
    """Replay all stored moves to get current board state."""
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    board = chess.Board()
    for move in moves:
        board.push(chess.Move.from_uci(move.uci))
    return board


def generate_pgn(game_id: int, db: Session) -> str:
    """Generate PGN string from stored moves."""
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    game = chess.pgn.Game()
    node = game
    board = chess.Board()
    for move in moves:
        chess_move = chess.Move.from_uci(move.uci)
        node = node.add_variation(chess_move)
        board.push(chess_move)
    exporter = chess.pgn.StringExporter(headers=False, comments=False, variations=False)
    return game.accept(exporter)


def classify_move(eval_loss_cp: float) -> str:
    """Classify a move based on centipawn loss vs best move."""
    if eval_loss_cp >= 200:
        return "blunder"
    elif eval_loss_cp >= 100:
        return "mistake"
    elif eval_loss_cp >= 50:
        return "inaccuracy"
    else:
        return "good"
```

**Step 4: Run tests to verify they pass**

```bash
pytest tests/test_game_utils.py -v
```

Expected: All 5 tests `PASSED`.

**Step 5: Commit**

```bash
git add backend/game_utils.py tests/test_game_utils.py
git commit -m "feat: add board reconstruction, PGN generation, move classification"
```

---

### Task 5: FastAPI game endpoints

**Files:**
- Create: `backend/main.py`
- Create: `tests/test_game_api.py`

**Step 1: Write the failing tests**

```python
# tests/test_game_api.py
import os
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.db import Base, _engine as default_engine
from backend.main import app, get_db

# Override DB to use in-memory SQLite
test_engine = create_engine("sqlite://")
Base.metadata.create_all(test_engine)

def override_get_db():
    with Session(test_engine) as session:
        yield session

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def test_start_game_as_white():
    res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    assert res.status_code == 200
    data = res.json()
    assert "game_id" in data
    assert data["player_color"] == "white"
    assert "fen" in data
    assert data["engine_first_move"] is None  # white moves first

def test_start_game_as_black():
    res = client.post("/api/game", json={"player_color": "black", "engine_elo": 1500})
    assert res.status_code == 200
    data = res.json()
    assert data["engine_first_move"] is not None  # engine opens for black player
    assert len(data["engine_first_move"]) >= 4

def test_make_legal_move():
    # Start a game
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]

    # Make e4
    move_res = client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})
    assert move_res.status_code == 200
    data = move_res.json()
    assert "fen" in data
    assert "engine_move" in data
    assert data["game_over"] is False

def test_make_illegal_move():
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]
    res = client.post(f"/api/game/{game_id}/move", json={"uci": "e2e5"})  # illegal
    assert res.status_code == 400

def test_get_game_state():
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]
    client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})

    state = client.get(f"/api/game/{game_id}")
    assert state.status_code == 200
    data = state.json()
    assert "fen" in data
    assert "moves" in data
    assert len(data["moves"]) >= 2  # player move + engine response
```

**Step 2: Run tests to verify they fail**

```bash
pytest tests/test_game_api.py -v
```

Expected: `FAIL` — `ModuleNotFoundError`

**Step 3: Write backend/main.py**

```python
# backend/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import chess

from .db import get_db, Game, Move, init_db
from .engine import ChessEngine
from .game_utils import reconstruct_board, generate_pgn


# ── Engine lifecycle ─────────────────────────────────────────────────────────
_engine_instance: ChessEngine | None = None

def _get_engine(elo: int = 1500) -> ChessEngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = ChessEngine(elo=elo)
    else:
        _engine_instance.set_elo(elo)
    return _engine_instance


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    if _engine_instance:
        _engine_instance.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ────────────────────────────────────────────────────────────
class StartGameRequest(BaseModel):
    player_color: str = "white"
    engine_elo: int = 1500

class MoveRequest(BaseModel):
    uci: str


# ── Helpers ───────────────────────────────────────────────────────────────────
def _check_and_end_game(game: Game, board: chess.Board, game_id: int, db: Session) -> dict | None:
    if board.is_game_over():
        result = board.result()
        game.result = result
        game.pgn = generate_pgn(game_id, db)
        db.commit()
        return {"result": result, "game_over": True}
    return None


# ── Routes ────────────────────────────────────────────────────────────────────
@app.post("/api/game")
def start_game(req: StartGameRequest, db: Session = Depends(get_db)):
    game = Game(player_color=req.player_color, engine_elo=req.engine_elo, result="*")
    db.add(game)
    db.commit()
    db.refresh(game)

    board = chess.Board()
    engine_first_move = None

    if req.player_color == "black":
        eng = _get_engine(req.engine_elo)
        uci = eng.get_best_move(board.fen())
        move = chess.Move.from_uci(uci)
        san = board.san(move)
        board.push(move)
        db.add(Move(game_id=game.id, ply=1, uci=uci, san=san))
        db.commit()
        engine_first_move = uci

    return {
        "game_id": game.id,
        "fen": board.fen(),
        "player_color": req.player_color,
        "engine_elo": req.engine_elo,
        "engine_first_move": engine_first_move,
    }


@app.get("/api/game/{game_id}")
def get_game(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    board = reconstruct_board(game_id, db)
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    return {
        "game_id": game_id,
        "fen": board.fen(),
        "result": game.result,
        "player_color": game.player_color,
        "analyzed": bool(game.analyzed),
        "moves": [{"ply": m.ply, "uci": m.uci, "san": m.san, "classification": m.classification} for m in moves],
    }


@app.post("/api/game/{game_id}/move")
def make_move(game_id: int, req: MoveRequest, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result != "*":
        raise HTTPException(400, "Game already over")

    board = reconstruct_board(game_id, db)

    # Validate player move
    try:
        move = chess.Move.from_uci(req.uci)
    except ValueError:
        raise HTTPException(400, "Invalid UCI format")
    if move not in board.legal_moves:
        raise HTTPException(400, "Illegal move")

    next_ply = db.query(Move).filter(Move.game_id == game_id).count() + 1
    san = board.san(move)
    board.push(move)
    db.add(Move(game_id=game_id, ply=next_ply, uci=req.uci, san=san))
    db.commit()

    # Check if player move ended the game
    if ended := _check_and_end_game(game, board, game_id, db):
        return {"fen": board.fen(), "engine_move": None, "eval_cp": None, **ended}

    # Engine responds
    eng = _get_engine(game.engine_elo)
    eval_cp = eng.evaluate(board.fen())
    engine_uci = eng.get_best_move(board.fen())
    engine_move = chess.Move.from_uci(engine_uci)
    engine_san = board.san(engine_move)
    board.push(engine_move)

    next_ply += 1
    db.add(Move(game_id=game_id, ply=next_ply, uci=engine_uci, san=engine_san))
    db.commit()

    ended = _check_and_end_game(game, board, game_id, db)
    return {
        "fen": board.fen(),
        "engine_move": engine_uci,
        "eval_cp": eval_cp,
        "game_over": ended["game_over"] if ended else False,
        "result": ended["result"] if ended else None,
    }


@app.post("/api/game/{game_id}/resign")
def resign_game(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result != "*":
        raise HTTPException(400, "Game already over")
    game.result = "0-1" if game.player_color == "white" else "1-0"
    game.pgn = generate_pgn(game_id, db)
    db.commit()
    return {"result": game.result}
```

**Step 4: Run tests to verify they pass**

```bash
pytest tests/test_game_api.py -v
```

Expected: All 5 tests `PASSED`.

**Step 5: Verify the server starts**

```bash
uvicorn backend.main:app --reload
```

Expected: `INFO: Uvicorn running on http://127.0.0.1:8000`

Stop with Ctrl+C.

**Step 6: Commit**

```bash
git add backend/main.py tests/test_game_api.py
git commit -m "feat: add FastAPI game endpoints (start, move, resign, get state)"
```

---

### Task 6: Post-game analysis endpoint

**Files:**
- Create: `backend/analysis.py`
- Modify: `backend/main.py` (add `/api/game/{id}/analyze` route)
- Create: `tests/test_analysis.py`

**Step 1: Write the failing test**

```python
# tests/test_analysis.py
import os
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.db import Base
from backend.main import app, get_db
from backend.game_utils import classify_move

test_engine = create_engine("sqlite://")
Base.metadata.create_all(test_engine)

def override_get_db():
    with Session(test_engine) as session:
        yield session

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def test_classify_move_boundaries():
    assert classify_move(201) == "blunder"
    assert classify_move(200) == "blunder"
    assert classify_move(199) == "mistake"
    assert classify_move(100) == "mistake"
    assert classify_move(99) == "inaccuracy"
    assert classify_move(50) == "inaccuracy"
    assert classify_move(49) == "good"
    assert classify_move(0) == "good"
    assert classify_move(-30) == "good"   # eval gained

def test_analyze_completed_game():
    # Play a short game to completion or just a few moves
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]

    client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})
    client.post(f"/api/game/{game_id}/move", json={"uci": "d2d4"})

    # Manually set result to mark as done
    with Session(test_engine) as db:
        from backend.db import Game
        game = db.get(Game, game_id)
        game.result = "1-0"
        db.commit()

    res = client.post(f"/api/game/{game_id}/analyze")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "analyzed"

    # Verify moves have classifications
    state = client.get(f"/api/game/{game_id}")
    moves = state.json()["moves"]
    player_moves = [m for m in moves if m["ply"] % 2 == 1]  # white's moves
    for m in player_moves:
        assert m["classification"] in ("blunder", "mistake", "inaccuracy", "good")
```

**Step 2: Run test to verify it fails**

```bash
pytest tests/test_analysis.py -v
```

Expected: `FAIL`

**Step 3: Write backend/analysis.py**

```python
# backend/analysis.py
import chess
from sqlalchemy.orm import Session
from .db import Move, Game
from .engine import ChessEngine
from .game_utils import classify_move


def analyze_game(game_id: int, db: Session) -> None:
    """
    Run full post-game analysis. For each ply:
    - Get eval before the move
    - Get Stockfish's best move at that position
    - Get eval after the move
    - Compute eval loss from the moving player's perspective
    - Classify and store
    """
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    if not moves:
        return

    # Use full-strength engine for analysis
    eng = ChessEngine(elo=3500)
    try:
        board = chess.Board()
        for move_record in moves:
            fen_before = board.fen()

            # Best move and eval before
            best_uci = eng.get_best_move(fen_before, time_limit=0.3)
            eval_before = eng.evaluate(fen_before, time_limit=0.3) or 0.0

            # Apply actual move
            actual_move = chess.Move.from_uci(move_record.uci)
            board.push(actual_move)

            eval_after = eng.evaluate(board.fen(), time_limit=0.3) or 0.0

            # Eval loss from moving player's perspective
            # Odd ply = white moves; even ply = black moves
            # White wants eval_after > eval_before (higher = better for white)
            # Black wants eval_after < eval_before (lower = better for black)
            if move_record.ply % 2 == 1:  # White moved
                eval_loss = eval_before - eval_after
            else:                          # Black moved
                eval_loss = eval_after - eval_before

            move_record.eval_cp = eval_after
            move_record.best_uci = best_uci
            move_record.eval_loss_cp = eval_loss
            move_record.classification = classify_move(eval_loss)

        game = db.get(Game, game_id)
        game.analyzed = 1
        db.commit()
    finally:
        eng.close()
```

**Step 4: Add the `/analyze` route to backend/main.py**

Add this import at the top of `backend/main.py`:
```python
from .analysis import analyze_game
```

Add this route after the `/resign` route:
```python
@app.post("/api/game/{game_id}/analyze")
def analyze(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result == "*":
        raise HTTPException(400, "Game is still in progress")
    analyze_game(game_id, db)
    return {"status": "analyzed", "game_id": game_id}
```

**Step 5: Run tests to verify they pass**

```bash
pytest tests/test_analysis.py -v
```

Expected: All tests `PASSED`. (Analysis may take 5-10 seconds due to Stockfish calls.)

**Step 6: Run full test suite**

```bash
pytest -v
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add backend/analysis.py backend/main.py tests/test_analysis.py
git commit -m "feat: add post-game move analysis with Stockfish classification"
```

---

### Task 7: React frontend scaffold

**Files:**
- Create: `frontend/` (Vite project)
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/vite.config.ts`

**Step 1: Scaffold Vite React TypeScript project**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install react-chessboard chess.js
```

**Step 2: Verify it starts**

```bash
cd frontend && npm run dev
```

Expected: `Local: http://localhost:5173/` — default Vite page shows. Stop with Ctrl+C.

**Step 3: Replace frontend/src/App.tsx with routing shell**

```tsx
// frontend/src/App.tsx
import { useState } from "react";
import Play from "./pages/Play";
import Review from "./pages/Review";

type Page = "play" | "review";

export default function App() {
  const [page, setPage] = useState<Page>("play");
  const [reviewGameId, setReviewGameId] = useState<number | null>(null);

  function goToReview(gameId: number) {
    setReviewGameId(gameId);
    setPage("review");
  }

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Chess Trainer</h1>
      <nav style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button onClick={() => setPage("play")} disabled={page === "play"}>Play</button>
        {reviewGameId && (
          <button onClick={() => setPage("review")} disabled={page === "review"}>Review</button>
        )}
      </nav>
      {page === "play" && <Play onGameEnd={goToReview} />}
      {page === "review" && reviewGameId && <Review gameId={reviewGameId} />}
    </div>
  );
}
```

**Step 4: Create pages directory**

```bash
mkdir -p frontend/src/pages
```

**Step 5: Commit**

```bash
cd ..  # back to project root
git add frontend/
git commit -m "feat: scaffold React Vite frontend with routing shell"
```

---

### Task 8: Play page (board + game flow)

**Files:**
- Create: `frontend/src/pages/Play.tsx`

**Step 1: Write frontend/src/pages/Play.tsx**

```tsx
// frontend/src/pages/Play.tsx
import { useState, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

const API = "http://localhost:8000";

interface PlayProps {
  onGameEnd: (gameId: number) => void;
}

interface GameState {
  gameId: number;
  fen: string;
  playerColor: "white" | "black";
  engineElo: number;
  gameOver: boolean;
  result: string | null;
  evalCp: number | null;
}

export default function Play({ onGameEnd }: PlayProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [colorChoice, setColorChoice] = useState<"white" | "black">("white");
  const [eloChoice, setEloChoice] = useState(1500);

  async function startGame() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_color: colorChoice, engine_elo: eloChoice }),
      });
      const data = await res.json();
      setState({
        gameId: data.game_id,
        fen: data.fen,
        playerColor: colorChoice,
        engineElo: eloChoice,
        gameOver: false,
        result: null,
        evalCp: null,
      });
    } finally {
      setLoading(false);
    }
  }

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (!state || state.gameOver || loading) return false;

      // Detect promotion
      const chess = new Chess(state.fen);
      const movingPiece = chess.get(sourceSquare as any);
      const isPromotion =
        movingPiece?.type === "p" &&
        ((movingPiece.color === "w" && targetSquare[1] === "8") ||
          (movingPiece.color === "b" && targetSquare[1] === "1"));
      const uci = sourceSquare + targetSquare + (isPromotion ? "q" : "");

      makeMove(uci);
      return true;
    },
    [state, loading]
  );

  async function makeMove(uci: string) {
    if (!state) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uci }),
      });
      if (!res.ok) return; // illegal move — board will snap back
      const data = await res.json();
      setState((s) =>
        s
          ? {
              ...s,
              fen: data.fen,
              evalCp: data.eval_cp ?? null,
              gameOver: data.game_over,
              result: data.result ?? null,
            }
          : s
      );
      if (data.game_over) {
        onGameEnd(state.gameId);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resign() {
    if (!state || state.gameOver) return;
    await fetch(`${API}/api/game/${state.gameId}/resign`, { method: "POST" });
    setState((s) => (s ? { ...s, gameOver: true, result: s.playerColor === "white" ? "0-1" : "1-0" } : s));
    if (state) onGameEnd(state.gameId);
  }

  function evalBar(evalCp: number | null, playerColor: "white" | "black") {
    if (evalCp === null) return null;
    const fromPlayerPov = playerColor === "white" ? evalCp : -evalCp;
    const display = fromPlayerPov > 0 ? `+${(fromPlayerPov / 100).toFixed(2)}` : (fromPlayerPov / 100).toFixed(2);
    const color = fromPlayerPov >= 0 ? "#4a9" : "#c55";
    return <span style={{ color, fontWeight: "bold", fontSize: 14 }}>Eval: {display}</span>;
  }

  if (!state) {
    return (
      <div>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>New Game</h2>
        <div style={{ marginBottom: 8 }}>
          <label>Play as: </label>
          <select value={colorChoice} onChange={(e) => setColorChoice(e.target.value as "white" | "black")}>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Engine ELO: </label>
          <select value={eloChoice} onChange={(e) => setEloChoice(Number(e.target.value))}>
            <option value={800}>800 (Beginner)</option>
            <option value={1200}>1200 (Casual)</option>
            <option value={1500}>1500 (Intermediate)</option>
            <option value={2000}>2000 (Strong)</option>
          </select>
        </div>
        <button onClick={startGame} disabled={loading}>
          {loading ? "Starting..." : "Start Game"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 500 }}>
          <Chessboard
            position={state.fen}
            onPieceDrop={onDrop}
            boardOrientation={state.playerColor}
            boardWidth={500}
            arePremovesAllowed={false}
          />
        </div>
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>Playing as: <strong>{state.playerColor}</strong></div>
          <div>Engine ELO: <strong>{state.engineElo}</strong></div>
          {evalBar(state.evalCp, state.playerColor)}
          {state.gameOver ? (
            <div>
              <strong>Game Over</strong> — {state.result}
              <br />
              <button onClick={() => setState(null)} style={{ marginTop: 8 }}>New Game</button>
            </div>
          ) : (
            <button onClick={resign} disabled={loading} style={{ marginTop: 8 }}>Resign</button>
          )}
          {loading && <div style={{ color: "#888", fontSize: 12 }}>Engine thinking...</div>}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd frontend && npm run build
```

Expected: Build completes with no errors. Stop dev server if running.

**Step 3: Test the full flow manually**

```bash
# Terminal 1
uvicorn backend.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Open `http://localhost:5173`, start a game, make a few moves. Verify:
- Board renders and accepts moves
- Engine responds
- Eval updates after each move
- Resign ends the game

**Step 4: Commit**

```bash
cd ..
git add frontend/src/pages/Play.tsx
git commit -m "feat: add Play page with interactive board and engine response"
```

---

### Task 9: Post-game Review page

**Files:**
- Create: `frontend/src/pages/Review.tsx`

**Step 1: Write frontend/src/pages/Review.tsx**

```tsx
// frontend/src/pages/Review.tsx
import { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

const API = "http://localhost:8000";

const COLORS: Record<string, string> = {
  blunder: "#c00",
  mistake: "#e60",
  inaccuracy: "#ca0",
  good: "#4a9",
};

interface MoveRecord {
  ply: number;
  uci: string;
  san: string;
  classification: string | null;
}

interface GameData {
  game_id: number;
  result: string;
  player_color: string;
  analyzed: boolean;
  moves: MoveRecord[];
}

interface ReviewProps {
  gameId: number;
}

export default function Review({ gameId }: ReviewProps) {
  const [game, setGame] = useState<GameData | null>(null);
  const [currentPly, setCurrentPly] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/game/${gameId}`)
      .then((r) => r.json())
      .then(setGame);
  }, [gameId]);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      await fetch(`${API}/api/game/${gameId}/analyze`, { method: "POST" });
      const res = await fetch(`${API}/api/game/${gameId}`);
      setGame(await res.json());
    } finally {
      setAnalyzing(false);
    }
  }

  function getFenAtPly(moves: MoveRecord[], ply: number): string {
    const chess = new Chess();
    for (let i = 0; i < ply; i++) {
      chess.move(moves[i].san);
    }
    return chess.fen();
  }

  if (!game) return <div>Loading...</div>;

  const fen = getFenAtPly(game.moves, currentPly);
  const currentMove = currentPly > 0 ? game.moves[currentPly - 1] : null;

  return (
    <div>
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>
        Game Review — Result: {game.result}
      </h2>

      {!game.analyzed && (
        <button onClick={runAnalysis} disabled={analyzing} style={{ marginBottom: 12 }}>
          {analyzing ? "Analyzing... (this takes ~30s)" : "Run Analysis"}
        </button>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 480 }}>
          <Chessboard
            position={fen}
            boardOrientation={game.player_color as "white" | "black"}
            boardWidth={480}
            arePiecesDraggable={false}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setCurrentPly(0)} disabled={currentPly === 0}>|&lt;</button>
            <button onClick={() => setCurrentPly((p) => Math.max(0, p - 1))} disabled={currentPly === 0}>&lt;</button>
            <button onClick={() => setCurrentPly((p) => Math.min(game.moves.length, p + 1))} disabled={currentPly === game.moves.length}>&gt;</button>
            <button onClick={() => setCurrentPly(game.moves.length)} disabled={currentPly === game.moves.length}>&gt;|</button>
            <span style={{ fontSize: 12, color: "#666", alignSelf: "center" }}>
              Ply {currentPly} / {game.moves.length}
            </span>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {currentMove && (
            <div style={{ marginBottom: 12, padding: 8, background: "#f5f5f5", borderRadius: 4 }}>
              <div><strong>Move {currentPly}:</strong> {currentMove.san}</div>
              {currentMove.classification && (
                <div style={{ color: COLORS[currentMove.classification] || "#333", fontWeight: "bold" }}>
                  {currentMove.classification.toUpperCase()}
                </div>
              )}
            </div>
          )}

          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {game.moves.map((m, i) => (
              <span
                key={m.ply}
                onClick={() => setCurrentPly(i + 1)}
                style={{
                  display: "inline-block",
                  margin: "2px 4px",
                  padding: "2px 6px",
                  borderRadius: 3,
                  cursor: "pointer",
                  background: currentPly === i + 1 ? "#ddd" : "transparent",
                  color: m.classification ? COLORS[m.classification] : "#333",
                  fontWeight: m.classification && m.classification !== "good" ? "bold" : "normal",
                  fontSize: 13,
                }}
              >
                {m.ply % 2 === 1 ? `${Math.ceil(m.ply / 2)}. ` : ""}{m.san}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd frontend && npm run build
```

Expected: No errors.

**Step 3: Test the full flow manually**

1. Play a game to completion
2. App redirects to Review tab automatically
3. Click "Run Analysis" — wait ~30s
4. Step through moves with arrows — colored move list shows blunders/mistakes

**Step 4: Commit**

```bash
cd ..
git add frontend/src/pages/Review.tsx
git commit -m "feat: add post-game Review page with move classification display"
```

---

### Task 10: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Step 1: Write CLAUDE.md**

```markdown
# Chess Trainer

Self-hosted chess trainer web app. FastAPI backend + React (Vite TS) frontend.
Runs entirely on localhost, single user, no auth.

## Quick Start

### Backend
\`\`\`bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
# API at http://localhost:8000
\`\`\`

### Frontend
\`\`\`bash
cd frontend && npm install && npm run dev
# App at http://localhost:5173
\`\`\`

### Tests
\`\`\`bash
pytest -v
\`\`\`

## Architecture

- `backend/main.py` — FastAPI app, routes, lifespan (engine init/shutdown)
- `backend/engine.py` — Stockfish wrapper (get_best_move, evaluate)
- `backend/db.py` — SQLAlchemy models: Game, Move. SQLite at `chess.db`
- `backend/game_utils.py` — Board reconstruction, PGN generation, move classification
- `backend/analysis.py` — Post-game analysis (iterates all moves, classifies each)
- `frontend/src/pages/Play.tsx` — Interactive board, play vs engine
- `frontend/src/pages/Review.tsx` — Annotated game replay with nav controls

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/game` | Start new game |
| GET | `/api/game/{id}` | Get game state + moves |
| POST | `/api/game/{id}/move` | Make a move (returns engine response) |
| POST | `/api/game/{id}/resign` | Resign the game |
| POST | `/api/game/{id}/analyze` | Run post-game Stockfish analysis |

## Key Dependencies

- `python-chess` — board logic, FEN/PGN, move validation
- `stockfish` (system binary via apt) — engine, called via `chess.engine.SimpleEngine`
- `react-chessboard` — interactive board component
- `chess.js` — client-side move validation and FEN reconstruction

## Eval Convention

Centipawns from White's perspective (positive = good for White).
UI converts to player's POV for the eval bar display.

## Phases (Roadmap)

- **Phase 1** (current): Play vs engine + save + post-game analysis
- **Phase 2**: Weakness detection across game history, dashboard
- **Phase 3**: Concept training (pick a topic, get drills from your games)
- **Phase 4**: Chess.com PGN import
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with architecture and quick start"
```

---

## Full Test Run

```bash
pytest -v
```

Expected output (all passing):
```
tests/test_db.py::test_game_model_creates_and_reads PASSED
tests/test_db.py::test_move_model_linked_to_game PASSED
tests/test_engine.py::test_engine_returns_valid_move PASSED
tests/test_engine.py::test_evaluate_returns_centipawns PASSED
tests/test_engine.py::test_evaluate_mate_returns_large_value PASSED
tests/test_game_utils.py::test_reconstruct_board_returns_correct_fen PASSED
tests/test_game_utils.py::test_reconstruct_board_empty_game PASSED
tests/test_game_utils.py::test_classify_move PASSED
tests/test_game_utils.py::test_generate_pgn PASSED
tests/test_game_api.py::test_start_game_as_white PASSED
tests/test_game_api.py::test_start_game_as_black PASSED
tests/test_game_api.py::test_make_legal_move PASSED
tests/test_game_api.py::test_make_illegal_move PASSED
tests/test_game_api.py::test_get_game_state PASSED
tests/test_analysis.py::test_classify_move_boundaries PASSED
tests/test_analysis.py::test_analyze_completed_game PASSED
```
