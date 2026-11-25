# backend/main.py
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import func
from sqlalchemy.orm import Session
import chess

from .db import get_db, Game, Move, init_db, SessionLocal
from .engine import ChessEngine, EngineSlot, MaiaEngine, maia_available
from .learn_api import router as learn_router
from .game_utils import reconstruct_board, generate_pgn, accuracy_summary
from .analysis import analyze_game
from .game_files import write_game_file, delete_game_file, write_missing_game_files
from .config import CORS_ORIGINS, HINT_TIME, ENGINE_MOVE_TIME, LIVE_EVAL_TIME, DEFAULT_ENGINE_ELO, MAIA_LEVELS


# ── Engine lifecycle ──────────────────────────────────────────────────────────
# Game engine: strength-limited, only used to *choose* the engine's moves.
# Hint engine: full strength, used for every eval/best-move shown to the player.
_game_engine = EngineSlot(lambda: ChessEngine(elo=DEFAULT_ENGINE_ELO))
_hint_engine = EngineSlot(lambda: ChessEngine(full_strength=True))
# Maia: human-trained opponent (lc0), only used to choose the opponent's moves.
_maia_engine = EngineSlot(lambda: MaiaEngine())
_analysis_lock = threading.Lock()   # post-game analyses run one at a time


def run_game_engine(engine: str, elo: int, fn):
    """Run fn(engine) on the opponent engine for this game, configured to `elo`."""
    if engine == "maia":
        def configured_maia(eng: MaiaEngine):
            eng.set_level(elo)
            return fn(eng)
        return _maia_engine.run(configured_maia)

    def configured(eng: ChessEngine):
        eng.set_elo(elo)
        return fn(eng)
    return _game_engine.run(configured)


def run_hint_engine(fn):
    """Run fn(engine) on the full-strength engine."""
    return _hint_engine.run(fn)


def _live_eval(fen: str) -> float | None:
    """Full-strength eval for display; None (not an error) if the engine fails."""
    try:
        return run_hint_engine(lambda eng: eng.evaluate(fen, time_limit=LIVE_EVAL_TIME))
    except Exception:
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:   # every game gets a games/<id>.pgn, old ones included
        write_missing_game_files(db)
    yield
    _game_engine.close()
    _hint_engine.close()
    _maia_engine.close()


app = FastAPI(lifespan=lifespan)

app.include_router(learn_router)

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
    engine: Literal["stockfish", "maia"] = "stockfish"

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
@app.get("/api/engines")
def list_engines():
    """Which opponent families this server can offer."""
    return {"maia": {"available": maia_available(), "levels": MAIA_LEVELS}}


