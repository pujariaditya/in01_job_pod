import { describe, it, expect, vi } from "vitest";
import { installUpSse } from "../src/extensions/up-sse";

function makePi() {
  const handlers: Record<string, any[]> = {};
  return {
    on: (e: string, fn: any) => { (handlers[e] ??= []).push(fn); },
    registerTool: vi.fn(),
    _h: handlers,
  };
}

describe("up-sse extension", () => {
  it("publishes a tool_call event respecting visibility level", async () => {
    const producer = { publish: vi.fn().mockResolvedValue(undefined) };
    const pi = makePi();
    await installUpSse(pi as any, {
      producer: producer as any,
      visibilityLevel: "detail",
    });
    await pi._h.tool_call[0](
      { tool: "discovery_find_markets", params: { sport: "cricket" } },
      { session: { metadata: { stage: "Sense" } } },
    );
    expect(producer.publish).toHaveBeenCalledOnce();
    const ev = producer.publish.mock.calls[0][0];
    expect(ev.type).toBe("tool_call");
    expect(ev.tool).toBe("discovery_find_markets");
    expect(ev.stage).toBe("Sense");
    expect(ev.payload).toBeUndefined();   // detail level strips payload
  });

  it("publishes a decision event when agent_findings_write is called", async () => {
    const producer = { publish: vi.fn().mockResolvedValue(undefined) };
    const pi = makePi();
    await installUpSse(pi as any, {
      producer: producer as any,
      visibilityLevel: "summary",
    });
    await pi._h.tool_call[0](
      {
        tool: "agent_findings_write",
        params: { decision: "BUY", market_id: "MUM", size_usd: 200 },
      },
      { session: { metadata: { stage: "Critique" } } },
    );
    const decisionEv = producer.publish.mock.calls
      .map((c: any[]) => c[0])
      .find((e: any) => e.type === "decision");
    expect(decisionEv).toBeDefined();
    expect(decisionEv.decision).toBe("BUY");
    expect(decisionEv.market_id).toBe("MUM");
  });

  it("never throws when producer fails", async () => {
    const producer = { publish: vi.fn().mockRejectedValue(new Error("nope")) };
    const pi = makePi();
    await installUpSse(pi as any, {
      producer: producer as any,
      visibilityLevel: "summary",
    });
    await expect(
      pi._h.tool_call[0](
        { tool: "discovery_find_markets", params: {} },
        { session: { metadata: { stage: "Sense" } } },
      ),
    ).resolves.not.toThrow();
  });
});
