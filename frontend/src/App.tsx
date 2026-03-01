// frontend/src/App.tsx
import { useState } from "react";
import Play from "./pages/Play";
import Review from "./pages/Review";

type Page = "play" | "review";

export default function App() {
  const [page, setPage] = useState<Page>("play");
  const [reviewGameId, setReviewGameId] = useState<number | null>(null);

  function goToReview(gameId: number) {
    setReviewGameId(gameId);
    setPage("review");
  }

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Chess Trainer</h1>
      <nav style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button onClick={() => setPage("play")} disabled={page === "play"}>Play</button>
        {reviewGameId && (
          <button onClick={() => setPage("review")} disabled={page === "review"}>Review</button>
        )}
      </nav>
      {page === "play" && <Play onGameEnd={goToReview} />}
      {page === "review" && reviewGameId && <Review gameId={reviewGameId} />}
    </div>
  );
}
