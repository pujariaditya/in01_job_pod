import { describe, it, expect, vi, beforeEach } from "vitest";
import { installUpMemory } from "../src/extensions/up-memory";

function makePi() {
  const handlers: Record<string, any[]> = {};
  return {
    on: (e: string, fn: any) => { (handlers[e] ??= []).push(fn); },
    registerTool: vi.fn(),
    _h: handlers,
  };
}

describe("up-memory extension", () => {
  let pool: any;
  let snapshotProvider: any;

  beforeEach(() => {
    pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    snapshotProvider = vi.fn().mockResolvedValue({ tob_bid: 0.42, tob_ask: 0.45 });
  });

  it("before_agent_start loads durable state into prompt", async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { skill_name: "zscore-mean-reversion", alpha: 5, beta: 3, observation_count: 8 },
    ]});
    pool.query.mockResolvedValueOnce({ rows: [
      { trade_id: "tx1", market_id: "m1", side: "buy", size_usd: 100 },
    ]});
    const pi = makePi();
    await installUpMemory(pi as any, { pool, snapshotProvider, customerId: "c1", jobId: "j1" });
    const ctx: any = { systemPrompt: "" };
    await pi._h.before_agent_start[0](ctx);
    expect(ctx.systemPrompt).toContain("zscore-mean-reversion");
    expect(ctx.systemPrompt).toContain("tx1");
  });

  it("tool_call writes a row to agent_skills_log when a skill is invoked", async () => {
    const pi = makePi();
    await installUpMemory(pi as any, { pool, snapshotProvider, customerId: "c1", jobId: "j1" });
    await pi._h.tool_call[0](
      { tool: "skill:zscore-mean-reversion", params: {} },
      { session: { metadata: { stage: "Frame" } } },
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO agent_skills_log"),
      expect.arrayContaining(["c1", "j1", "zscore-mean-reversion"]),
    );
  });

  it("tool_call captures lastDecision when agent_findings_write is called with BUY", async () => {
    const pi = makePi();
    await installUpMemory(pi as any, { pool, snapshotProvider, customerId: "c1", jobId: "j1" });
    const ctx: any = { session: { metadata: { stage: "Critique" } } };
    await pi._h.tool_call[0](
      { tool: "agent_findings_write", params: { decision: "BUY", market_id: "MUM" } },
      ctx,
    );
    expect(ctx.session.metadata.lastDecision).toBe("BUY");
  });

  it("tool_call rejects agent_findings_write with non-canonical decision", async () => {
    const pi = makePi();
    await installUpMemory(pi as any, { pool, snapshotProvider, customerId: "c1", jobId: "j1" });
    const ctx: any = { session: { metadata: { stage: "Critique" } } };
    const res = await pi._h.tool_call[0](
      { tool: "agent_findings_write", params: { decision: "buy" } },
      ctx,
    );
    expect(res?.allow).toBe(false);
  });

  it("context injects fresh book snapshot as ephemeral message", async () => {
    const pi = makePi();
    await installUpMemory(pi as any, { pool, snapshotProvider, customerId: "c1", jobId: "j1" });
    const msgs: any[] = [];
    const ctx: any = { jobId: "j1" };
    await pi._h.context[0](msgs, ctx);
    const ephemerals = msgs.filter((m) => m.ephemeral);
    expect(ephemerals.length).toBe(1);
    expect(ephemerals[0].content).toContain("0.42");
  });

  it("session_before_compact preserves order + decide tool entries", async () => {
    const pi = makePi();
    await installUpMemory(pi as any, { pool, snapshotProvider, customerId: "c1", jobId: "j1" });
    const msgs = [
      { role: "tool", name: "discovery_find_markets", content: "1" },
      { role: "tool", name: "decide_score_market_efficiency", content: "0.7" },
      { role: "tool", name: "polypi_create_order", content: "{tx:abc}" },
      { role: "tool", name: "snapshot_get_top_of_book", content: "tob" },
    ];
    const compacted = await pi._h.session_before_compact[0](msgs, {});
    const names = compacted.map((m: any) => m.name);
    expect(names).toContain("decide_score_market_efficiency");
    expect(names).toContain("polypi_create_order");
  });
});
