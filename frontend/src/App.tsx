// frontend/src/App.tsx
import { useState, useEffect } from "react";
import Home from "./pages/Home";
import Play from "./pages/Play";
import Review from "./pages/Review";
import Learn from "./pages/Learn";
import { THEMES, ThemeContext } from "./themes";
import { API } from "./config";
import { clearGameLink, gameRefFromUrl } from "./links";
import "./App.css";

type Page = "home" | "play" | "review" | "learn";

// Cburnett king (lichess/Wikimedia) — gold, no background
function KingLogo() {
  return (
    <svg
      width="46" height="46"
      viewBox="0 0 45 45"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      <g fill="none" fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        {/* cross */}
        <path stroke="var(--gold)" strokeLinejoin="miter" d="M22.5 11.63V6M20 8h5"/>
        {/* crown body */}
        <path fill="var(--gold)" stroke="var(--gold-dim)" strokeLinecap="butt" strokeLinejoin="miter"
          d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/>
        {/* base / skirt */}
        <path fill="var(--gold)" stroke="var(--gold-dim)"
          d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/>
        {/* skirt lines */}
        <path stroke="var(--gold-dim)"
          d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/>
      </g>
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

  useEffect(() => {
    const root = document.documentElement.style;
    Object.entries(boardTheme.vars).forEach(([k, v]) => root.setProperty(k, v));
  }, [boardTheme]);

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
        <div
          onClick={() => navigate("home")}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0 }}
        >
          <KingLogo />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1, gap: 2 }}>
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--gold)",
              letterSpacing: "0.22em",
            }}>CHESS</span>
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: 9,
              fontWeight: 600,
              color: "var(--text-dim)",
              letterSpacing: "0.3em",
            }}>TRAINER</span>
          </div>
        </div>

        <nav className="app-nav">
          <button className={`nav-btn${page === "home"   ? " active" : ""}`} onClick={() => navigate("home")}>Home</button>
          <button className={`nav-btn${page === "play"   ? " active" : ""}`} onClick={() => navigate("play")}>Play</button>
          {reviewGameId && (
            <button className={`nav-btn${page === "review" ? " active" : ""}`} onClick={() => navigate("review")}>Review</button>
          )}
          <button className={`nav-btn${page === "learn"  ? " active" : ""}`} onClick={() => navigate("learn")}>Learn</button>
          <button
            onClick={cycleTheme}
            title={`Board theme: ${boardTheme.name} (click to cycle)`}
            style={{
              width: 32, height: 32,
              borderRadius: "50%",
              padding: 0,
              fontSize: 16,
              lineHeight: 1,
              border: "1px solid var(--border-hi)",
              background: "var(--raised)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {boardTheme.icon}
          </button>
        </nav>
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
