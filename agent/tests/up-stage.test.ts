import { describe, it, expect, vi, beforeEach } from "vitest";
import { installUpStage, STAGE_ALLOWLISTS, type Stage } from "../src/extensions/up-stage";

interface MockPi {
  registerTool: any;
  on: any;
  _toolHandlers: Record<string, any>;
  _eventHandlers: Record<string, any[]>;
}

function makeMockPi(): MockPi {
  const toolHandlers: Record<string, any> = {};
  const eventHandlers: Record<string, any[]> = {};
  return {
    registerTool: (spec: any) => { toolHandlers[spec.name] = spec; },
    on: (event: string, fn: any) => { (eventHandlers[event] ??= []).push(fn); },
    _toolHandlers: toolHandlers,
    _eventHandlers: eventHandlers,
  };
}

describe("up-stage extension", () => {
  let pi: MockPi;
  let lifecycleWriter: any;

  beforeEach(() => {
    pi = makeMockPi();
    lifecycleWriter = vi.fn();
  });

  it("registers stage_advance tool and tool_call handler", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    expect(pi._toolHandlers.stage_advance).toBeDefined();
    expect(pi._eventHandlers.tool_call?.length).toBe(1);
  });

  it("blocks tool not in current stage allowlist", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    const handler = pi._eventHandlers.tool_call[0];
    const ctx: any = { stage: "Sense", session: { metadata: { stage: "Sense" } }, signal: { abort: vi.fn() } };
    const res = await handler({ tool: "polypi_create_order" }, ctx);
    expect(res?.allow).toBe(false);
  });

  it("permits tool in current stage allowlist", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    const handler = pi._eventHandlers.tool_call[0];
    const ctx: any = { stage: "Sense", session: { metadata: { stage: "Sense" } }, signal: { abort: vi.fn() } };
    const allowed = STAGE_ALLOWLISTS.Sense[0];
    const res = await handler({ tool: allowed }, ctx);
    expect(res?.allow).not.toBe(false);
  });

  it("aborts cycle after 3 violations and writes lifecycle event", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    const handler = pi._eventHandlers.tool_call[0];
    const abort = vi.fn();
    const ctx: any = { stage: "Sense", session: { metadata: { stage: "Sense", violations: 0 } }, signal: { abort } };
    for (let i = 0; i < 3; i++) await handler({ tool: "polypi_create_order" }, ctx);
    expect(abort).toHaveBeenCalledOnce();
    expect(lifecycleWriter).toHaveBeenCalledWith(expect.objectContaining({
      scope: "cycle",
      toState: "ABORTED_STAGE_VIOLATION",
    }));
  });

  it("stage_advance moves to the next legal stage", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    const tool = pi._toolHandlers.stage_advance;
    const ctx: any = { session: { metadata: { stage: "Sense" } } };
    const r = await tool.execute("c1", { next: "Frame" }, new AbortController().signal, () => {}, ctx);
    expect(ctx.session.metadata.stage).toBe("Frame");
    expect(r.content[0].text).toContain("Frame");
  });

  it("stage_advance rejects illegal transitions", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    const tool = pi._toolHandlers.stage_advance;
    const ctx: any = { session: { metadata: { stage: "Sense" } } };
    const r = await tool.execute("c1", { next: "Critique" }, new AbortController().signal, () => {}, ctx);
    expect(r.isError).toBe(true);
  });

  it("Critique → Commit blocked when decision is HOLD", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    const tool = pi._toolHandlers.stage_advance;
    const ctx: any = { session: { metadata: { stage: "Critique", lastDecision: "HOLD" } } };
    const r = await tool.execute("c1", { next: "Commit" }, new AbortController().signal, () => {}, ctx);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("HOLD ends the cycle");
  });

  it("Critique → Commit allowed when decision is BUY", async () => {
    await installUpStage(pi as any, { lifecycleWriter, jobId: "j1", customerId: "c1" });
    const tool = pi._toolHandlers.stage_advance;
    const ctx: any = { session: { metadata: { stage: "Critique", lastDecision: "BUY" } } };
    const r = await tool.execute("c1", { next: "Commit" }, new AbortController().signal, () => {}, ctx);
    expect(r.isError).toBeUndefined();
    expect(ctx.session.metadata.stage).toBe("Commit");
  });
});
