// frontend/src/pages/Review.tsx
interface ReviewProps {
  gameId: number;
}
export default function Review({ gameId }: ReviewProps) {
  return <div>Review page for game {gameId} (coming soon)</div>;
}
