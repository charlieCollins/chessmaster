# Diagram transcription aids (one-off, used for Capablanca)

Scripts used to turn scanned book diagrams into FENs for `corpus/books/<slug>/diagrams.tsv`.
They were run once from a scratch directory: paths are hard-coded and need adapting for the
next book. They use the *system* Python with numpy, scipy and Pillow (not the project venv).

Pipeline (see `docs/superpowers/specs/2026-11-23-chess-corpus-design.md`):

1. `board.py` — find the board inside the frame, cut 64 square crops.
2. `extract.py` — crops for every diagram → feature matrix.
3. `cluster.py` — k-means contact sheet (only used to spot empty-square clusters).
4. `align.py` — match game diagrams to positions from the replayed game score → labelled squares.
5. `knn.py` / `predict1.py` — 1-NN square classifier trained on those labels (99.2% leave-one-
   diagram-out on Capablanca) → first-guess FEN for every lesson diagram.
6. `overlay.py` — sheets of 4 scans with the guessed piece letters drawn on, for review by eye.
7. `verify1.py` — apply hand corrections and replay the book's main line from each diagram.
