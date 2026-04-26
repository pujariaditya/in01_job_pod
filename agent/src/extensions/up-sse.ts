/**
 * up-sse extension — publish redacted JobEvents to Redpanda.
 *
 * Pi-migration Wave G Task 4. Customer-facing visibility — hooks
 * `tool_call` + `agent_message` events, redacts to the customer's
 * configured `visibility_level` ('summary' | 'detail' | 'full'), and
 * publishes a JobEvent to Redpanda topic `job-events` via
 * JobEventProducer. customer_backend (Task 5) tails the same topic and
 * proxies events to the customer's browser as text/event-stream.
 *
 * Best-effort by design: hook errors are caught + logged so visibility
 * NEVER crashes the trading agent.
 */
import type { JobEventProducer, JobEvent } from "../redpanda";
import {
  redactForVisibility,
  summarizeToolCall,
  type VisibilityLevel,
} from "../redact";
import type { PiLike } from "./up-tools";

export interface UpSseOptions {
  producer: Pick<JobEventProducer, "publish">;
  visibilityLevel: VisibilityLevel;
}

export async function installUpSse(
  pi: PiLike,
  opts: UpSseOptions,
): Promise<void> {
  pi.on("tool_call", async (event: any, ctx: any) => {
    const stage = ctx.session?.metadata?.stage;
    try {
      const base: JobEvent = {
        ts: Date.now(),
        type: event.tool === "stage_advance" ? "stage_advance" : "tool_call",
        stage: event.tool === "stage_advance" ? event.params?.next : stage,
        tool: event.tool,
        summary: summarizeToolCall(event.tool, event.params),
        payload: event.params,
      };
      await opts.producer.publish(redactForVisibility(base, opts.visibilityLevel));

      if (event.tool === "agent_findings_write" && event.params?.decision) {
        const decisionEvent: JobEvent = {
          ts: Date.now(),
          type: "decision",
          stage,
          decision: event.params.decision,
          market_id: event.params.market_id,
          payload: event.params,
        };
        await opts.producer.publish(
          redactForVisibility(decisionEvent, opts.visibilityLevel),
        );
      }
    } catch (e) {
      console.error("up-sse hook failed:", e);
    }
  });

  pi.on("agent_message", async (msg: any, ctx: any) => {
    if (opts.visibilityLevel !== "full") return;
    try {
      const ev: JobEvent = {
        ts: Date.now(),
        type: "agent_message",
        stage: ctx.session?.metadata?.stage,
        summary: typeof msg.content === "string" ? msg.content.slice(0, 280) : "",
      };
      await opts.producer.publish(redactForVisibility(ev, opts.visibilityLevel));
    } catch (e) {
      console.error("up-sse agent_message hook failed:", e);
    }
  });
}
