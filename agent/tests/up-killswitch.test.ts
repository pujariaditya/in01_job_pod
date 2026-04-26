import { describe, it, expect, vi } from "vitest";
import { installUpKillswitch } from "../src/extensions/up-killswitch";

function makePi() {
  const handlers: Record<string, any[]> = {};
  return {
    on: (e: string, fn: any) => { (handlers[e] ??= []).push(fn); },
    registerTool: vi.fn(),
    _h: handlers,
  };
}

describe("up-killswitch extension", () => {
  it("aborts tool when killswitch flag is set", async () => {
    const dragonfly = { get: vi.fn().mockResolvedValue("1") } as any;
    const pi = makePi();
    const lifecycleWriter = vi.fn();
    await installUpKillswitch(pi as any, { dragonfly, lifecycleWriter, customerId: "c1", jobId: "j1" });
    const abort = vi.fn();
    const result = await pi._h.tool_call[0](
      { tool: "discovery_find_markets", params: {} },
      { signal: { abort }, session: { metadata: {} } },
    );
    expect(abort).toHaveBeenCalledWith(expect.stringContaining("kill switch"));
    expect(result.allow).toBe(false);
    expect(lifecycleWriter).toHaveBeenCalledWith(expect.objectContaining({
      scope: "job",
      toState: "KILL_SWITCH_TRIPPED",
    }));
  });

  it("permits tool when killswitch is not set", async () => {
    const dragonfly = { get: vi.fn().mockResolvedValue(null) } as any;
    const pi = makePi();
    const lifecycleWriter = vi.fn();
    await installUpKillswitch(pi as any, { dragonfly, lifecycleWriter, customerId: "c1", jobId: "j1" });
    const r = await pi._h.tool_call[0](
      { tool: "discovery_find_markets" },
      { signal: { abort: vi.fn() }, session: { metadata: {} } },
    );
    expect(r).toBeUndefined();
    expect(lifecycleWriter).not.toHaveBeenCalled();
  });
});
