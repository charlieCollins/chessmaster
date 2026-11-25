// frontend/src/links.test.ts
import { describe, expect, it } from "vitest";
import { parseGameRef } from "./links";

describe("parseGameRef", () => {
  it("reads a public id or a numeric id", () => {
    expect(parseGameRef("?id=k7m2qx")).toBe("k7m2qx");
    expect(parseGameRef("?id=123")).toBe("123");
    expect(parseGameRef("?foo=1&id=AB12cd")).toBe("AB12cd");
  });
  it("ignores missing or junk ids", () => {
    expect(parseGameRef("")).toBeNull();
    expect(parseGameRef("?id=")).toBeNull();
    expect(parseGameRef("?id=../../etc")).toBeNull();
    expect(parseGameRef("?id=" + "a".repeat(40))).toBeNull();
  });
});
