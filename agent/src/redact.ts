/**
 * Per-visibility-level event redaction + tool-call summarization.
 *
 * Pi-migration Wave G Task 3.
 *
 *  - `redactForVisibility(event, level)` trims an event payload to the
 *    customer's configured visibility level. Sensitive payload keys
 *    (private keys, signed transactions, API tokens, etc.) are stripped
 *    at every level — even at 'full', the customer never sees their
 *    own signer key in the SSE stream.
 *
 *  - `summarizeToolCall(tool, params)` produces a human-readable
 *    one-liner for the SSE stream's `summary` field. Used by `up-sse`
 *    (Task 4) so the customer's UI can render "buy $200 MUM" instead
 *    of `polypi_create_order { ... raw json ... }`.
 */
import type { JobEvent } from "./redpanda";

export type VisibilityLevel = "summary" | "detail" | "full";

const SENSITIVE_KEYS = new Set([
  "signer_priv_key",
  "private_key",
  "privkey",
  "signed_tx",
  "signature",
  "api_key",
  "auth_token",
  "session_token",
  "password",
  "secret",
]);

export function redactForVisibility(
  event: JobEvent,
  level: VisibilityLevel,
): JobEvent {
  if (level === "summary") {
    return {
      ts: event.ts,
      type: event.type,
      decision: event.decision,
      market_id: event.market_id,
      stage:
        event.type === "decision" || event.type === "stage_advance"
          ? event.stage
          : undefined,
    };
  }
  if (level === "detail") {
    return {
      ts: event.ts,
      type: event.type,
      stage: event.stage,
      tool: event.tool,
      summary: event.summary,
      decision: event.decision,
      market_id: event.market_id,
    };
  }
  // full: scrub sensitive payload keys, keep the rest
  const cleanedPayload = event.payload ? scrubSensitive(event.payload) : undefined;
  return { ...event, payload: cleanedPayload };
}

function scrubSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = scrubSensitive(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function summarizeToolCall(
  tool: string,
  params: Record<string, unknown> | undefined,
): string {
  const p = params ?? {};
  switch (tool) {
    case "discovery_find_markets":          return `searching markets`;
    case "discovery_get_market":            return `fetching market ${p.market_id ?? "?"}`;
    case "snapshot_get_top_of_book":        return `reading TOB for ${p.asset_id ?? "?"}`;
    case "history_get_price_candles":       return `loading ${p.bucket ?? "?"} candles for ${p.asset_id ?? "?"}`;
    case "whale_top_holders":               return `inspecting top holders of ${p.market_id ?? "?"}`;
    case "decide_score_market_efficiency":  return `scoring market ${p.market_id ?? "?"}`;
    case "polypi_estimate_slippage":        return `estimating slippage on ${p.market_id ?? "?"}`;
    case "polypi_create_order":             return `${p.side ?? "?"} $${p.size_usd ?? "?"} ${p.market_id ?? "?"}`;
    case "agent_findings_write":            return `recording decision: ${p.decision ?? "?"}`;
    default:                                return tool;
  }
}
