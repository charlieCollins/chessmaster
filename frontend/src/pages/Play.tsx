// frontend/src/pages/Play.tsx
interface PlayProps {
  onGameEnd: (gameId: number) => void;
}
export default function Play({ onGameEnd: _onGameEnd }: PlayProps) {
  return <div>Play page (coming soon)</div>;
}
