# tests/test_puzzles.py
# Lichess puzzle dump (.csv.zst) -> SQLite with a theme index.
import sqlite3

import zstandard

from corpus_tools.puzzles import build_puzzle_db, puzzles_for_theme

CSV = """PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate
00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1819,77,95,10446,crushing hangingPiece long middlegame,https://lichess.org/game/787zsVup/black#48,,
0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,1433,75,96,37700,advantage endgame short,https://lichess.org/game/F8M8OS71#53,,
0000H,r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15,d1h5 d5g2,1032,78,100,92,mate mateIn1 middlegame oneMove,https://lichess.org/game/EwHRkfas#29,French_Defense French_Defense_Tarrasch_Variation,
0009B,r2qr1k1/b1p2ppp/pp4n1/P1P1p3/4P1n1/B2P2Pb/3NBP1P/RN1QR1K1 b - - 1 16,b6c5 e2g4 h3g4 d1g4,1112,74,87,569,advantage middlegame short fork,https://lichess.org/game/4MWQCxQ6/black#31,Kings_Pawn_Game,
"""


def make_dump(tmp_path):
    path = tmp_path / "p.csv.zst"
    path.write_bytes(zstandard.ZstdCompressor().compress(CSV.encode()))
    return path


def test_build_counts_rows_and_indexes_themes(tmp_path):
    db = tmp_path / "puzzles.sqlite"
    assert build_puzzle_db(make_dump(tmp_path), db) == 4
    con = sqlite3.connect(db)
    assert con.execute("select count(*) from puzzles").fetchone()[0] == 4
    counts = dict(con.execute("select theme, count from themes"))
    assert counts["middlegame"] == 3 and counts["fork"] == 1 and counts["mateIn1"] == 1
    row = con.execute("select fen, moves, rating, popularity, plays, openings from puzzles where id='0000H'").fetchone()
    assert row == ("r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15", "d1h5 d5g2", 1032, 100, 92,
                   "French_Defense French_Defense_Tarrasch_Variation")


def test_rebuild_replaces_the_database(tmp_path):
    db = tmp_path / "puzzles.sqlite"
    build_puzzle_db(make_dump(tmp_path), db)
    assert build_puzzle_db(make_dump(tmp_path), db) == 4
    assert sqlite3.connect(db).execute("select count(*) from puzzles").fetchone()[0] == 4


def test_query_by_theme_and_rating_band(tmp_path):
    db = tmp_path / "puzzles.sqlite"
    build_puzzle_db(make_dump(tmp_path), db)
    ids = [p["id"] for p in puzzles_for_theme(db, "middlegame", 1000, 1500)]
    assert sorted(ids) == ["0000H", "0009B"]
    # quality floor: popularity and number of plays
    assert [p["id"] for p in puzzles_for_theme(db, "middlegame", 1000, 1500, min_plays=100)] == ["0009B"]
    p = puzzles_for_theme(db, "fork", 0, 3000)[0]
    assert p["moves"] == ["b6c5", "e2g4", "h3g4", "d1g4"] and "fork" in p["themes"]


def test_readme_documents_schema_and_theme_counts(tmp_path):
    from corpus_tools.puzzles import write_puzzle_readme
    db = tmp_path / "puzzles.sqlite"
    build_puzzle_db(make_dump(tmp_path), db)
    out = tmp_path / "README.md"
    write_puzzle_readme(db, out)
    md = out.read_text()
    assert "4 puzzles" in md and "Moves[0] is the opponent's move" in md
    assert "| `middlegame` | 3 |" in md and "| `fork` | 1 |" in md


SPREAD = ("PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate\n"
          + "".join(f"r{r},8/8/8/8/8/8/8/K6k w - - 0 1,a1a2 h1h2,{r},75,95,5000,{t},u,,\n"
                    for r, t in [(1100, "fork"), (1200, "fork"), (1300, "fork pin"), (1400, "pin"),
                                 (1450, "fork"), (1600, "fork"), (1700, "fork")])
          + "low,8/8/8/8/8/8/8/K6k w - - 0 1,a1a2 h1h2,1300,75,95,50,fork,u,,\n")


def spread_db(tmp_path):
    dump = tmp_path / "s.csv.zst"
    dump.write_bytes(zstandard.ZstdCompressor().compress(SPREAD.encode()))
    db = tmp_path / "s.sqlite"
    build_puzzle_db(dump, db)
    return db


def test_select_within_band(tmp_path):
    from corpus_tools.puzzles import select_puzzles
    ids = {p["id"] for p in select_puzzles(spread_db(tmp_path), ["fork"], 1300, 3, set())}
    assert ids == {"r1200", "r1300", "r1450"}          # 1150–1450, quality floor drops "low"


def test_select_widens_when_short(tmp_path):
    from corpus_tools.puzzles import select_puzzles
    ids = {p["id"] for p in select_puzzles(spread_db(tmp_path), ["fork"], 1300, 5, set())}
    assert ids == {"r1100", "r1200", "r1300", "r1450", "r1600"}   # ±300; 1700 still out


def test_select_excludes_attempted(tmp_path):
    from corpus_tools.puzzles import select_puzzles
    ids = {p["id"] for p in select_puzzles(spread_db(tmp_path), ["fork"], 1300, 3, {"r1300"})}
    assert "r1300" not in ids and ids <= {"r1100", "r1200", "r1450", "r1600"} and len(ids) == 3


def test_select_dedupes_multi_theme_matches(tmp_path):
    from corpus_tools.puzzles import select_puzzles
    ps = select_puzzles(spread_db(tmp_path), ["fork", "pin"], 1350, 10, set())
    ids = [p["id"] for p in ps]
    assert len(ids) == len(set(ids)) and "r1300" in ids and "r1400" in ids


def test_get_puzzle(tmp_path):
    from corpus_tools.puzzles import get_puzzle
    db = spread_db(tmp_path)
    p = get_puzzle(db, "r1300")
    assert p["rating"] == 1300 and p["moves"] == ["a1a2", "h1h2"] and p["themes"] == ["fork", "pin"]
    assert get_puzzle(db, "nope") is None
