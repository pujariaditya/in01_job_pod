/**
 * Canonical agent decision enum: BUY / SELL / HOLD.
 *
 * Pi-migration Wave D Task 1.5 (job_pod half). Mirrors the customer_backend
 * `agent_findings.decision` CHECK constraint added in migration 0010.
 *
 * Per spec §5.5/§5.7/§12:
 *   - BUY  — Critique→Commit fires polypi.create_order (long).
 *   - SELL — Critique→Commit fires polypi.create_order (close / short).
 *   - HOLD — cycle ends at Critique with no polypi call.
 *
 * Validate every agent output before it lands in the agent_findings_write
 * tool call; the DB-level CHECK is the belt, this is the suspenders.
 */
export type Decision = "BUY" | "SELL" | "HOLD";

const VALID: ReadonlySet<Decision> = new Set(["BUY", "SELL", "HOLD"]);

export function isDecision(v: unknown): v is Decision {
  return typeof v === "string" && (VALID as ReadonlySet<string>).has(v);
}

export function parseDecision(v: unknown): Decision {
  if (!isDecision(v)) {
    throw new Error(`invalid decision ${JSON.stringify(v)}; must be BUY, SELL, or HOLD`);
  }
  return v;
}

/** BUY and SELL must reach the Commit stage (polypi.create_order). HOLD does not. */
export function requiresCommit(d: Decision): boolean {
  return d === "BUY" || d === "SELL";
}
