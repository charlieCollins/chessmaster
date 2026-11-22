# backend/main.py
from contextlib import asynccontextmanager
import threading
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import func
from sqlalchemy.orm import Session
import chess

from .db import get_db, Game, Move, init_db
from .engine import ChessEngine
from .game_utils import reconstruct_board, generate_pgn
from .analysis import analyze_game
from .config import CORS_ORIGINS, HINT_TIME, ENGINE_MOVE_TIME, DEFAULT_ENGINE_ELO


# ── Engine lifecycle ──────────────────────────────────────────────────────────
_engine_instance: ChessEngine | None = None
_hint_engine: ChessEngine | None = None   # full-strength; separate from game engine
_engine_lock = threading.Lock()
_hint_lock = threading.Lock()

def _get_engine(elo: int = DEFAULT_ENGINE_ELO) -> ChessEngine:
    """Must be called while holding _engine_lock."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = ChessEngine(elo=elo)
    else:
        _engine_instance.set_elo(elo)
    return _engine_instance

def _get_hint_engine() -> ChessEngine:
    """Must be called while holding _hint_lock."""
    global _hint_engine
    if _hint_engine is None:
        _hint_engine = ChessEngine(full_strength=True)
    return _hint_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    if _engine_instance:
        _engine_instance.close()
    if _hint_engine:
        _hint_engine.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ────────────────────────────────────────────────────────────
class StartGameRequest(BaseModel):
    player_color: Literal["white", "black"] = "white"
    engine_elo: int = Field(DEFAULT_ENGINE_ELO, ge=400, le=3000)

class MoveRequest(BaseModel):
    uci: str

class BestMoveRequest(BaseModel):
    fen: str


# ── Helpers ───────────────────────────────────────────────────────────────────
_TERMINATION_LABELS = {
    chess.Termination.CHECKMATE:            "checkmate",
    chess.Termination.STALEMATE:            "stalemate",
    chess.Termination.INSUFFICIENT_MATERIAL: "insufficient material",
    chess.Termination.THREEFOLD_REPETITION: "repetition",
    chess.Termination.FIVEFOLD_REPETITION:  "repetition",
    chess.Termination.FIFTY_MOVES:          "50-move rule",
    chess.Termination.SEVENTYFIVE_MOVES:    "75-move rule",
}

def _check_and_end_game(game: Game, board: chess.Board, game_id: int, db: Session) -> dict | None:
    if board.is_game_over():
        result = board.result()
        outcome = board.outcome()
        termination = _TERMINATION_LABELS.get(outcome.termination) if outcome else None
        game.result = result
        game.pgn = generate_pgn(game_id, db)
        db.commit()
        return {"result": result, "game_over": True, "termination": termination}
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
        with _engine_lock:
            eng = _get_engine(req.engine_elo)
            try:
                uci = eng.get_best_move(board.fen(), time_limit=ENGINE_MOVE_TIME)
            except Exception as e:
                raise HTTPException(500, f"Engine error: {e}")
        if uci is None:
            raise HTTPException(500, "Engine returned no move for starting position")
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
        "engine_elo": game.engine_elo,
        "analyzed": bool(game.analyzed),
        "assisted": bool(game.assisted),
        "moves": [
            {
                "ply": m.ply,
                "uci": m.uci,
                "san": m.san,
                "classification": m.classification,
                "best_uci": m.best_uci,
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

    max_ply = db.query(func.max(Move.ply)).filter(Move.game_id == game_id).scalar()
    next_ply = (max_ply or 0) + 1
    san = board.san(move)
    board.push(move)
    db.add(Move(game_id=game_id, ply=next_ply, uci=req.uci, san=san))
    db.commit()

    if ended := _check_and_end_game(game, board, game_id, db):
        return {"fen": board.fen(), "engine_move": None, "eval_cp": None, **ended}

    with _engine_lock:
        eng = _get_engine(game.engine_elo)
        try:
            eval_cp, engine_uci = eng.analyse_position(board.fen(), time_limit=ENGINE_MOVE_TIME)
        except Exception as e:
            raise HTTPException(500, f"Engine error: {e}")

    if engine_uci is None:
        # Terminal position: engine has no move (checkmate, stalemate, etc.)
        result = board.result()
        outcome = board.outcome()
        termination = _TERMINATION_LABELS.get(outcome.termination) if outcome else None
        game.result = result
        game.pgn = generate_pgn(game_id, db)
        db.commit()
        return {
            "fen": board.fen(),
            "engine_move": None,
            "eval_cp": eval_cp,
            "game_over": True,
            "result": result,
            "termination": termination,
        }

    try:
        engine_move = chess.Move.from_uci(engine_uci)
    except (ValueError, chess.InvalidMoveError) as e:
        raise HTTPException(500, f"Engine returned invalid UCI move '{engine_uci}': {e}")
    engine_san = board.san(engine_move)
    board.push(engine_move)

    next_ply += 1
    db.add(Move(game_id=game_id, ply=next_ply, uci=engine_uci, san=engine_san))
    db.commit()

    ended = _check_and_end_game(game, board, game_id, db)

    # Eval after engine's move — used by frontend for engine move quality classification
    engine_eval_cp: float | None = None
    if not ended:
        with _hint_lock:
            try:
                engine_eval_cp = _get_hint_engine().evaluate(board.fen(), time_limit=0.05)
            except Exception:
                pass

    return {
        "fen": board.fen(),
        "engine_move": engine_uci,
        "eval_cp": eval_cp,
        "engine_eval_cp": engine_eval_cp,
        "game_over": ended["game_over"] if ended else False,
        "result": ended["result"] if ended else None,
    }


@app.delete("/api/game/{game_id}")
def delete_game(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    db.query(Move).filter(Move.game_id == game_id).delete()
    db.delete(game)
    db.commit()
    return {"status": "deleted"}


@app.post("/api/game/{game_id}/analyze")
def analyze(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result == "*":
        raise HTTPException(400, "Game is still in progress")
    if game.analyzed:
        raise HTTPException(400, "Game already analyzed. Delete the game to re-analyze.")
    try:
        analyze_game(game_id, db)
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")
    return {"status": "analyzed", "game_id": game_id}


@app.get("/api/games")
def list_games(db: Session = Depends(get_db)):
    rows_raw = (
        db.query(Game, func.count(Move.id).label("move_count"))
        .outerjoin(Move, Move.game_id == Game.id)
        .filter(Game.result != "*")
        .group_by(Game.id)
        .order_by(Game.id.desc())
        .limit(50)
        .all()
    )
    rows = []
    for g, move_count in rows_raw:
        rows.append({
            "game_id": g.id,
            "result": g.result,
            "player_color": g.player_color,
            "engine_elo": g.engine_elo,
            "played_at": g.played_at.isoformat() + "Z" if g.played_at else None,
            "analyzed": bool(g.analyzed),
            "assisted": bool(g.assisted),
            "move_count": move_count,
        })
    return rows


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    games = db.query(Game).filter(Game.result != "*").all()
    total = len(games)
    wins = losses = draws = 0
    for g in games:
        if g.result == "1/2-1/2":
            draws += 1
        elif (g.player_color == "white" and g.result == "1-0") or \
             (g.player_color == "black" and g.result == "0-1"):
            wins += 1
        else:
            losses += 1

    # Accuracy: % of player's own moves that are best or good (analyzed games only)
    counts: dict[str, int] = {}
    player_total = 0
    rows = (
        db.query(Move.game_id, Move.ply, Move.classification, Game.player_color)
        .join(Game, Game.id == Move.game_id)
        .filter(Game.analyzed == True)
        .all()
    )
    for game_id_row, ply, classification, player_color in rows:
        is_player = (player_color == "white" and ply % 2 == 1) or \
                    (player_color == "black" and ply % 2 == 0)
        if is_player and classification:
            counts[classification] = counts.get(classification, 0) + 1
            player_total += 1

    accuracy = None
    if player_total > 0:
        good_moves = counts.get("best", 0) + counts.get("good", 0)
        accuracy = round(good_moves / player_total * 100, 1)

    return {
        "total": total,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "accuracy": accuracy,
        "move_counts": counts,
        "analyzed_games": sum(1 for g in games if g.analyzed),
    }


@app.get("/api/game/{game_id}/hint")
def get_hint(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    board = reconstruct_board(game_id, db)
    if board.is_game_over():
        raise HTTPException(400, "Position is terminal")
    with _hint_lock:
        uci = _get_hint_engine().get_best_move(board.fen(), time_limit=HINT_TIME)
    if uci is None:
        raise HTTPException(400, "No hint available for this position")
    # Mark as assisted only while the game is still in progress
    if game.result == "*" and not game.assisted:
        game.assisted = 1
        db.commit()
    resp = {"from_sq": uci[:2], "to_sq": uci[2:4]}
    if len(uci) == 5:
        resp["promotion"] = uci[4]
    return resp


@app.post("/api/engine/best")
def engine_best(req: BestMoveRequest):
    """Return the engine's best move for a given FEN. Not tracked as assisted."""
    try:
        board = chess.Board(req.fen)
    except ValueError:
        raise HTTPException(400, "Invalid FEN")
    if board.is_game_over():
        raise HTTPException(400, "Position is terminal")
    with _hint_lock:
        uci = _get_hint_engine().get_best_move(board.fen(), time_limit=HINT_TIME)
    if uci is None:
        raise HTTPException(400, "No move available for this position")
    resp = {"from_sq": uci[:2], "to_sq": uci[2:4]}
    if len(uci) == 5:
        resp["promotion"] = uci[4]
    return resp


@app.post("/api/game/{game_id}/takeback")
def takeback(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result != "*":
        raise HTTPException(400, "Game already over")
    max_ply = db.query(func.max(Move.ply)).filter(Move.game_id == game_id).scalar() or 0
    if max_ply < 2:
        raise HTTPException(400, "No move to take back")
    # Remove the last two plies: engine reply + player move
    db.query(Move).filter(Move.game_id == game_id, Move.ply >= max_ply - 1).delete()
    db.commit()
    if not game.assisted:
        game.assisted = 1
        db.commit()
    board = reconstruct_board(game_id, db)
    return {"fen": board.fen()}


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
