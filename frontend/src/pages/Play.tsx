// frontend/src/pages/Play.tsx
import { useState, useRef, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
import { API, HINT_DISPLAY_MS, REPLY_DISPLAY_MS, EVAL_DISPLAY_MS, ENGINE_MOVE_MIN_MS } from "../config";
import { useBoardTheme } from "../themes";
import { type Quality, QUALITIES, classifyMove, qualityTint } from "../classify";
import { type EngineKind, opponentLabel, encodeOpponent, decodeOpponent } from "../opponents";
import { formatEval, describeEval, describeMoveDelta } from "../evalText";
import { type AccuracySummary, describeResult, grade, estimateElo } from "../ratings";

/** Returns every square on the path from→to (inclusive). For knights/pawns/kings
 *  there are no intermediates, so just [from, to] is returned. */
function squaresOnPath(from: string, to: string): string[] {
  const fc = from.charCodeAt(0) - 97, fr = parseInt(from[1]) - 1;
  const tc = to.charCodeAt(0)   - 97, tr = parseInt(to[1])   - 1;
  const dc = tc - fc, dr = tr - fr;
  // Only straight/diagonal moves have intermediate squares
  if (dc !== 0 && dr !== 0 && Math.abs(dc) !== Math.abs(dr)) return [from, to];
  const sf = dc === 0 ? 0 : dc / Math.abs(dc);
  const sr = dr === 0 ? 0 : dr / Math.abs(dr);
  const steps = Math.max(Math.abs(dc), Math.abs(dr));
  return Array.from({ length: steps + 1 }, (_, i) =>
    `${String.fromCharCode(97 + fc + i * sf)}${fr + i * sr + 1}`
  );
}

function qualitySquares(from: string, to: string, quality: Quality) {
  const result: Record<string, React.CSSProperties> = {};
  for (const sq of squaresOnPath(from, to)) {
    if (sq === from || sq === to) {
      result[sq] = { backgroundColor: qualityTint(quality, 65), boxShadow: `inset 0 0 0 3px ${qualityTint(quality, 90)}` };
    } else {
      result[sq] = { backgroundColor: qualityTint(quality, 28) };
    }
  }
  return result;
}

interface PlayProps {
  onGameEnd: (gameId: number) => void;
  onGameActive?: (active: boolean) => void;
}

interface GameState {
  gameId: number;
  fen: string;
  playerColor: "white" | "black";
  engine: EngineKind;
  engineElo: number;
  gameOver: boolean;
  result: string | null;
  termination: string | null;
  /** Full-strength eval (White POV) of the position currently on the board. */
  evalCp: number | null;
  /** White-POV evals immediately before/after the player's last move. */
  lastMoveEvals: { before: number; after: number } | null;
  assisted: boolean;
}

// Skill Level options: values must match _SKILL_BY_ELO keys in engine.py
// UCI ELO options: Stockfish supports 1320–3190; every value here is directly honoured
const ELO_OPTIONS: Array<{ value: number; label: string; mode: "skill" | "uci"; skill?: number }> = [
  { value: 1000, label: "~1000", mode: "skill", skill: 0 },
  { value: 1100, label: "~1100", mode: "skill", skill: 3 },
  { value: 1200, label: "~1200", mode: "skill", skill: 6 },
  { value: 1300, label: "~1300", mode: "skill", skill: 9 },
  { value: 1320, label:  "1320", mode: "uci" },
  { value: 1500, label:  "1500", mode: "uci" },
  { value: 1700, label:  "1700", mode: "uci" },
  { value: 1900, label:  "1900", mode: "uci" },
  { value: 2100, label:  "2100", mode: "uci" },
  { value: 2300, label:  "2300", mode: "uci" },
  { value: 2500, label:  "2500", mode: "uci" },
  { value: 2700, label:  "2700", mode: "uci" },
  { value: 2900, label:  "2900", mode: "uci" },
];

function engineModeTag(elo: number): string {
  const opt = ELO_OPTIONS.find(o => o.value === elo);
  if (opt?.mode === "skill") return `Skill ${opt.skill}/20`;
  return "UCI ELO";
}

// Responsive board size: reserves space for left (160px) + right (175px) sidebars + gaps + app padding
const MIN_BOARD = 280;
function computeBoardSize(max: number): number {
  return Math.max(MIN_BOARD, Math.min(max, window.innerWidth - 48 - 160 - 175 - 40));
}

function useBoardSize(max: number = 540): number {
  const [size, setSize] = useState(() => computeBoardSize(max));
  useEffect(() => {
    const handler = () => setSize(computeBoardSize(max));
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [max]);
  return size;
}

export default function Play({ onGameEnd, onGameActive }: PlayProps) {
  const boardTheme = useBoardTheme();
  const boardSize = useBoardSize(540);
  const [state, setState]             = useState<GameState | null>(null);
  const [loading, setLoading]         = useState(false);
  const [hintLoading, setHintLoading] = useState(false);  // FIX 3: separate hint loading flag
  // FIX M1: separate loading states for prevBest and reply
  const [prevBestLoading, setPrevBestLoading] = useState(false);
  const [replyLoading, setReplyLoading]       = useState(false);
  const [autoEval, setAutoEval]       = useState(true);
  const autoEvalRef                   = useRef(true);
  const [colorChoice, setColorChoice] = useState<"white" | "black">("white");
  // Opponent picker value, e.g. "maia:1300" / "stockfish:1000"
  const [opponentChoice, setOpponentChoice] = useState(encodeOpponent("stockfish", 1000));
  const [maiaLevels, setMaiaLevels] = useState<number[]>([]);   // empty = Maia not available
  const opponentTouched = useRef(false);

  // Offer Maia (human-like) opponents when the server has them; default to Maia 1300.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/engines`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.maia?.available) return;
        setMaiaLevels(data.maia.levels);
        if (!opponentTouched.current && data.maia.levels.includes(1300)) {
          setOpponentChoice(encodeOpponent("maia", 1300));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  // FIX H2: selectedSquare typed as Square | null
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [hintMove, setHintMove] = useState<{ from_sq: string; to_sq: string } | null>(null);
  const [hintError, setHintError] = useState(false);
  const [replyFen, setReplyFen] = useState<string | null>(null);
  const [replyMove, setReplyMove] = useState<{ from_sq: string; to_sq: string } | null>(null);
  const [replyError, setReplyError] = useState(false);
  const [prevFen, setPrevFen] = useState<string | null>(null);
  const [lastPlayerUci, setLastPlayerUci] = useState<string | null>(null);
  const [lastMoveHighlight, setLastMoveHighlight] = useState<{ from: string; to: string; quality: Quality } | null>(null);
  const [prevBestError, setPrevBestError] = useState(false);
  const [showBestLastHighlight, setShowBestLastHighlight] = useState<{ from: string; to: string } | null>(null);
  const [showBestLastLoading, setShowBestLastLoading] = useState(false);
  const [showBestLastError, setShowBestLastError] = useState(false);
  const [engineMoveHighlight, setEngineMoveHighlight] = useState<{ from: string; to: string; quality: Quality } | null>(null);
  const [takebackLoading, setTakebackLoading] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);   // FIX 4: move error state
  const [startError, setStartError] = useState<string | null>(null); // FIX 6: start error state
  // FIX L1: removed dead `san` field from pendingPromotion type
  const [pendingPromotion, setPendingPromotion] = useState<{from: string; to: string} | null>(null);
  // Post-game ratings: analysis runs automatically when the game ends
  const [postGame, setPostGame] = useState<{
    status: "analyzing" | "done" | "error";
    you: AccuracySummary | null;
    opp: AccuracySummary | null;
  } | null>(null);

  // FIX 2: timer refs to prevent leaks on unmount
  const hintTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evalTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBestLastTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineMoveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep autoEvalRef in sync so makeMove always reads the current value
  // even when called from stale useCallback closures (onDrop, onSquareClick)
  useEffect(() => { autoEvalRef.current = autoEval; }, [autoEval]);

  // FIX 2: cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
      if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
      if (showBestLastTimerRef.current) clearTimeout(showBestLastTimerRef.current);
      if (engineMoveTimerRef.current) clearTimeout(engineMoveTimerRef.current);
      if (engineTimerRef.current) clearTimeout(engineTimerRef.current);
    };
  }, []);

  // FIX UX-H4: Escape key closes promotion dialog
  useEffect(() => {
    if (!pendingPromotion) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingPromotion(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pendingPromotion]);

  // FIX 4: warn on browser tab close / refresh when a game is in progress
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (state && !state.gameOver) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state]);

  const gameActive = state !== null && !state.gameOver;

  // When a game ends, analyze it right away so the result panel can show ratings.
  // (The analyze endpoint is idempotent, so Review won't redo or fail on it.)
  const finishedGameId = state?.gameOver ? state.gameId : null;
  const finishedColor = state?.playerColor ?? "white";
  useEffect(() => {
    if (finishedGameId === null) { setPostGame(null); return; }
    let cancelled = false;
    setPostGame({ status: "analyzing", you: null, opp: null });
    (async () => {
      try {
        const res = await fetch(`${API}/api/game/${finishedGameId}/analyze`, { method: "POST" });
        if (!res.ok) throw new Error();
        const game = await (await fetch(`${API}/api/game/${finishedGameId}`)).json();
        const acc = game.accuracy ?? {};
        const oppColor = finishedColor === "white" ? "black" : "white";
        if (!cancelled) setPostGame({ status: "done", you: acc[finishedColor] ?? null, opp: acc[oppColor] ?? null });
      } catch {
        if (!cancelled) setPostGame({ status: "error", you: null, opp: null });
      }
    })();
    return () => { cancelled = true; };
  }, [finishedGameId, finishedColor]);
  useEffect(() => {
    onGameActive?.(gameActive);
  }, [gameActive, onGameActive]);

  // FIX 6: error handling in startGame
  async function startGame() {
    const chosen = decodeOpponent(opponentChoice);
    setLoading(true);
    setStartError(null);
    try {
      const res = await fetch(`${API}/api/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_color: colorChoice, engine: chosen.engine, engine_elo: chosen.elo }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setState({
        gameId: data.game_id,
        fen: data.fen,
        playerColor: colorChoice,
        engine: chosen.engine,
        engineElo: chosen.elo,
        gameOver: false,
        result: null,
        termination: null,
        evalCp: null,
        lastMoveEvals: null,
        assisted: false,
      });
    } catch {
      setStartError("Could not connect to server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  /** True if from→to is a legal pawn promotion in the current position. */
  function isLegalPromotion(from: string, to: string): boolean {
    if (!state) return false;
    return new Chess(state.fen)
      .moves({ square: from as Square, verbose: true })
      .some((m) => m.to === to && m.promotion);
  }

  function onDrop({ sourceSquare, targetSquare }: {
    piece: { isSparePiece: boolean; position: string; pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean {
    // Board input is blocked while the engine is replying
    if (!state || state.gameOver || loading || !targetSquare) return false;
    if (isLegalPromotion(sourceSquare, targetSquare)) {
      setPendingPromotion({ from: sourceSquare, to: targetSquare });
      return true;
    }
    makeMove(sourceSquare + targetSquare);
    return true;
  }

  function onSquareClick({ square, piece }: { square: string; piece?: { pieceType: string } | null }) {
    if (!state || state.gameOver || loading) return;
    if (selectedSquare) {
      setSelectedSquare(null);
      if (isLegalPromotion(selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
      makeMove(selectedSquare + square);
    } else if (piece) {
      const isPlayerPiece =
        (state.playerColor === "white" && piece.pieceType.startsWith("w")) ||
        (state.playerColor === "black" && piece.pieceType.startsWith("b"));
      if (isPlayerPiece) setSelectedSquare(square as Square);
    }
  }

  // Disabled while the engine is replying: the server-side position would be
  // ahead of the board, so the hint would be for a position not yet shown.
  async function requestHint() {
    if (!state || hintLoading || loading || state.gameOver) return;
    setHintError(false);
    setHintLoading(true);
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/hint`);
      if (res.ok) {
        const data = await res.json();
        setHintMove(data);
        // FIX 2: store timer in ref
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHintMove(null), HINT_DISPLAY_MS);
        if (!state.gameOver) setState((s) => s ? { ...s, assisted: true } : s);
      } else {
        setHintError(true);
      }
    } catch {
      setHintError(true);
    } finally {
      setHintLoading(false);
    }
  }

  // FIX M1: use setPrevBestLoading instead of setLoading
  async function requestPrevBest() {
    if (!prevFen || prevBestLoading) return;
    setPrevBestError(false);
    setPrevBestLoading(true);
    try {
      const res = await fetch(`${API}/api/engine/best`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: prevFen }),
      });
      if (res.ok) {
        const data = await res.json();
        // FIX L7: include promotion in engineUci for full comparison
        const engineUci = data.from_sq + data.to_sq + (data.promotion ?? "");
        const evals = state?.lastMoveEvals ?? null;
        const quality = classifyMove(
          lastPlayerUci!, engineUci, evals?.before ?? null, evals?.after ?? null,
          state?.playerColor === "white",
        );
        if (quality === null) { setPrevBestError(true); return; }
        setLastMoveHighlight({ from: lastPlayerUci!.slice(0, 2), to: lastPlayerUci!.slice(2, 4), quality });
        if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
        evalTimerRef.current = setTimeout(() => setLastMoveHighlight(null), EVAL_DISPLAY_MS);
      } else {
        setPrevBestError(true);
      }
    } catch {
      setPrevBestError(true);
    } finally {
      setPrevBestLoading(false);
    }
  }

  async function requestShowBestLast() {
    if (!prevFen || showBestLastLoading) return;
    setShowBestLastError(false);
    setShowBestLastLoading(true);
    try {
      const res = await fetch(`${API}/api/engine/best`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: prevFen }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowBestLastHighlight({ from: data.from_sq, to: data.to_sq });
        if (showBestLastTimerRef.current) clearTimeout(showBestLastTimerRef.current);
        showBestLastTimerRef.current = setTimeout(() => setShowBestLastHighlight(null), EVAL_DISPLAY_MS);
      } else {
        setShowBestLastError(true);
      }
    } catch {
      setShowBestLastError(true);
    } finally {
      setShowBestLastLoading(false);
    }
  }


  // FIX M1: use setReplyLoading instead of setLoading
  async function requestReply() {
    if (!replyFen || replyLoading) return;
    setReplyError(false);
    setReplyLoading(true);
    try {
      const res = await fetch(`${API}/api/engine/best`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: replyFen }),
      });
      if (res.ok) {
        setReplyMove(await res.json());
        // FIX 2: store timer in ref
        if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
        replyTimerRef.current = setTimeout(() => setReplyMove(null), REPLY_DISPLAY_MS);
      } else {
        setReplyError(true);
      }
    } catch {
      setReplyError(true);
    } finally {
      setReplyLoading(false);
    }
  }

  async function makeMove(uci: string) {
    if (!state) return;
    setHintMove(null);
    setReplyMove(null);
    setReplyError(false);
    setLastMoveHighlight(null);
    setPrevBestError(false);
    setShowBestLastHighlight(null);
    setShowBestLastError(false);
    setEngineMoveHighlight(null);
    setMoveError(null); // FIX 4: clear previous move error

    // FIX 4: capture FEN before the move for rollback on API error
    const fenBeforeMove = state.fen;
    const chess = new Chess(state.fen);
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return;
    }
    const fenAfterPlayerMove = chess.fen();
    setPrevFen(fenBeforeMove);
    // FIX L7: keep full UCI including promotion char
    setLastPlayerUci(uci);
    setReplyFen(fenAfterPlayerMove);
    setState((s) => s ? { ...s, fen: chess.fen() } : s);

    // Eval of the position on the board right before this move (from the
    // previous response's engine_eval_cp), so the delta is this move alone.
    const evalBeforeMove = state.evalCp;
    const playerIsWhite = state.playerColor === "white";
    setLoading(true);
    const moveStart = Date.now();
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uci }),
      });
      // FIX 4: rollback optimistic FEN on API error
      if (!res.ok) {
        setHintMove(null);
        setState(s => s ? { ...s, fen: fenBeforeMove } : s);
        setMoveError("Move failed — please try again.");
        return;
      }
      const data = await res.json();

      // eval_cp: after my move (before the reply); engine_eval_cp: after the reply,
      // i.e. the position the board will show. Both are full-strength, White POV.
      const evalAfterMove: number | null = data.eval_cp ?? null;
      const evalAfterReply: number | null = data.engine_eval_cp ?? null;
      const lastMoveEvals = evalBeforeMove !== null && evalAfterMove !== null
        ? { before: evalBeforeMove, after: evalAfterMove }
        : null;

      // Start both auto-eval fetches immediately (run while engine delay ticks)
      const autoPlayerPromise = (autoEvalRef.current && !data.game_over)
        ? fetch(`${API}/api/engine/best`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen: fenBeforeMove }),
          }).catch(() => null)
        : null;
      const autoEnginePromise = (autoEvalRef.current && !data.game_over && data.engine_move)
        ? fetch(`${API}/api/engine/best`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen: fenAfterPlayerMove }),
          }).catch(() => null)
        : null;

      // Show player move highlight before engine delay so it's visible during the pause
      if (autoPlayerPromise) {
        const res = await autoPlayerPromise;
        if (res?.ok) {
          const evalData = await res.json();
          const bestUci = evalData.from_sq + evalData.to_sq + (evalData.promotion ?? "");
          const quality = classifyMove(uci, bestUci, evalBeforeMove, evalAfterMove, playerIsWhite);
          if (quality !== null) {
            setLastMoveHighlight({ from: uci.slice(0, 2), to: uci.slice(2, 4), quality });
            if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
            evalTimerRef.current = setTimeout(() => setLastMoveHighlight(null), EVAL_DISPLAY_MS);
          }
        }
      }

      // Engine delay — player highlight is already visible during this pause
      if (data.engine_move) {
        const elapsed = Date.now() - moveStart;
        const remaining = Math.max(0, ENGINE_MOVE_MIN_MS - elapsed);
        if (remaining > 0) {
          await new Promise<void>((r) => {
            if (engineTimerRef.current) clearTimeout(engineTimerRef.current);
            engineTimerRef.current = setTimeout(r, remaining);
          });
        }
      }

      setMoveError(null); // FIX 4: clear error on success
      setState((s) =>
        s ? {
          ...s, fen: data.fen,
          evalCp: data.engine_move ? evalAfterReply : evalAfterMove,
          lastMoveEvals, gameOver: data.game_over, result: data.result ?? null, termination: data.termination ?? null,
        } : s
      );

      // Engine move highlight — shown after engine move appears on board
      if (autoEnginePromise) {
        const res = await autoEnginePromise;
        if (res?.ok && data.engine_move) {
          const evalData = await res.json();
          const bestUci = evalData.from_sq + evalData.to_sq + (evalData.promotion ?? "");
          const quality = classifyMove(data.engine_move, bestUci, evalAfterMove, evalAfterReply, !playerIsWhite);
          if (quality === null) return;
          setEngineMoveHighlight({ from: data.engine_move.slice(0, 2), to: data.engine_move.slice(2, 4), quality });
          if (engineMoveTimerRef.current) clearTimeout(engineMoveTimerRef.current);
          engineMoveTimerRef.current = setTimeout(() => setEngineMoveHighlight(null), EVAL_DISPLAY_MS);
        }
      }
    } catch {
      // FIX H1: network failure — rollback optimistic FEN
      setState(s => s ? { ...s, fen: fenBeforeMove } : s);
      setMoveError("Could not reach server — please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function resign() {
    if (!state || state.gameOver || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/resign`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setState(s => s ? { ...s, gameOver: true, result: data.result, termination: "resigned" } : s);
    } catch {
      setMoveError("Resign failed — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function abort() {
    if (!state || state.gameOver || loading) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/game/${state.gameId}`, { method: "DELETE" });
    } finally {
      setState(null);
      setHintMove(null); setReplyMove(null);
      setLastMoveHighlight(null); setEngineMoveHighlight(null);
      setSelectedSquare(null); setPendingPromotion(null);
      setLoading(false);
    }
  }

  async function takeback() {
    if (!state || state.gameOver || loading || takebackLoading || !prevFen) return;
    setTakebackLoading(true);
    setMoveError(null);
    try {
      const res = await fetch(`${API}/api/game/${state.gameId}/takeback`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setState(s => s ? { ...s, fen: data.fen, evalCp: null, lastMoveEvals: null, assisted: true } : s);
      setPrevFen(null);
      setLastPlayerUci(null);
      setReplyFen(null);
      setHintMove(null); setReplyMove(null);
      setLastMoveHighlight(null); setEngineMoveHighlight(null);
      setShowBestLastHighlight(null);
      setSelectedSquare(null);
    } catch {
      setMoveError("Take back failed — please try again.");
    } finally {
      setTakebackLoading(false);
    }
  }


  const colStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingTop: 4,
    flexShrink: 0,
    overflowY: "auto",
    maxHeight: `${boardSize}px`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-dim)",
    marginBottom: 2,
  };

  // ── Setup screen ─────────────────────────────────────────
  if (!state) {
    const cardStyle: React.CSSProperties = {
      padding: "16px 18px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    };
    return (
      <div style={{ maxWidth: 300, display: "flex", flexDirection: "column", gap: 12 }}>

        <div style={cardStyle}>
          <div style={labelStyle}>Play as</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["white", "black"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColorChoice(c)}
                style={{
                  flex: 1,
                  background: colorChoice === c ? "var(--gold)" : "var(--raised)",
                  borderColor: colorChoice === c ? "var(--gold)" : "var(--border-hi)",
                  color: colorChoice === c ? "#0e0f13" : "var(--text)",
                  fontWeight: colorChoice === c ? 600 : 400,
                }}
              >
                {c === "white" ? "♔ White" : "♚ Black"}
              </button>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Opponent</div>
          <select
            value={opponentChoice}
            onChange={(e) => { opponentTouched.current = true; setOpponentChoice(e.target.value); }}
            style={{
              width: "100%",
              background: "var(--raised)",
              border: "1px solid var(--border-hi)",
              color: "var(--text)",
              borderRadius: "var(--radius)",
              padding: "7px 10px",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {maiaLevels.length > 0 && (
              <optgroup label="Human-like (Maia)">
                {maiaLevels.map(lv => (
                  <option key={`maia-${lv}`} value={encodeOpponent("maia", lv)}>Maia {lv}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Stockfish · Skill Level (approximate)">
              {ELO_OPTIONS.filter(o => o.mode === "skill").map(o => (
                <option key={o.value} value={encodeOpponent("stockfish", o.value)}>Stockfish {o.label} — Skill {o.skill}/20</option>
              ))}
            </optgroup>
            <optgroup label="Stockfish · UCI ELO">
              {ELO_OPTIONS.filter(o => o.mode === "uci").map(o => (
                <option key={o.value} value={encodeOpponent("stockfish", o.value)}>Stockfish {o.label}</option>
              ))}
            </optgroup>
          </select>
          {(() => {
            const chosen = decodeOpponent(opponentChoice);
            const opt = ELO_OPTIONS.find(o => o.value === chosen.elo);
            return (
              <div style={{ ...labelStyle, marginBottom: 0, letterSpacing: "0.04em" }}>
                {chosen.engine === "maia"
                  ? "trained on human games · plays human-style mistakes"
                  : opt?.mode === "skill"
                  ? `Skill ${opt.skill}/20 · randomized, not calibrated`
                  : "Stockfish UCI_Elo · rating is approximate at fast move times"}
              </div>
            );
          })()}
        </div>

        {startError && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)" }}>
            {startError}
          </div>
        )}

        <button className="primary" onClick={startGame} disabled={loading} style={{ width: "100%", padding: "9px 0" }}>
          {loading ? "Starting…" : "Start Game"}
        </button>
      </div>
    );
  }

  // ── Active game ──────────────────────────────────────────
  // Player-POV values: positive = good for you, regardless of color
  const pov = state.playerColor === "white" ? 1 : -1;
  const evalPos = state.evalCp !== null ? pov * state.evalCp : null;
  const lastMoveText = state.lastMoveEvals
    ? describeMoveDelta(pov * state.lastMoveEvals.before, pov * state.lastMoveEvals.after)
    : null;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

      {/* ── Left: Game State ──────────────────────── */}
      <div style={{ ...colStyle, width: 160 }}>
        <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={labelStyle}>Playing as</div>
          <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-bright)", textTransform: "capitalize" }}>
            {state.playerColor}
          </div>
          <div style={{ ...labelStyle, marginTop: 10 }}>Opponent</div>
          <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-bright)" }}>
            {opponentLabel(state.engine, state.engineElo)}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>
            {state.engine === "maia" ? "human-like" : engineModeTag(state.engineElo)}
          </div>
          {state.assisted && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
              assisted
            </div>
          )}
        </div>

        {evalPos !== null && (
          <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            <div style={labelStyle}>Position</div>
            <div
              title="Engine evaluation from your side. +1.00 ≈ the value of one pawn — the advantage can come from material, activity, king safety, etc. M = forced mate in N moves."
              style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: evalPos >= 0 ? "var(--win)" : "var(--loss)", fontWeight: 500, cursor: "help" }}
            >
              {formatEval(evalPos)}
            </div>
            {(() => {
              const clamped = Math.max(-500, Math.min(500, evalPos));
              const whitePct = Math.round(50 + (clamped / 500) * 30);
              return (
                <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden", marginTop: 6 }}>
                  <div style={{ height: "100%", width: `${whitePct}%`, background: "var(--text-bright)", borderRadius: 4, transition: "width 0.3s ease" }} />
                </div>
              );
            })()}
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
              {describeEval(evalPos)}
            </div>
            {lastMoveText !== null && (() => {
              const tone = lastMoveText.startsWith("▲") ? "var(--good)" : lastMoveText.startsWith("▼") ? "var(--loss)" : "var(--text-dim)";
              return (
                <>
                  <div style={{ ...labelStyle, marginTop: 10 }}>Last move</div>
                  <span
                    title="How much the evaluation changed because of your move alone"
                    style={{ color: tone, fontSize: 11, fontFamily: "var(--font-mono)", cursor: "help" }}
                  >
                    {lastMoveText}
                  </span>
                </>
              );
            })()}
          </div>
        )}

        {state.gameOver && (
          <div style={{ padding: "12px 14px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            {(() => {
              const { headline, detail } = describeResult(state.result, state.termination, state.playerColor);
              const tone = headline === "You won" ? "var(--win)" : headline === "You lost" ? "var(--loss)" : "var(--draw)";
              return (
                <>
                  <div style={labelStyle}>Game over</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: tone, lineHeight: 1.1 }}>{headline}</div>
                  <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>{detail}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{state.result}</div>
                </>
              );
            })()}

            <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
              {postGame?.status === "analyzing" && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>Analyzing…</div>
              )}
              {postGame?.status === "error" && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--loss)" }}>Analysis unavailable</div>
              )}
              {postGame?.status === "done" && !postGame.you && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>No moves to rate</div>
              )}
              {postGame?.status === "done" && ([["You", postGame.you], ["Opponent", postGame.opp]] as const).map(([label, acc]) => {
                if (!acc) return null;
                const pct = Math.round(acc.pct);
                const { label: gradeLabel, color } = grade(pct);
                return (
                  <div key={label} style={{ marginBottom: 8 }}>
                    <div style={{ ...labelStyle, color: label === "You" ? "var(--gold)" : "var(--text-dim)" }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color, lineHeight: 1 }}>{pct}%</span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--gold)" }} title="Rough estimate from accuracy, not a rating">~{estimateElo(pct)}</span>
                    </div>
                    <div style={{ fontSize: 11, color, fontWeight: 600 }}>{gradeLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Center: Board ─────────────────────────── */}
      <div style={{ flexShrink: 0, position: "relative" }}>
        <Chessboard
          options={{
            position: state.fen,
            onPieceDrop: onDrop,
            onSquareClick: onSquareClick,
            boardOrientation: state.playerColor,
            boardStyle: { width: boardSize, height: boardSize, borderRadius: "var(--radius)" },
            darkSquareStyle: { backgroundColor: boardTheme.dark },
            lightSquareStyle: { backgroundColor: boardTheme.light },
            squareStyles: {
              ...(selectedSquare ? { [selectedSquare]: { backgroundColor: "rgba(201, 168, 76, 0.4)" } } : {}),
              ...(hintMove         ? qualitySquares(hintMove.from_sq,          hintMove.to_sq,          "best") : {}),
              ...(replyMove        ? qualitySquares(replyMove.from_sq,         replyMove.to_sq,         "best") : {}),
              ...(lastMoveHighlight   ? qualitySquares(lastMoveHighlight.from,   lastMoveHighlight.to,   lastMoveHighlight.quality)   : {}),
              ...(engineMoveHighlight ? qualitySquares(engineMoveHighlight.from, engineMoveHighlight.to, engineMoveHighlight.quality) : {}),
              ...(showBestLastHighlight ? qualitySquares(showBestLastHighlight.from, showBestLastHighlight.to, "best") : {}),
            },
          }}
        />

        {pendingPromotion && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 100,
            borderRadius: "var(--radius)",
          }}>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border-hi)",
              borderRadius: "var(--radius-lg)", padding: "20px 24px",
              display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.1em" }}>PROMOTE TO</div>
              <div style={{ display: "flex", gap: 8 }}>
                {([["q","♛ Queen"],["r","♜ Rook"],["b","♝ Bishop"],["n","♞ Knight"]] as const).map(([piece, label], i) => (
                  <button key={piece} className="primary" autoFocus={i === 0} onClick={() => {
                    makeMove(pendingPromotion.from + pendingPromotion.to + piece);
                    setPendingPromotion(null);
                  }} style={{ padding: "8px 16px", fontSize: 13 }}>
                    {label}
                  </button>
                ))}
              </div>
              <button className="ghost" style={{ fontSize: 11 }} onClick={() => setPendingPromotion(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Analysis + Controls ────────────── */}
      <div style={{ ...colStyle, width: 175, height: boardSize, justifyContent: "space-between" }}>
        {/* Top: analysis buttons — always present, disabled when N/A */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>
              Analysis
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }} title="Auto-evaluate every move for both players">
              <input type="checkbox" checked={autoEval} onChange={e => setAutoEval(e.target.checked)} style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>auto</span>
            </label>
          </div>

          <div>
            <button style={{ width: "100%" }} onClick={requestHint} disabled={hintLoading || loading || state.gameOver} title="Full-strength Stockfish best next move (marks game as assisted)">
              {hintLoading ? "Thinking…" : "Show Best Next"}
            </button>
            {hintError && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)", marginTop: 4 }}>unavailable</div>}
          </div>

          <div>
            <button style={{ width: "100%" }} onClick={requestShowBestLast} disabled={showBestLastLoading || !prevFen} title="Show the best move from your last position (not assisted)">
              {showBestLastLoading ? "Thinking…" : "Show Best Last"}
            </button>
            {showBestLastError && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)", marginTop: 4 }}>unavailable</div>}
          </div>

          <div>
            <button style={{ width: "100%" }} onClick={requestPrevBest} disabled={prevBestLoading || !prevFen} title="Classify your last move by eval loss">
              {prevBestLoading ? "Thinking…" : "Eval Last Move"}
            </button>
            {prevBestError && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)", marginTop: 4 }}>unavailable</div>}
          </div>

          <div>
            <button style={{ width: "100%" }} onClick={requestReply} disabled={replyLoading || !replyFen} title="Best opponent move in response to your last move">
              {replyLoading ? "Thinking…" : "Show Best Last Reply"}
            </button>
            {replyError && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)", marginTop: 4 }}>unavailable</div>}
          </div>


          {loading && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>engine thinking…</div>}
          {moveError && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--loss)" }}>{moveError}</div>}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          {QUALITIES.map((q) => (
            <div key={q} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: qualityTint(q, 75), boxShadow: `0 0 0 1.5px ${qualityTint(q, 90)}` }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.04em", textTransform: "capitalize" }}>{q}</span>
            </div>
          ))}
        </div>

        {/* Bottom: game controls — pinned, never jump */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          {state.gameOver ? (
            <>
              <button className="primary" onClick={() => onGameEnd(state!.gameId)}>Review Game</button>
              <button onClick={() => setState(null)}>New Game</button>
            </>
          ) : (
            <>
              <button onClick={takeback} disabled={loading || takebackLoading || !prevFen} title="Undo your last move and the engine's reply (counts as assisted)">
                {takebackLoading ? "Taking back…" : "Take Back"}
              </button>
              <button onClick={resign} disabled={loading}>Resign</button>
              <button className="danger-ghost" onClick={abort} disabled={loading}>Abort</button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