@app.post("/api/game")
def start_game(req: StartGameRequest, db: Session = Depends(get_db)):
    if req.engine == "maia":
        if not maia_available():
            raise HTTPException(400, "Maia is not installed on this server")
        if req.engine_elo not in MAIA_LEVELS:
            raise HTTPException(400, f"Maia level must be one of {MAIA_LEVELS}")

    board = chess.Board()
    engine_first_move = None
    first_san = None

    # Ask the engine for its opening move *before* writing anything, so an
    # engine failure doesn't leave an orphaned game row behind.
    if req.player_color == "black":
        try:
            engine_first_move = run_game_engine(
                req.engine, req.engine_elo, lambda eng: eng.get_best_move(board, time_limit=ENGINE_MOVE_TIME)
            )
        except Exception as e:
            raise HTTPException(500, f"Engine error: {e}")
        if engine_first_move is None:
            raise HTTPException(500, "Engine returned no move for starting position")
        move = chess.Move.from_uci(engine_first_move)
        first_san = board.san(move)
        board.push(move)

    game = Game(player_color=req.player_color, engine_elo=req.engine_elo, engine=req.engine, result="*")
    db.add(game)
    db.flush()  # assigns game.id
    if engine_first_move:
        db.add(Move(game_id=game.id, ply=1, uci=engine_first_move, san=first_san))
    db.commit()
    write_game_file(game.id, db)

    return {
        "game_id": game.id,
        "fen": board.fen(),
        "player_color": req.player_color,
        "engine_elo": req.engine_elo,
        "engine": req.engine,
        "public_id": game.public_id,
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
        "engine": game.engine or "stockfish",
        "public_id": game.public_id,
        "analyzed": bool(game.analyzed),
        "assisted": bool(game.assisted),
        "accuracy": {
            "white": accuracy_summary(m.classification for m in moves if m.ply % 2 == 1),
            "black": accuracy_summary(m.classification for m in moves if m.ply % 2 == 0),
        } if game.analyzed else None,
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
    player_move = Move(game_id=game_id, ply=next_ply, uci=req.uci, san=san)

    if board.is_game_over():
        db.add(player_move)
        db.flush()
        ended = _check_and_end_game(game, board, game_id, db)
        write_game_file(game_id, db)
        return {"fen": board.fen(), "engine_move": None, "eval_cp": None, "engine_eval_cp": None, **ended}

    # Pick the engine's reply before persisting anything: if the engine fails,
    # nothing is saved and the client can simply retry the same move.
    fen_after_player = board.fen()
    try:
        engine_uci = run_game_engine(
            # Full board (with move history), not just the FEN: Maia's network reads
            # recent moves, and both engines can then see repetitions.
            game.engine or "stockfish", game.engine_elo, lambda eng: eng.get_best_move(board, time_limit=ENGINE_MOVE_TIME)
        )
    except Exception as e:
        raise HTTPException(500, f"Engine error: {e}")
    if engine_uci is None:
        raise HTTPException(500, "Engine returned no move")
    engine_move = chess.Move.from_uci(engine_uci)
    engine_san = board.san(engine_move)

    # Evals come from the full-strength engine so they're consistent with each
    # other: eval_cp = after the player's move, engine_eval_cp = after the reply.
    eval_cp = _live_eval(fen_after_player)
    board.push(engine_move)

    db.add(player_move)
    db.add(Move(game_id=game_id, ply=next_ply + 1, uci=engine_uci, san=engine_san))
    db.flush()
    ended = _check_and_end_game(game, board, game_id, db)
    if not ended:
        db.commit()
    write_game_file(game_id, db)
    engine_eval_cp = _live_eval(board.fen())

    return {
        "fen": board.fen(),
        "engine_move": engine_uci,
        "eval_cp": eval_cp,
        "engine_eval_cp": engine_eval_cp,
        "game_over": bool(ended),
        "result": ended["result"] if ended else None,
        "termination": ended["termination"] if ended else None,
    }


@app.delete("/api/game/{game_id}")
def delete_game(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    public_id = game.public_id
    db.query(Move).filter(Move.game_id == game_id).delete()
    db.delete(game)
    db.commit()
    delete_game_file(public_id)
    return {"status": "deleted"}


@app.post("/api/game/{game_id}/analyze")
def analyze(game_id: int, db: Session = Depends(get_db)):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.result == "*":
        raise HTTPException(400, "Game is still in progress")
    # One analysis at a time: Play auto-analyzes at game end and opening Review asks again,
    # often in the same second. The second request waits here, then finds it done.
    with _analysis_lock:
        db.refresh(game)
        if game.analyzed:
            return {"status": "already_analyzed", "game_id": game_id}
        try:
            analyze_game(game_id, db, run_engine=run_hint_engine)
        except Exception as e:
            raise HTTPException(500, f"Analysis failed: {e}")
    write_game_file(game_id, db)
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
    # Player's own move classifications per analyzed game, in one query.
    analyzed_ids = [g.id for g, _ in rows_raw if g.analyzed]
    player_classes: dict[int, list[str | None]] = {gid: [] for gid in analyzed_ids}
    color_by_id = {g.id: g.player_color for g, _ in rows_raw}
    if analyzed_ids:
        for gid, ply, classification in (
            db.query(Move.game_id, Move.ply, Move.classification)
            .filter(Move.game_id.in_(analyzed_ids))
            .all()
        ):
            if (ply % 2 == 1) == (color_by_id[gid] == "white"):
                player_classes[gid].append(classification)

    rows = []
    for g, move_count in rows_raw:
        summary = accuracy_summary(player_classes[g.id]) if g.id in player_classes else None
        rows.append({
            "game_id": g.id,
            "result": g.result,
            "player_color": g.player_color,
            "engine_elo": g.engine_elo,
            "engine": g.engine or "stockfish",
            "public_id": g.public_id,
            "played_at": g.played_at.isoformat() + "Z" if g.played_at else None,
            "analyzed": bool(g.analyzed),
            "assisted": bool(g.assisted),
            "move_count": move_count,
            "accuracy": summary["pct"] if summary else None,
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

    # Accuracy: weighted score over the player's own moves (analyzed games only);
    # same definition the Review page shows per game.
    rows = (
        db.query(Move.ply, Move.classification, Game.player_color)
        .join(Game, Game.id == Move.game_id)
        .filter(Game.analyzed == 1)
        .all()
    )
    summary = accuracy_summary(
        classification for ply, classification, player_color in rows
        if (ply % 2 == 1) == (player_color == "white")
    )

    return {
        "total": total,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "accuracy": summary["pct"] if summary else None,
        "move_counts": summary["counts"] if summary else {},
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
    fen = board.fen()
    uci = run_hint_engine(lambda eng: eng.get_best_move(fen, time_limit=HINT_TIME))
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
    # Stockfish can segfault on impossible positions (missing king, pawns on the
    # back rank, side not to move in check), so reject them up front.
    if not board.is_valid():
        raise HTTPException(400, "Illegal position")
    if board.is_game_over():
        raise HTTPException(400, "Position is terminal")
    fen = board.fen()
    uci = run_hint_engine(lambda eng: eng.get_best_move(fen, time_limit=HINT_TIME))
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
    game.assisted = 1
    db.commit()
    write_game_file(game_id, db)
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
    write_game_file(game_id, db)
    return {"result": game.result}
