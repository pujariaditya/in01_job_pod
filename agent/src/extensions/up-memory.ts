/**
 * up-memory extension — durable state load + tool_call logging + context
 * injection + JSONL compaction policy.
 *
 * Pi-migration Wave D Task 5. Wires customer_db's durable agent state
 * (skill_posteriors, agent_findings, agent_skills_log) into the Pi
 * session lifecycle through four hooks, per spec §4.3/§5.5/§5.8:
 *
 *   1. before_agent_start — top-10 skill posteriors + open positions are
 *      appended to the system prompt so the agent starts each cycle with
 *      the customer's accumulated learning context.
 *   2. tool_call — every `skill:<name>` invocation is persisted to
 *      agent_skills_log; agent_findings_write calls have their decision
 *      validated against {BUY, SELL, HOLD} and captured into
 *      session.metadata.lastDecision (consumed by the up-stage gate).
 *   3. context — a fresh top-of-book snapshot is injected as an
 *      ephemeral system message so it is shown to the model but not
 *      persisted into the JSONL transcript.
 *   4. session_before_compact — order/decide/polypi tool entries (anything
 *      that affects trades) are preserved verbatim; everything else is
 *      summarised by count.
 */
import type { Pool } from "pg";
import type { PiLike } from "./up-tools";
import { isDecision } from "../decision";

export interface UpMemoryOptions {
  pool: Pool;
  snapshotProvider: (jobId: string) => Promise<{ tob_bid: number; tob_ask: number; ts?: string }>;
  customerId: string;
  jobId: string;
}

const PRESERVE_PREFIXES = ["decide_", "polypi_", "order_"];

export async function installUpMemory(
  pi: PiLike,
  opts: UpMemoryOptions,
): Promise<void> {
  // 1. before_agent_start — load durable state into the system prompt.
  pi.on("before_agent_start", async (ctx: any) => {
    const posteriors = await opts.pool.query(
      "SELECT skill_name, alpha, beta, observation_count " +
      "FROM skill_posteriors WHERE customer_id = $1 " +
      "ORDER BY observation_count DESC LIMIT 10",
      [opts.customerId],
    );
    const positions = await opts.pool.query(
      "SELECT trade_id, market_id, side, size_usd " +
      "FROM agent_findings WHERE job_id = $1 AND outcome = 'pending' " +
      "ORDER BY id DESC LIMIT 20",
      [opts.jobId],
    );
    const lines: string[] = [];
    lines.push("# Durable state");
    lines.push("\n## Skill posteriors (top 10 by observation count):");
    for (const r of posteriors.rows) {
      const wr = r.alpha / (r.alpha + r.beta);
      lines.push(`- ${r.skill_name}: alpha=${r.alpha} beta=${r.beta} n=${r.observation_count} estimated win rate ${(wr * 100).toFixed(1)}%`);
    }
    lines.push("\n## Open positions (pending resolution):");
    for (const p of positions.rows) {
      lines.push(`- ${p.trade_id} ${p.market_id} ${p.side} $${p.size_usd}`);
    }
    ctx.systemPrompt = (ctx.systemPrompt ?? "") + "\n\n" + lines.join("\n");
  });

  // 2. tool_call — log skill invocations, validate + capture decisions.
  pi.on("tool_call", async (event: any, ctx: any) => {
    if (typeof event.tool === "string" && event.tool.startsWith("skill:")) {
      const skill = event.tool.slice("skill:".length);
      await opts.pool.query(
        "INSERT INTO agent_skills_log " +
        "(customer_id, job_id, skill_name, market_id, params, outcome) " +
        "VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')",
        [
          opts.customerId, opts.jobId, skill,
          event.params?.market_id ?? null,
          JSON.stringify(event.params ?? {}),
        ],
      );
    } else if (event.tool === "agent_findings_write") {
      const dec = event.params?.decision;
      if (!isDecision(dec)) {
        return {
          allow: false,
          reason: `agent_findings_write requires decision ∈ {BUY, SELL, HOLD}; got ${JSON.stringify(dec)}`,
        };
      }
      ctx.session.metadata.lastDecision = dec;
    }
  });

  // 3. context — inject a fresh top-of-book snapshot. Ephemeral so it is
  //    visible to the model but does not bloat the JSONL transcript.
  pi.on("context", async (msgs: any[], _ctx: any) => {
    try {
      const snap = await opts.snapshotProvider(opts.jobId);
      msgs.push({
        role: "system",
        content: `Fresh TOB: bid=${snap.tob_bid} ask=${snap.tob_ask}${snap.ts ? ` @ ${snap.ts}` : ""}`,
        ephemeral: true,
      });
    } catch (_e) {
      // Non-fatal: agent continues without fresh injection.
    }
  });

  // 4. session_before_compact — preserve trade-affecting entries verbatim,
  //    summarise the rest by count.
  pi.on("session_before_compact", async (msgs: any[], _ctx: any): Promise<any[]> => {
    const preserve: any[] = [];
    const summarisable: any[] = [];
    for (const m of msgs) {
      const name = typeof m.name === "string" ? m.name : "";
      if (m.role === "tool" && PRESERVE_PREFIXES.some((p) => name.startsWith(p))) {
        preserve.push(m);
      } else if (typeof m.content === "string" && /\b(price|size|market_id|trade_id)\b/i.test(m.content)) {
        preserve.push(m);
      } else {
        summarisable.push(m);
      }
    }
    return [
      ...preserve,
      ...(summarisable.length
        ? [{ role: "system", content: `[${summarisable.length} non-trade entries elided by up-memory compaction]` }]
        : []),
    ];
  });
}
