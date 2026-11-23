// frontend/src/pages/learn/lessonMap.ts
// The six hand-written piece lessons, by topic slug (shown in those topics' Read step).
import type { ReactElement } from "react";
import { BishopsLesson, KingsLesson, KnightsLesson, PawnsLesson, QueensLesson, RooksLesson } from "./PieceLessons";

export const PIECE_LESSONS: Record<string, (p: { onBack: () => void }) => ReactElement> = {
  knights: KnightsLesson, bishops: BishopsLesson, rooks: RooksLesson,
  pawns: PawnsLesson, queens: QueensLesson, kings: KingsLesson,
};
