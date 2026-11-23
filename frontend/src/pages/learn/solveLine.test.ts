// frontend/src/pages/learn/solveLine.test.ts
import { describe, expect, it } from "vitest";
import { applyUci, checkMove, drillToLine, lichessToLine, userMoveIndices } from "./solveLine";

const FEN_B = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24";   // Black to move
const FEN_W = "r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15"; // White to move

describe("lichessToLine", () => {
  it("solver is the side to move after the opponent's first move", () => {
    const line = lichessToLine({ fen: FEN_B, moves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"] });
    expect(line.userColor).toBe("w");
    expect(line.autoFirst).toBe(true);
    expect(userMoveIndices(line)).toEqual([1, 3, 5]);
  });
  it("solver plays Black when the FEN has White to move", () => {
    const line = lichessToLine({ fen: FEN_W, moves: ["d1h5", "d5g2"] });
    expect(line.userColor).toBe("b");
    expect(userMoveIndices(line)).toEqual([1]);
  });
});

describe("drillToLine", () => {
  it("asks only for the first ask_moves of the user's moves", () => {
    const moves = ["g2g4", "a7a5", "a2a4", "e6f6", "h2h4", "f6e6", "g4g5", "e6f7", "e4f5", "f7g7"];
    const line = drillToLine({ fen: "8/p6p/4k3/8/4K3/8/P5PP/8 w - - 0 1", line_uci: moves, ask_moves: 3 });
    expect(line.userColor).toBe("w");
    expect(line.autoFirst).toBe(false);
    expect(userMoveIndices(line)).toEqual([0, 2, 4]);
  });
  it("Black to move in the diagram", () => {
    const line = drillToLine({ fen: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 1", line_uci: ["e8d7", "e2e4"], ask_moves: 3 });
    expect(line.userColor).toBe("b");
    expect(userMoveIndices(line)).toEqual([0]);
  });
});

describe("checkMove", () => {
  it("exact move is correct", () => {
    expect(checkMove(FEN_W, "d1h5", "d1h5")).toBe("correct");
  });
  it("compares the promotion piece", () => {
    const fen = "8/P7/8/8/8/8/7k/4K3 w - - 0 1";
    expect(checkMove(fen, "a7a8q", "a7a8q")).toBe("correct");
    expect(checkMove(fen, "a7a8n", "a7a8q")).toBe("wrong");
  });
  it("accepts a different checkmate", () => {
    expect(checkMove("6k1/5ppp/8/8/8/8/8/RR4K1 w - - 0 1", "b1b8", "a1a8")).toBe("mate");
  });
  it("wrong and illegal", () => {
    expect(checkMove(FEN_W, "d1e2", "d1h5")).toBe("wrong");
    expect(checkMove(FEN_W, "d1d8", "d1h5")).toBe("illegal");
  });
});

describe("applyUci", () => {
  it("returns the FEN after the move", () => {
    expect(applyUci("8/P7/8/8/8/8/7k/4K3 w - - 0 1", "a7a8q")).toBe("Q7/8/8/8/8/8/7k/4K3 b - - 0 1");
  });
});
