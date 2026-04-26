/**
 * up-killswitch extension — admin-flippable kill switch via Dragonfly flag.
 *
 * Pi-migration Wave D Task 6. Per spec §7/§5.9.
 *
 * On every tool_call we read `killswitch:<job_id>` from Dragonfly. If
 * the flag is "1" or "true" we abort the in-flight call (signal.abort)
 * and refuse with `{allow:false}`. The first trip writes a
 * KILL_SWITCH_TRIPPED job-scoped lifecycle event; we suppress
 * subsequent writes while the flag remains set so the table is not
 * spammed. When the flag clears we write a single recovery event
 * (KILL_SWITCH_TRIPPED → ACTIVE) so the audit trail shows both edges.
 *
 * The pod itself stays running — the cycle inside the pod stops cleanly
 * without a process exit, so the admin can flip the flag back off and
 * resume without redeploying.
 */
import type { Redis } from "ioredis";
import type { PiLike } from "./up-tools";

export interface UpKillswitchOptions {
  dragonfly: Redis;
  lifecycleWriter: (ev: {
    customerId: string; jobId: string; scope: string;
    fromState: string; toState: string; reason?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void> | void;
  customerId: string;
  jobId: string;
}

export async function installUpKillswitch(
  pi: PiLike,
  opts: UpKillswitchOptions,
): Promise<void> {
  const flagKey = `killswitch:${opts.jobId}`;
  let lastState = false;

  pi.on("tool_call", async (event: any, ctx: any) => {
    const v = await opts.dragonfly.get(flagKey);
    const tripped = v === "1" || v === "true";
    if (tripped) {
      ctx.signal.abort?.(`kill switch active for job ${opts.jobId}`);
      if (!lastState) {
        await opts.lifecycleWriter({
          customerId: opts.customerId,
          jobId: opts.jobId,
          scope: "job",
          fromState: ctx.session.metadata.lastJobState ?? "ACTIVE",
          toState: "KILL_SWITCH_TRIPPED",
          reason: `tool ${event.tool} blocked`,
        });
        lastState = true;
      }
      return { allow: false, reason: "kill switch active" };
    } else if (lastState) {
      // Recovered — write one transition back to ACTIVE.
      await opts.lifecycleWriter({
        customerId: opts.customerId,
        jobId: opts.jobId,
        scope: "job",
        fromState: "KILL_SWITCH_TRIPPED",
        toState: "ACTIVE",
        reason: "kill switch cleared",
      });
      lastState = false;
    }
  });
}
