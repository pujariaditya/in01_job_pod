import { describe, it, expect } from "vitest";
import { isDecision, parseDecision, requiresCommit, type Decision } from "../src/decision";

describe("isDecision", () => {
  it("accepts the three canonical strings", () => {
    expect(isDecision("BUY")).toBe(true);
    expect(isDecision("SELL")).toBe(true);
    expect(isDecision("HOLD")).toBe(true);
  });

  it("rejects lowercase / mixed-case variants", () => {
    expect(isDecision("buy")).toBe(false);
    expect(isDecision("Buy")).toBe(false);
    expect(isDecision("sell")).toBe(false);
    expect(isDecision("hold")).toBe(false);
  });

  it("rejects close-but-wrong synonyms", () => {
    expect(isDecision("LONG")).toBe(false);
    expect(isDecision("SHORT")).toBe(false);
    expect(isDecision("SKIP")).toBe(false);
    expect(isDecision("PASS")).toBe(false);
    expect(isDecision("NONE")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isDecision(undefined)).toBe(false);
    expect(isDecision(null)).toBe(false);
    expect(isDecision(0)).toBe(false);
    expect(isDecision({})).toBe(false);
    expect(isDecision([])).toBe(false);
    expect(isDecision(true)).toBe(false);
  });
});

describe("parseDecision", () => {
  it("returns canonical decisions unchanged", () => {
    expect(parseDecision("BUY")).toBe("BUY");
    expect(parseDecision("SELL")).toBe("SELL");
    expect(parseDecision("HOLD")).toBe("HOLD");
  });

  it("throws on invalid strings with a message naming the canonical set", () => {
    expect(() => parseDecision("buy")).toThrow(/BUY, SELL, or HOLD/);
    expect(() => parseDecision("LONG")).toThrow(/BUY, SELL, or HOLD/);
    expect(() => parseDecision("")).toThrow(/BUY, SELL, or HOLD/);
  });

  it("throws on non-string inputs", () => {
    expect(() => parseDecision(undefined)).toThrow();
    expect(() => parseDecision(null)).toThrow();
    expect(() => parseDecision(42)).toThrow();
  });
});

describe("requiresCommit", () => {
  it("returns true for BUY and SELL", () => {
    expect(requiresCommit("BUY" as Decision)).toBe(true);
    expect(requiresCommit("SELL" as Decision)).toBe(true);
  });

  it("returns false for HOLD", () => {
    expect(requiresCommit("HOLD" as Decision)).toBe(false);
  });
});
