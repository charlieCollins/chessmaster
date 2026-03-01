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
from .analysis import analyze_game


# ── Engine lifecycle ──────────────────────────────────────────────────────────
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
        "moves": [
            {
                "ply": m.ply,
                "uci": m.uci,
                "san": m.san,
                "classification": m.classification,
            }
            for m in moves
        ],
    }


@app.post("/api/game/{game_id}/move")
def make_move(game_id: int, req: MoveRequest, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result != "*":
        raise HTTPException(400, "Game already over")

    board = reconstruct_board(game_id, db)

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

    if ended := _check_and_end_game(game, board, game_id, db):
        return {"fen": board.fen(), "engine_move": None, "eval_cp": None, **ended}

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


@app.post("/api/game/{game_id}/analyze")
def analyze(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result == "*":
        raise HTTPException(400, "Game is still in progress")
    analyze_game(game_id, db)
    return {"status": "analyzed", "game_id": game_id}


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
