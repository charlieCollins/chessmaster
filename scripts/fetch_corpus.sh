#!/usr/bin/env bash
# Rebuild corpus/raw/ (see corpus/SOURCES.md). Skips files that already exist,
# so it's safe to re-run. Only downloads data; never executes anything fetched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/corpus/raw"
UA="Mozilla/5.0 (personal chess-study download)"
GUT="https://gutenberg.pglaf.org"   # official mirror; www.gutenberg.org 503s scripted downloads

fetch() {  # fetch <url> <dest>
    local url="$1" dest="$2"
    if [ -s "$dest" ]; then echo "have  ${dest#$ROOT/}"; return; fi
    mkdir -p "$(dirname "$dest")"
    echo "fetch ${dest#$ROOT/}"
    curl -sSL --fail --retry 2 --max-time 900 -A "$UA" -o "$dest.part" "$url"
    mv "$dest.part" "$dest"
}

# Lichess (CC0)
fetch https://database.lichess.org/lichess_db_puzzle.csv.zst "$RAW/lichess/lichess_db_puzzle.csv.zst"
for f in a b c d e; do
    fetch "https://raw.githubusercontent.com/lichess-org/chess-openings/master/$f.tsv" "$RAW/lichess/openings/$f.tsv"
done
fetch https://raw.githubusercontent.com/lichess-org/chess-openings/master/README.md "$RAW/lichess/openings/README.md"

# Project Gutenberg books (public domain in the USA)
fetch "$GUT/3/3/8/7/33870/33870.txt"     "$RAW/gutenberg/33870/33870.txt"
fetch "$GUT/3/3/8/7/33870/33870-h.zip"   "$RAW/gutenberg/33870/33870-h.zip"
fetch "$GUT/5/6/1/5614/5614-0.txt"       "$RAW/gutenberg/5614/5614-0.txt"
fetch "$GUT/5/6/1/5614/5614-h.zip"       "$RAW/gutenberg/5614/5614-h.zip"
fetch "$GUT/4/9/1/4913/4913.txt"         "$RAW/gutenberg/4913/4913.txt"
fetch "$GUT/1/6/3/7/16377/16377-0.txt"   "$RAW/gutenberg/16377/16377-0.txt"
fetch "$GUT/1/6/3/7/16377/16377-h.zip"   "$RAW/gutenberg/16377/16377-h.zip"
fetch "$GUT/7/8/8/0/78804/78804-0.txt"   "$RAW/gutenberg/78804/78804-0.txt"
fetch "$GUT/GUTINDEX.ALL"                "$RAW/gutenberg/GUTINDEX.ALL"

# Research papers (reference only; some hosts block scripted downloads — see SOURCES.md)
fetch https://englelab.gatech.edu/articles/2019/Burgoyne_et_al_2019_AJP.pdf "$RAW/papers/burgoyne2019-domain-experience.pdf"

echo "corpus/raw: $(du -sh "$RAW" | cut -f1)"
