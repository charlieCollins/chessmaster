// frontend/src/App.tsx
import { useState, useEffect } from "react";
import Home from "./pages/Home";
import Play from "./pages/Play";
import Review from "./pages/Review";
import Learn from "./pages/Learn";
import { THEMES, ThemeContext } from "./themes";
import { API } from "./config";
import { clearGameLink, gameRefFromUrl } from "./links";

type Page = "home" | "play" | "review" | "learn";

// Cburnett king (lichess/Wikimedia) in brass
function KingLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <g fill="none" fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path stroke="var(--accent)" strokeLinejoin="miter" d="M22.5 11.63V6M20 8h5"/>
        <path fill="var(--accent)" stroke="var(--gold-dim)" strokeLinecap="butt" strokeLinejoin="miter"
          d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/>
        <path fill="var(--accent)" stroke="var(--gold-dim)"
          d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/>
        <path stroke="var(--gold-dim)" d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/>
      </g>
    </svg>
  );
}

/** Four squares of the current board theme; click to cycle. */
function BoardSwatch({ dark, light }: { dark: string; light: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 2 2" aria-hidden style={{ borderRadius: 3, display: "block" }}>
      <rect width="2" height="2" fill={light} /><rect width="1" height="1" fill={dark} /><rect x="1" y="1" width="1" height="1" fill={dark} />
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [reviewGameId, setReviewGameId] = useState<number | null>(null);
  const [gameActive, setGameActive] = useState(false);
  const [themeIdx, setThemeIdx] = useState(() => {
    const stored = Number(localStorage.getItem("boardThemeIdx"));
    const safeStored = Number.isFinite(stored) ? stored : 0;
    return Math.min(Math.max(0, safeStored), THEMES.length - 1);
  });

  function cycleTheme() {
    setThemeIdx((i) => {
      const next = (i + 1) % THEMES.length;
      localStorage.setItem("boardThemeIdx", String(next));
      return next;
    });
  }

  const boardTheme = THEMES[themeIdx];

  // Deep link: /?id=k7m2qx (or ?id=123) opens that game's review
  useEffect(() => {
    const ref = gameRefFromUrl();
    if (!ref) return;
    fetch(`${API}/api/games/lookup?id=${encodeURIComponent(ref)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((g: { game_id: number }) => { setReviewGameId(g.game_id); setPage("review"); })
      .catch(() => clearGameLink());
  }, []);

  function navigate(newPage: Page) {
    if (gameActive && newPage !== "play") {
      if (!window.confirm("You have a game in progress. Leave anyway? In-progress games can't be resumed and won't appear in your history.")) return;
    }
    setPage(newPage);
    if (newPage !== "review") clearGameLink();
    if (newPage !== "play") setGameActive(false);
  }

  function goToReview(gameId: number) {
    setReviewGameId(gameId);
    setPage("review");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="wordmark" onClick={() => navigate("home")} aria-label="Chess trainer — home">
          <KingLogo />
          <span>Chess trainer</span>
        </button>

        <nav className="app-nav" aria-label="Main">
          {(["home", "play", ...(reviewGameId ? ["review"] as const : []), "learn"] as Page[]).map(p => (
            <button key={p} className="nav-tab" aria-current={page === p ? "page" : undefined} onClick={() => navigate(p)}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </nav>

        <div className="header-tools">
          <button className="quiet sm" onClick={cycleTheme} title={`Board colours: ${boardTheme.name} — click to change`}
            aria-label={`Board colours: ${boardTheme.name}`}>
            <BoardSwatch dark={boardTheme.dark} light={boardTheme.light} />
          </button>
        </div>
      </header>

      <main className="app-main">
        <ThemeContext.Provider value={boardTheme}>
          {page === "home"   && <Home onPlay={() => navigate("play")} onReview={goToReview} />}
          {page === "play"   && <Play onGameEnd={goToReview} onGameActive={setGameActive} />}
          {page === "learn"  && <Learn />}
          {page === "review" && reviewGameId && <Review gameId={reviewGameId} />}
        </ThemeContext.Provider>
      </main>
    </div>
  );
}
