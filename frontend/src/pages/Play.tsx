// frontend/src/pages/Play.tsx
import { useState, useRef, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
import { API, HINT_DISPLAY_MS, REPLY_DISPLAY_MS, EVAL_DISPLAY_MS, ENGINE_MOVE_MIN_MS } from "../config";
import { useBoardTheme } from "../themes";
import { type Quality, QUALITIES, classifyMove, qualityTint } from "../classify";
import { Field, Panel, QualityLegend, Segmented } from "../ui";
import { type EngineKind, opponentLabel, encodeOpponent, decodeOpponent } from "../opponents";
import { formatEval, describeEval, describeMoveDelta } from "../evalText";
import { type AccuracySummary, describeResult, grade, estimateElo } from "../ratings";
import GameIdBadge from "../components/GameIdBadge";
import { useBoardBesidePanel, useNarrow, DRAG_ACTIVATION_PX, COARSE_POINTER } from "../viewport";
import { tapAction, selectionStyles, layerStyles, selectedLabel } from "../boardTap";

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
  /** Short public ID ("k7m2qx"); the game is saved as games/<publicId>.pgn */
  publicId: string | null;
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

/** "Opponent is thinking ●●●" with a seconds counter once it takes a while. */
function ThinkingIndicator({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((now - since) / 1000);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="thinking-spinner" aria-hidden />
      Opponent is thinking
      <span className="thinking-dots" aria-hidden><i /><i /><i /></span>
      {secs >= 3 && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>{secs}s</span>}
      {secs >= 15 && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>· server is slow, still waiting</span>}
    </span>
  );
}

function engineModeTag(elo: number): string {
  const opt = ELO_OPTIONS.find(o => o.value === elo);
  if (opt?.mode === "skill") return `Skill ${opt.skill}/20`;
  return "UCI ELO";
}

type ColorChoice = "white" | "black" | "random";
const SETUP_KEY = "playSetup";

/** Last opponent/colour picked on this device (a convenience; may be unavailable). */
function loadSetup(): { opponent: string; color: ColorChoice } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null");
    if (v && typeof v.opponent === "string" && ["white", "black", "random"].includes(v.color)) return v;
  } catch { /* storage blocked or bad JSON */ }
  return null;
}
function saveSetup(v: { opponent: string; color: ColorChoice }) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Desktop: one side panel next to the board (the board frame adds 12px). */
const PANEL_W = 340;
const PANEL_GAP = 32;
const FRAME = 12;

