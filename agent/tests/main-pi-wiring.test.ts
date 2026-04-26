/**
 * Pi 0.70.2 wiring tests for main.ts.
 *
 * Pi-migration Wave D Task 7 (extended in Wave G Task 4 for the 6th
 * extension `up-sse`). Verifies the integration shape WITHOUT booting
 * Pi: the 6-extension factory list is built in the right order, each
 * factory wires its dependency to the right injected client, and the
 * `createPiLikeAdapter` correctly translates between Pi 0.70's real
 * `ExtensionAPI` event/ctx shapes and the structural `PiLike` contract
 * Wave D extensions were written against.
 *
 * Real Pi-boot integration is out of scope for unit tests (requires a
 * live daemon + a real model + real auth) and is gated behind the
 * UP_INTEGRATION env var in tests/integration/pi-boot.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { buildExtensionFactories, createPiLikeAdapter, loadVisibilityLevel } from "../src/main";

function makeMockDeps() {
  const daemon = {
    call: vi.fn().mockResolvedValue({ version: 1, tools: [
      { name: "snapshot_get_top_of_book", description: "tob", params_schema: { type: "object", properties: {} } },
    ]}),
  } as any;
  const polypi = {
    listTools: vi.fn().mockResolvedValue({ tools: [
      { name: "polypi_create_order", description: "place", inputSchema: { type: "object", properties: {} } },
    ]}),
    callTool: vi.fn(),
  } as any;
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
  const dragonfly = { get: vi.fn().mockResolvedValue(null) } as any;
  const lifecycleWriter = vi.fn().mockResolvedValue(undefined);
  const snapshotProvider = vi.fn().mockResolvedValue({ tob_bid: 0.5, tob_ask: 0.51 });
  const sseProducer = { publish: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn() } as any;
  return {
    daemon, polypi, pool, dragonfly, lifecycleWriter, snapshotProvider,
    customerId: "c1", jobId: "j1",
    sseProducer,
    visibilityLevel: "summary" as const,
  };
}

describe("buildExtensionFactories", () => {
  it("returns exactly 6 factories in spec order", () => {
    const factories = buildExtensionFactories(makeMockDeps());
    expect(factories).toHaveLength(6);
    factories.forEach((f: (...args: any[]) => any) => expect(typeof f).toBe("function"));
  });

  it("factory[0] (up-tools) registers tools off the daemon manifest", async () => {
    const deps = makeMockDeps();
    const factories = buildExtensionFactories(deps);
    const tools: any[] = [];
    const pi = { registerTool: (s: any) => tools.push(s), on: vi.fn() };
    await factories[0]!(pi as any);
    expect(deps.daemon.call).toHaveBeenCalledWith("_manifest", {});
    expect(tools.map((t) => t.name)).toContain("snapshot_get_top_of_book");
  });

  it("factory[1] (up-mcp-polypi) registers tools off the polypi MCP", async () => {
    const deps = makeMockDeps();
    const factories = buildExtensionFactories(deps);
    const tools: any[] = [];
    const pi = { registerTool: (s: any) => tools.push(s), on: vi.fn() };
    await factories[1]!(pi as any);
    expect(deps.polypi.listTools).toHaveBeenCalled();
    expect(tools.map((t) => t.name)).toContain("polypi_create_order");
  });

  it("factory[2] (up-stage) registers stage_advance and a tool_call gate", async () => {
    const deps = makeMockDeps();
    const factories = buildExtensionFactories(deps);
    const tools: any[] = [];
    const handlers: Record<string, any[]> = {};
    const pi = {
      registerTool: (s: any) => tools.push(s),
      on: (e: string, fn: any) => { (handlers[e] ??= []).push(fn); },
    };
    await factories[2]!(pi as any);
    expect(tools.map((t) => t.name)).toContain("stage_advance");
    expect(handlers.tool_call?.length).toBe(1);
  });

  it("factory[3] (up-memory) registers all 4 lifecycle hooks", async () => {
    const deps = makeMockDeps();
    const factories = buildExtensionFactories(deps);
    const handlers: Record<string, any[]> = {};
    const pi = { registerTool: vi.fn(), on: (e: string, fn: any) => { (handlers[e] ??= []).push(fn); } };
    await factories[3]!(pi as any);
    expect(handlers.before_agent_start?.length).toBe(1);
    expect(handlers.tool_call?.length).toBe(1);
    expect(handlers.context?.length).toBe(1);
    expect(handlers.session_before_compact?.length).toBe(1);
  });

  it("factory[4] (up-killswitch) registers a tool_call gate", async () => {
    const deps = makeMockDeps();
    const factories = buildExtensionFactories(deps);
    const handlers: Record<string, any[]> = {};
    const pi = { registerTool: vi.fn(), on: (e: string, fn: any) => { (handlers[e] ??= []).push(fn); } };
    await factories[4]!(pi as any);
    expect(handlers.tool_call?.length).toBe(1);
  });

  it("factory[5] (up-sse) registers tool_call + agent_message hooks", async () => {
    const deps = makeMockDeps();
    const factories = buildExtensionFactories(deps);
    const handlers: Record<string, any[]> = {};
    const pi = { registerTool: vi.fn(), on: (e: string, fn: any) => { (handlers[e] ??= []).push(fn); } };
    await factories[5]!(pi as any);
    expect(handlers.tool_call?.length).toBe(1);
    expect(handlers.agent_message?.length).toBe(1);
  });
});

describe("loadVisibilityLevel", () => {
  it("returns the row's visibility_level when set to a canonical value", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ visibility_level: "detail" }] }) };
    const v = await loadVisibilityLevel(pool, "c1");
    expect(v).toBe("detail");
  });

  it("defaults to 'summary' when no row exists", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const v = await loadVisibilityLevel(pool, "c1");
    expect(v).toBe("summary");
  });

  it("defaults to 'summary' when query throws (table missing, etc)", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("relation does not exist")) };
    const v = await loadVisibilityLevel(pool, "c1");
    expect(v).toBe("summary");
  });
});

describe("createPiLikeAdapter", () => {
  it("registerTool forwards spec to Pi with a label fallback", () => {
    const piApi = { registerTool: vi.fn(), on: vi.fn() };
    const adapter = createPiLikeAdapter(piApi, {});
    adapter.registerTool({
      name: "foo_bar",
      description: "d",
      parameters: { type: "object" } as any,
      execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    expect(piApi.registerTool).toHaveBeenCalledWith(expect.objectContaining({
      name: "foo_bar",
      label: "foo bar",
      description: "d",
    }));
  });

  it("tool_call adapter translates Pi event shape to legacy {tool, params}", async () => {
    const piApi = { registerTool: vi.fn(), on: vi.fn() };
    const adapter = createPiLikeAdapter(piApi, { stage: "Sense" });
    let received: any = null;
    adapter.on("tool_call", async (event: any, _ctx: any) => {
      received = event;
    });
    // Pi calls our wrapper with the real shape:
    const piHandler = (piApi.on as any).mock.calls[0][1];
    await piHandler({ type: "tool_call", toolName: "discovery_find_markets", input: { foo: 1 }, toolCallId: "abc" }, { signal: new AbortController().signal, abort: vi.fn() });
    expect(received).toEqual({ tool: "discovery_find_markets", params: { foo: 1 } });
  });

  it("tool_call adapter translates {allow:false, reason} to Pi {block:true, reason}", async () => {
    const piApi = { registerTool: vi.fn(), on: vi.fn() };
    const adapter = createPiLikeAdapter(piApi, {});
    adapter.on("tool_call", async () => ({ allow: false, reason: "nope" }));
    const piHandler = (piApi.on as any).mock.calls[0][1];
    const result = await piHandler({ toolName: "x", input: {} }, { signal: new AbortController().signal, abort: vi.fn() });
    expect(result).toEqual({ block: true, reason: "nope" });
  });

  it("before_agent_start adapter returns systemPrompt when extension mutates it", async () => {
    const piApi = { registerTool: vi.fn(), on: vi.fn() };
    const adapter = createPiLikeAdapter(piApi, {});
    adapter.on("before_agent_start", async (ctx: any) => {
      ctx.systemPrompt = (ctx.systemPrompt ?? "") + "\nmore";
    });
    const piHandler = (piApi.on as any).mock.calls[0][1];
    const result = await piHandler({ type: "before_agent_start", prompt: "u", systemPrompt: "base" }, {});
    expect(result?.systemPrompt).toBe("base\nmore");
  });

  it("context adapter passes messages array to extension and returns updated list", async () => {
    const piApi = { registerTool: vi.fn(), on: vi.fn() };
    const adapter = createPiLikeAdapter(piApi, {});
    adapter.on("context", async (msgs: any[], _ctx: any) => {
      msgs.push({ role: "system", content: "fresh" });
    });
    const piHandler = (piApi.on as any).mock.calls[0][1];
    const result = await piHandler({ type: "context", messages: [{ role: "user", content: "hi" }] }, {});
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toEqual({ role: "system", content: "fresh" });
  });

  it("session_before_compact adapter invokes extension but returns inert result (Pi 0.70 known gap)", async () => {
    const piApi = { registerTool: vi.fn(), on: vi.fn() };
    const adapter = createPiLikeAdapter(piApi, {});
    let invoked = false;
    adapter.on("session_before_compact", async (msgs: any[], _ctx: any) => {
      invoked = true;
      return msgs.slice(0, 1);
    });
    const piHandler = (piApi.on as any).mock.calls[0][1];
    const result = await piHandler({ type: "session_before_compact", branchEntries: [{}, {}, {}], preparation: {}, signal: new AbortController().signal }, {});
    expect(invoked).toBe(true);
    expect(result).toBeUndefined();
  });

  it("session.metadata bag is shared across all on(tool_call) handlers (cross-extension state)", async () => {
    const piApi = { registerTool: vi.fn(), on: vi.fn() };
    const meta: any = { stage: "Frame" };
    const adapter = createPiLikeAdapter(piApi, meta);
    let observed: any = null;
    adapter.on("tool_call", async (_event: any, ctx: any) => {
      ctx.session.metadata.lastDecision = "BUY";
      observed = ctx.session.metadata;
    });
    const piHandler = (piApi.on as any).mock.calls[0][1];
    await piHandler({ toolName: "x", input: {} }, { signal: new AbortController().signal, abort: vi.fn() });
    expect(observed.lastDecision).toBe("BUY");
    expect(meta.lastDecision).toBe("BUY");   // shared reference
  });
});
