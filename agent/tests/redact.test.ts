import { describe, it, expect } from "vitest";
import { redactForVisibility, summarizeToolCall } from "../src/redact";

describe("redactForVisibility", () => {
  it("summary level keeps only decision + market", () => {
    const r = redactForVisibility({
      ts: 1,
      type: "decision",
      decision: "BUY",
      market_id: "MUM",
      tool: "agent_findings_write",
      payload: {
        reason: "internal chatter",
        confidence: 0.78,
        raw_signals: { z: 2.4 },
      },
    }, "summary");
    expect(r.payload).toBeUndefined();
    expect(r.decision).toBe("BUY");
    expect(r.market_id).toBe("MUM");
  });

  it("detail level adds tool name + stage but redacts payload", () => {
    const r = redactForVisibility({
      ts: 1,
      type: "tool_call",
      tool: "discovery_find_markets",
      stage: "Sense",
      payload: { sport: "cricket", api_key: "secret" },
    }, "detail");
    expect(r.tool).toBe("discovery_find_markets");
    expect(r.stage).toBe("Sense");
    expect(r.payload).toBeUndefined();
  });

  it("full level keeps payload but strips known sensitive keys", () => {
    const r = redactForVisibility({
      ts: 1,
      type: "tool_call",
      tool: "polypi_create_order",
      payload: {
        market_id: "MUM",
        size_usd: 200,
        signer_priv_key: "0xabc...",
        customer_wallet_addr: "0xdef...",
        signed_tx: "0xfeed...",
      },
    }, "full");
    expect(r.payload?.market_id).toBe("MUM");
    expect(r.payload?.size_usd).toBe(200);
    expect(r.payload?.signer_priv_key).toBeUndefined();
    expect(r.payload?.signed_tx).toBeUndefined();
    expect(r.payload?.customer_wallet_addr).toBe("0xdef...");
  });
});

describe("summarizeToolCall", () => {
  it("polypi_create_order → human summary with size", () => {
    expect(
      summarizeToolCall("polypi_create_order", {
        market_id: "MUM",
        side: "buy",
        size_usd: 200,
      }),
    ).toMatch(/buy.*\$200.*MUM/i);
  });

  it("unknown tool → fallback to tool name", () => {
    expect(summarizeToolCall("some_new_tool", {})).toBe("some_new_tool");
  });
});