export default function Play({ onGameEnd, onGameActive }: PlayProps) {
  const boardTheme = useBoardTheme();
  const boardSize = useBoardBesidePanel(PANEL_W, PANEL_GAP);
  const narrow = useNarrow();
  const [state, setState]             = useState<GameState | null>(null);
  const [loading, setLoading]         = useState(false);
  const [hintLoading, setHintLoading] = useState(false);  // FIX 3: separate hint loading flag
  // FIX M1: separate loading states for prevBest and reply
  const [prevBestLoading, setPrevBestLoading] = useState(false);
  const [replyLoading, setReplyLoading]       = useState(false);
  const [autoEval, setAutoEval]       = useState(true);
  const autoEvalRef                   = useRef(true);
  const remembered = useRef(loadSetup());
  const [colorChoice, setColorChoice] = useState<ColorChoice>(remembered.current?.color ?? "white");
  // Opponent value, e.g. "maia:1300" / "stockfish:1000"
  const [opponentChoice, setOpponentChoice] = useState(remembered.current?.opponent ?? encodeOpponent("stockfish", 1000));
  const [maiaLevels, setMaiaLevels] = useState<number[]>([]);   // empty = Maia not available
  const opponentTouched = useRef(remembered.current !== null);

  // Offer Maia (human-like) opponents when the server has them; default to Maia 1300.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/engines`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.maia?.available) {   // a remembered Maia choice can't be played here
          setOpponentChoice(c => decodeOpponent(c).engine === "maia" ? encodeOpponent("stockfish", 1000) : c);
          return;
        }
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
  // When the opponent started thinking (null = not waiting on a move)
  const [thinkingSince, setThinkingSince] = useState<number | null>(null);
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
  // Phones: when the game ends, bring the result (now at the top) into view
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (finishedGameId !== null && narrow) resultTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [finishedGameId, narrow]);
  useEffect(() => {
    onGameActive?.(gameActive);
  }, [gameActive, onGameActive]);

  // FIX 6: error handling in startGame
  async function startGame() {
    const chosen = decodeOpponent(opponentChoice);
    const color: "white" | "black" = colorChoice === "random" ? (Math.random() < 0.5 ? "white" : "black") : colorChoice;
    saveSetup({ opponent: opponentChoice, color: colorChoice });
    setLoading(true);
    setStartError(null);
    try {
      const res = await fetch(`${API}/api/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_color: color, engine: chosen.engine, engine_elo: chosen.elo }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setState({
        gameId: data.game_id,
        publicId: data.public_id ?? null,
        fen: data.fen,
        playerColor: color,
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
    // A finger that wobbled onto the same square was a tap, not a drag
    if (sourceSquare === targetSquare) { onSquareClick({ square: sourceSquare }); return false; }
    setSelectedSquare(null);
    if (isLegalPromotion(sourceSquare, targetSquare)) {
      setPendingPromotion({ from: sourceSquare, to: targetSquare });
      return true;
    }
    makeMove(sourceSquare + targetSquare);
    return true;
  }

  function onSquareClick({ square }: { square: string }) {
    if (!state || state.gameOver || loading) return;
    const action = tapAction(state.fen, selectedSquare, square, state.playerColor === "white" ? "w" : "b");
    if (action.kind === "select") setSelectedSquare(action.square as Square);
    else if (action.kind === "deselect") setSelectedSquare(null);
    else if (action.kind === "move") {
      setSelectedSquare(null);
      if (isLegalPromotion(action.from, action.to)) setPendingPromotion({ from: action.from, to: action.to });
      else makeMove(action.from + action.to);
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
    setThinkingSince(moveStart);
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

      // Highlight the player's move when its auto-eval arrives — in the background,
      // so a slow eval never holds up the opponent's reply
      if (autoPlayerPromise) {
        void autoPlayerPromise.then(async (res) => {
          if (!res?.ok) return;
          const evalData = await res.json();
          const bestUci = evalData.from_sq + evalData.to_sq + (evalData.promotion ?? "");
          const quality = classifyMove(uci, bestUci, evalBeforeMove, evalAfterMove, playerIsWhite);
          if (quality !== null) {
            setLastMoveHighlight({ from: uci.slice(0, 2), to: uci.slice(2, 4), quality });
            if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
            evalTimerRef.current = setTimeout(() => setLastMoveHighlight(null), EVAL_DISPLAY_MS);
          }
        }).catch(() => {});
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

      // Your turn again right away — the board isn't locked while auto-eval finishes
      setLoading(false);
      setThinkingSince(null);

      // Engine move highlight — whenever its auto-eval arrives, in the background
      if (autoEnginePromise && data.engine_move) {
        void autoEnginePromise.then(async (res) => {
          if (!res?.ok) return;
          const evalData = await res.json();
          const bestUci = evalData.from_sq + evalData.to_sq + (evalData.promotion ?? "");
          const quality = classifyMove(data.engine_move, bestUci, evalAfterMove, evalAfterReply, !playerIsWhite);
          if (quality === null) return;
          setEngineMoveHighlight({ from: data.engine_move.slice(0, 2), to: data.engine_move.slice(2, 4), quality });
          if (engineMoveTimerRef.current) clearTimeout(engineMoveTimerRef.current);
          engineMoveTimerRef.current = setTimeout(() => setEngineMoveHighlight(null), EVAL_DISPLAY_MS);
        }).catch(() => {});
      }
    } catch {
      // FIX H1: network failure — rollback optimistic FEN
      setState(s => s ? { ...s, fen: fenBeforeMove } : s);
      setMoveError("Could not reach server — please check your connection.");
    } finally {
      setLoading(false);
      setThinkingSince(null);
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


  // ── Setup screen ─────────────────────────────────────────
  if (!state) {
    const chosen = decodeOpponent(opponentChoice);
    const maiaOn = maiaLevels.length > 0;
    const pick = (engine: EngineKind, elo: number) => { opponentTouched.current = true; setOpponentChoice(encodeOpponent(engine, elo)); };
    const switchEngine = (engine: EngineKind) => {
      if (engine === chosen.engine) return;
      if (engine === "maia") pick("maia", maiaLevels.includes(1300) ? 1300 : maiaLevels[0]);
      else pick("stockfish", 1000);
    };
    const strengthOptions = chosen.engine === "maia"
      ? maiaLevels.map(lv => ({ value: lv, label: String(lv) }))
      : ELO_OPTIONS.map(o => ({ value: o.value, label: o.label, title: o.mode === "skill" ? `Skill level ${o.skill} of 20` : "Stockfish UCI_Elo" }));
    const opt = ELO_OPTIONS.find(o => o.value === chosen.elo);
    const strengthHint = chosen.engine === "maia"
      ? "Lichess rating it was trained on. Maia makes the mistakes people at that level make."
      : opt?.mode === "skill"
      ? `Skill level ${opt.skill} of 20. Below 1320 the rating is a rough guess, and Stockfish rarely hangs pieces.`
      : "Stockfish's own rating scale. It plays a little weaker than that at our fast move times.";
    const previewSize = narrow ? 0 : Math.min(boardSize, 560);

    const form = (
      <div className="stack lg" style={{ width: narrow ? "100%" : 380, flexShrink: 0 }}>
        <div>
          <h1>New game</h1>
          <p className="lead muted" style={{ marginTop: 6 }}>Choose who you play and which side you take.</p>
        </div>

        <Field label="Opponent">
          <Segmented<EngineKind>
            label="Opponent" block value={chosen.engine} onChange={switchEngine}
            options={[
              { value: "maia", label: "Maia", sub: maiaOn ? "Plays like a person" : "Not installed here", disabled: !maiaOn },
              { value: "stockfish", label: "Stockfish", sub: "Engine, set to a level" },
            ]}
          />
        </Field>

        <Field label="Strength" hint={strengthHint}>
          <Segmented<number> label="Strength" value={chosen.elo} onChange={elo => pick(chosen.engine, elo)} options={strengthOptions} />
        </Field>

        <Field label="You play">
          <Segmented<ColorChoice>
            label="Your colour" block value={colorChoice} onChange={setColorChoice}
            options={[
              { value: "white", label: "♔ White" },
              { value: "black", label: "♚ Black" },
              { value: "random", label: "Random" },
            ]}
          />
        </Field>

        <div className="stack sm">
          <button className="primary lg block" onClick={startGame} disabled={loading}>
            {loading ? "Starting…" : `Play ${opponentLabel(chosen.engine, chosen.elo)}`}
          </button>
          {startError && <p className="error" role="alert">{startError}</p>}
        </div>
      </div>
    );

    if (narrow) return form;
    return (
      <div style={{ display: "flex", gap: 48, alignItems: "flex-start", justifyContent: "center" }}>
        <div className="board-frame" aria-hidden>
          <Chessboard options={{
            position: START_FEN, allowDragging: false,
            boardOrientation: colorChoice === "black" ? "black" : "white",
            boardStyle: { width: previewSize, height: previewSize, borderRadius: 4 },
            darkSquareStyle: { backgroundColor: boardTheme.dark },
            lightSquareStyle: { backgroundColor: boardTheme.light },
          }} />
        </div>
        {form}
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

  const baseHighlights = {
    ...(hintMove         ? qualitySquares(hintMove.from_sq,          hintMove.to_sq,          "best") : {}),
    ...(replyMove        ? qualitySquares(replyMove.from_sq,         replyMove.to_sq,         "best") : {}),
    ...(lastMoveHighlight   ? qualitySquares(lastMoveHighlight.from,   lastMoveHighlight.to,   lastMoveHighlight.quality)   : {}),
    ...(engineMoveHighlight ? qualitySquares(engineMoveHighlight.from, engineMoveHighlight.to, engineMoveHighlight.quality) : {}),
    ...(showBestLastHighlight ? qualitySquares(showBestLastHighlight.from, showBestLastHighlight.to, "best") : {}),
  };
  const selectedText = selectedSquare ? selectedLabel(state.fen, selectedSquare) : null;

  // Who you're playing, your colour, the game id
  const gameInfoStrip = (
    <div className="row between">
      <div className="row" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 22 }}>{opponentLabel(state.engine, state.engineElo)}</h2>
        {state.engine === "stockfish" && <span className="tag">{engineModeTag(state.engineElo)}</span>}
      </div>
      <GameIdBadge id={state.publicId} />
    </div>
  );
  const gameTags = (
    <div className="row" style={{ gap: 6 }}>
      <span className="tag">You play {state.playerColor}</span>
      {state.assisted && <span className="tag accent" title="You used a hint or a take-back in this game">Assisted</span>}
    </div>
  );

  const evalCard = evalPos !== null && (
    <Panel tight>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <span className="small muted">Position</span>
        <span
          title="Engine evaluation from your side. +1.00 ≈ one pawn's worth of advantage, from material, activity, king safety and so on. M = forced mate in N moves."
          className="mono"
          style={{ fontSize: 22, fontWeight: 500, color: evalPos >= 0 ? "var(--win)" : "var(--loss)", cursor: "help" }}
        >
          {formatEval(evalPos)}
        </span>
      </div>
      {(() => {
        const clamped = Math.max(-500, Math.min(500, evalPos));
        const pct = Math.round(50 + (clamped / 500) * 30);
        return (
          <div style={{ height: 8, borderRadius: 4, background: "var(--sunken)", overflow: "hidden", margin: "8px 0 6px" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--text-strong)", borderRadius: 4, transition: "width 0.3s ease" }} />
          </div>
        );
      })()}
      <div className="small muted">{describeEval(evalPos)}</div>
      {lastMoveText !== null && (
        <div className="small" style={{ marginTop: 8 }} title="How much the evaluation changed because of your move alone">
          <span className="muted">Your last move: </span>
          <span style={{ color: lastMoveText.startsWith("▲") ? "var(--good)" : lastMoveText.startsWith("▼") ? "var(--loss)" : "var(--text-muted)" }}>
            {lastMoveText}
          </span>
        </div>
      )}
    </Panel>
  );

  const gameOverCard = state.gameOver && (() => {
    const { headline, detail } = describeResult(state.result, state.termination, state.playerColor);
    const tone = headline === "You won" ? "var(--win)" : headline === "You lost" ? "var(--loss)" : "var(--draw)";
    return (
      <Panel>
        <h2 style={{ color: tone, fontSize: narrow ? 30 : 28 }}>{headline}</h2>
        <p style={{ marginTop: 4 }}>{detail} <span className="mono muted small">{state.result}</span></p>
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
          {postGame?.status === "analyzing" && <p className="small muted">Checking every move…</p>}
          {postGame?.status === "error" && <p className="error">Analysis isn't available right now. Try again from Review.</p>}
          {postGame?.status === "done" && !postGame.you && <p className="small muted">No moves to rate.</p>}
          {postGame?.status === "done" && postGame.you && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([["Your accuracy", postGame.you], ["Opponent", postGame.opp]] as const).map(([who, acc]) => {
                if (!acc) return null;
                const pct = Math.round(acc.pct);
                const { label: gradeLabel, color } = grade(pct);
                return (
                  <div key={who}>
                    <div className="small muted">{who}</div>
                    <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, color, lineHeight: 1.1 }}>{pct}%</span>
                      <span className="small muted" title="A rough estimate from accuracy, not a rating">≈{estimateElo(pct)}</span>
                    </div>
                    <div className="small" style={{ color, fontWeight: 500 }}>{gradeLabel}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    );
  })();

  const analysisButtons: [string, () => void, boolean, boolean, boolean, string][] = [
    // label, onClick, busy, disabled, error, title
    ["Hint: best move", requestHint, hintLoading, hintLoading || loading || state.gameOver, hintError,
      "Full-strength Stockfish's best move here. Marks the game as assisted."],
    ["Best instead of mine", requestShowBestLast, showBestLastLoading, showBestLastLoading || !prevFen, showBestLastError,
      "What you should have played last move (doesn't count as assisted)"],
    ["Rate my last move", requestPrevBest, prevBestLoading, prevBestLoading || !prevFen, prevBestError,
      "Colour your last move by how much it gave away"],
    ["Their best reply", requestReply, replyLoading, replyLoading || !replyFen, replyError,
      "The strongest answer to your last move"],
  ];

  const analysisSection = (
    <Panel tight title="Help" aside={
      <label className="row small muted" style={{ gap: 8, cursor: "pointer" }} title="Colour every move, yours and the opponent's, by quality">
        <input type="checkbox" checked={autoEval} onChange={e => setAutoEval(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }} />
        Rate every move
      </label>
    }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {analysisButtons.map(([text, onClick, busy, disabled, error, title]) => (
          <div key={text}>
            <button className="wrap block sm" style={{ height: "100%" }} onClick={onClick} disabled={disabled} title={title}>
              {busy ? "Thinking…" : text}
            </button>
            {error && <div className="error xsmall" style={{ marginTop: 4 }}>Not available</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}><QualityLegend qualities={QUALITIES} /></div>
    </Panel>
  );

  const controls = state.gameOver ? (
    <div className="btn-row">
      <button className="primary lg" onClick={() => onGameEnd(state!.gameId)}>Review game</button>
      <button className="lg" onClick={() => setState(null)}>New game</button>
    </div>
  ) : (
    <div className="btn-row">
      <button onClick={takeback} disabled={loading || takebackLoading || !prevFen}
        title="Undo your last move and the opponent's reply (marks the game as assisted)">
        {takebackLoading ? "Taking back…" : "Take back"}
      </button>
      <button onClick={resign} disabled={loading}>Resign</button>
      <button className="danger" style={{ flex: "0 0 auto" }} onClick={abort} disabled={loading}
        title="Delete this game without saving it">Abandon</button>
    </div>
  );

  const shownBoard = boardSize - FRAME;
  const board = (
    <div className="board-frame" style={{ alignSelf: narrow ? "center" : undefined }}>
      <Chessboard
        options={{
          position: state.fen,
          onPieceDrop: onDrop,
          onSquareClick: onSquareClick,
          boardOrientation: state.playerColor,
          boardStyle: { width: shownBoard, height: shownBoard, borderRadius: 4 },
          darkSquareStyle: { backgroundColor: boardTheme.dark },
          lightSquareStyle: { backgroundColor: boardTheme.light },
          squareStyles: layerStyles(baseHighlights, selectionStyles(state.fen, selectedSquare)),
          dragActivationDistance: DRAG_ACTIVATION_PX,
          allowDrawingArrows: !narrow,
        }}
      />

      {pendingPromotion && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(5, 10, 8, 0.72)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 100, borderRadius: 10,
        }}>
          <div className="panel stack" style={{ alignItems: "center" }} role="dialog" aria-label="Promote to">
            <h3>Promote to</h3>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr" : "repeat(4, auto)", gap: 8 }}>
              {([["q", "♛ Queen"], ["r", "♜ Rook"], ["b", "♝ Bishop"], ["n", "♞ Knight"]] as const).map(([piece, text], i) => (
                <button key={piece} className={i === 0 ? "primary" : undefined} autoFocus={i === 0} onClick={() => {
                  makeMove(pendingPromotion.from + pendingPromotion.to + piece);
                  setPendingPromotion(null);
                }}>
                  {text}
                </button>
              ))}
            </div>
            <button className="quiet sm" onClick={() => setPendingPromotion(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );

  const tapWord = COARSE_POINTER ? "tap" : "click";
  const status = moveError
    ? { text: moveError, color: "var(--loss)" }
    : thinkingSince !== null
    ? { text: "", color: "var(--text)", thinking: true }
    : state.gameOver
    ? null
    : selectedText
    ? { text: `${selectedText}: ${tapWord} a dot to move it`, color: "var(--accent)" }
    : { text: `Your move. ${tapWord[0].toUpperCase() + tapWord.slice(1)} a piece or drag it.`, color: "var(--text-muted)" };
  const statusLine = status && (
    <div aria-live="polite" style={{ minHeight: 26, fontSize: 16, fontWeight: 500, color: status.color, textAlign: narrow ? "center" : "left" }}>
      {"thinking" in status && thinkingSince !== null ? <ThinkingIndicator since={thinkingSince} /> : status.text}
    </div>
  );

  // ── Phone layout: info line, board, status, controls, then help ──
  if (narrow) {
    // Game over: the result and what to do next go ABOVE the board, where you're already looking
    if (state.gameOver) return (
      <div ref={resultTopRef} className="stack" style={{ gap: 12, scrollMarginTop: 12 }}>
        {gameOverCard}
        {controls}
        {board}
        {gameInfoStrip}
        {evalCard}
        {analysisSection}
      </div>
    );
    return (
      <div className="stack" style={{ gap: 12 }}>
        {gameInfoStrip}
        {board}
        {statusLine}
        {controls}
        {evalCard}
        {analysisSection}
        {gameTags}
      </div>
    );
  }

  // ── Desktop: the biggest board that fits the window, one panel beside it ──
  return (
    <div style={{ display: "flex", gap: PANEL_GAP, alignItems: "flex-start", justifyContent: "center" }}>
      {board}
      <div className="stack" style={{ width: PANEL_W, flexShrink: 0, minHeight: boardSize, gap: 14 }}>
        <div className="stack sm">
          {gameInfoStrip}
          {gameTags}
        </div>
        {gameOverCard}
        {statusLine}
        {evalCard}
        {analysisSection}
        {/* Game controls pinned to the bottom edge of the board */}
        <div style={{ marginTop: "auto" }}>{controls}</div>
      </div>
    </div>
  );
}
