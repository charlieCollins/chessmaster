# tests/test_game_files.py
"""Every game gets a short public ID and a games/<id>.pgn file kept in sync."""
import os
os.environ["DATABASE_URL"] = "sqlite://"

import pathlib
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend import db as dbmod
from backend import game_files
from backend.db import Base, Game, Move
from backend.main import app, get_db

test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(test_engine)
client = TestClient(app, raise_server_exceptions=False)

ID_RE = re.compile(r"^[a-hjkmnp-z2-9]{6}$")   # no 0/1/i/l/o — easy to read and type


def override_get_db():
    with Session(test_engine) as session:
        yield session


@pytest.fixture(autouse=True)
def apply_db_override():
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if previous is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous


def _start(**body):
    return client.post("/api/game", json={"player_color": "white", "engine_elo": 1500, **body}).json()


def _file(public_id: str) -> pathlib.Path:
    return pathlib.Path(game_files.GAMES_DIR) / f"{public_id}.pgn"


def test_new_game_gets_short_public_id():
    data = _start()
    assert ID_RE.match(data["public_id"])
    assert client.get(f"/api/game/{data['game_id']}").json()["public_id"] == data["public_id"]


def test_public_ids_are_unique():
    assert len({_start()["public_id"] for _ in range(20)}) == 20


def test_games_list_includes_public_id():
    data = _start()
    client.post(f"/api/game/{data['game_id']}/resign")
    row = next(r for r in client.get("/api/games").json() if r["game_id"] == data["game_id"])
    assert row["public_id"] == data["public_id"]


def test_game_file_written_on_start_and_after_each_move():
    data = _start()
    pgn = _file(data["public_id"]).read_text()
    assert f'[GameId "{data["public_id"]}"]' in pgn
    assert '[Result "*"]' in pgn
    client.post(f"/api/game/{data['game_id']}/move", json={"uci": "e2e4"})
    assert "1. e4 " in _file(data["public_id"]).read_text()


def test_game_file_records_result_and_termination():
    data = _start()
    client.post(f"/api/game/{data['game_id']}/move", json={"uci": "e2e4"})
    client.post(f"/api/game/{data['game_id']}/resign")
    pgn = _file(data["public_id"]).read_text()
    assert '[Result "0-1"]' in pgn
    assert '[Termination "White resigned"]' in pgn


def test_takeback_rewrites_game_file():
    data = _start()
    gid = data["game_id"]
    client.post(f"/api/game/{gid}/move", json={"uci": "e2e4"})
    client.post(f"/api/game/{gid}/move", json={"uci": "g1f3"})
    client.post(f"/api/game/{gid}/takeback")
    pgn = _file(data["public_id"]).read_text()
    assert "1. e4 " in pgn and "2. Nf3" not in pgn


def test_analysis_annotates_game_file():
    data = _start()
    gid = data["game_id"]
    client.post(f"/api/game/{gid}/move", json={"uci": "e2e4"})
    client.post(f"/api/game/{gid}/resign")
    client.post(f"/api/game/{gid}/analyze")
    pgn = _file(data["public_id"]).read_text()
    assert "[%eval " in pgn
    assert '[WhiteAccuracy "' in pgn


def test_annotation_names_the_better_move():
    with Session(test_engine) as db:
        game = Game(player_color="white", engine_elo=1500, result="1-0", analyzed=1)
        db.add(game); db.flush()
        db.add(Move(game_id=game.id, ply=1, uci="f2f3", san="f3", classification="mistake",
                    eval_cp=-40.0, best_uci="e2e4"))
        db.commit()
        pgn = game_files.annotated_pgn(game.id, db)
    assert "Mistake. Best was e4." in pgn
    assert "[%eval -0.40]" in pgn


def test_delete_removes_game_file():
    data = _start()
    assert _file(data["public_id"]).exists()
    client.delete(f"/api/game/{data['game_id']}")
    assert not _file(data["public_id"]).exists()


def test_init_db_backfills_public_ids_for_old_games(tmp_path):
    old = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with old.begin() as conn:   # schema from before public_id existed
        conn.execute(text("CREATE TABLE games (id INTEGER PRIMARY KEY, pgn TEXT, result TEXT, "
                          "player_color TEXT, engine_elo INTEGER, played_at DATETIME, source TEXT, analyzed INTEGER)"))
        conn.execute(text("INSERT INTO games (result, player_color, engine_elo) VALUES ('1-0','white',1000), ('0-1','white',1000)"))
    dbmod.init_db(old)
    with old.connect() as conn:
        ids = [r[0] for r in conn.execute(text("SELECT public_id FROM games"))]
    assert len(ids) == 2 and len(set(ids)) == 2
    assert all(ID_RE.match(i) for i in ids)


def test_startup_writes_missing_files_for_existing_games():
    with Session(test_engine) as db:
        game = Game(player_color="black", engine_elo=1200, result="1-0")
        db.add(game); db.flush()
        db.add(Move(game_id=game.id, ply=1, uci="d2d4", san="d4"))
        db.commit()
        pid = game.public_id
        assert not _file(pid).exists()
        written = game_files.write_missing_game_files(db)
    assert written >= 1
    assert "1. d4" in _file(pid).read_text()
