import { describe, expect, it } from "vitest";
import { layerStyles, selectedLabel, selectionStyles, tapAction } from "./boardTap";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// After 1.e4 d5: White's e4 pawn can capture on d5.
const CAPTURE = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";

describe("tapAction", () => {
  it("selects your own piece", () => {
    expect(tapAction(START, null, "g1", "w")).toEqual({ kind: "select", square: "g1" });
  });
  it("ignores the opponent's piece and empty squares with nothing selected", () => {
    expect(tapAction(START, null, "g8", "w")).toEqual({ kind: "none" });
    expect(tapAction(START, null, "e4", "w")).toEqual({ kind: "none" });
  });
  it("moves to a legal target", () => {
    expect(tapAction(START, "g1", "f3", "w")).toEqual({ kind: "move", from: "g1", to: "f3" });
  });
  it("switches to another of your pieces instead of dropping the selection", () => {
    expect(tapAction(START, "g1", "e2", "w")).toEqual({ kind: "select", square: "e2" });
  });
  it("deselects on a second tap of the same piece or an unreachable square", () => {
    expect(tapAction(START, "g1", "g1", "w")).toEqual({ kind: "deselect" });
    expect(tapAction(START, "g1", "g4", "w")).toEqual({ kind: "deselect" });
  });
  it("works for Black", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(tapAction(fen, null, "b8", "b")).toEqual({ kind: "select", square: "b8" });
    expect(tapAction(fen, "b8", "c6", "b")).toEqual({ kind: "move", from: "b8", to: "c6" });
  });
});

describe("selectionStyles", () => {
  it("is empty with nothing selected", () => {
    expect(selectionStyles(START, null)).toEqual({});
  });
  it("marks the selected square and each legal target", () => {
    const s = selectionStyles(START, "g1");
    expect(Object.keys(s).sort()).toEqual(["f3", "g1", "h3"]);
    expect(s.g1.boxShadow).toBeTruthy();
    expect(String(s.f3.backgroundImage)).toContain("24%");      // dot
  });
  it("uses a ring for captures", () => {
    expect(String(selectionStyles(CAPTURE, "e4").d5.backgroundImage)).toContain("58%");
  });
});

describe("layerStyles", () => {
  it("keeps the last-move colour under a target dot", () => {
    const out = layerStyles({ f3: { backgroundColor: "red" } }, { f3: { backgroundImage: "dot" } });
    expect(out.f3).toEqual({ backgroundColor: "red", backgroundImage: "dot" });
  });
});

describe("selectedLabel", () => {
  it("names the piece", () => {
    expect(selectedLabel(START, "g1")).toBe("Knight on g1");
    expect(selectedLabel(START, "e4")).toBeNull();
  });
});
