import { describe, it, expect } from "vitest";
import { fingerprintWorld, computeDrift } from "../src/main";

describe("idle-gate fingerprint", () => {
  it("identical snapshots produce identical fingerprints", () => {
    const snap = {
      markets: [
        { market_id: "M1", tob_bid: 0.42, tob_ask: 0.45, trades_since_open: 10 },
        { market_id: "M2", tob_bid: 0.50, tob_ask: 0.51, trades_since_open: 20 },
      ],
    };
    expect(fingerprintWorld(snap)).toBe(fingerprintWorld(snap));
  });

  it("market order doesn't affect fingerprint (sorted)", () => {
    const a = { markets: [
      { market_id: "M1", tob_bid: 0.42, tob_ask: 0.45, trades_since_open: 10 },
      { market_id: "M2", tob_bid: 0.50, tob_ask: 0.51, trades_since_open: 20 },
    ]};
    const b = { markets: [
      { market_id: "M2", tob_bid: 0.50, tob_ask: 0.51, trades_since_open: 20 },
      { market_id: "M1", tob_bid: 0.42, tob_ask: 0.45, trades_since_open: 10 },
    ]};
    expect(fingerprintWorld(a)).toBe(fingerprintWorld(b));
  });

  it("changed mid produces different fingerprint", () => {
    const a = { markets: [{ market_id: "M1", tob_bid: 0.42, tob_ask: 0.45, trades_since_open: 10 }] };
    const b = { markets: [{ market_id: "M1", tob_bid: 0.43, tob_ask: 0.46, trades_since_open: 10 }] };
    expect(fingerprintWorld(a)).not.toBe(fingerprintWorld(b));
  });
});

describe("idle-gate computeDrift", () => {
  it("returns Infinity on cold-start (no lastSnap)", () => {
    const snap = { markets: [{ market_id: "M1", tob_bid: 0.5, tob_ask: 0.5, trades_since_open: 0 }] };
    const d = computeDrift(snap, null);
    expect(d.maxBps).toBe(Infinity);
    expect(d.newTrades).toBe(Infinity);
  });

  it("returns Infinity if a new market_id appears", () => {
    const last = { markets: [{ market_id: "M1", tob_bid: 0.5, tob_ask: 0.5, trades_since_open: 5 }] };
    const snap = { markets: [
      { market_id: "M1", tob_bid: 0.5, tob_ask: 0.5, trades_since_open: 5 },
      { market_id: "M2", tob_bid: 0.6, tob_ask: 0.6, trades_since_open: 0 },
    ]};
    expect(computeDrift(snap, last).maxBps).toBe(Infinity);
  });

  it("computes drift correctly in bps", () => {
    const last = { markets: [{ market_id: "M1", tob_bid: 0.50, tob_ask: 0.50, trades_since_open: 5 }] };
    const snap = { markets: [{ market_id: "M1", tob_bid: 0.51, tob_ask: 0.51, trades_since_open: 7 }] };
    const d = computeDrift(snap, last);
    expect(d.maxBps).toBeCloseTo(200, 0);   // 1 cent / 50 cents = 2% = 200 bps
    expect(d.newTrades).toBe(2);
  });
});
