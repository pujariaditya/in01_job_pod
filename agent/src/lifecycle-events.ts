/**
 * Typed writer for the customer_backend `job_lifecycle_events` table.
 *
 * Pi-migration Wave D Task 3. Inserts a single row capturing one state
 * transition. The DB has a CHECK on `scope` (migration 0009); we mirror
 * the validation client-side so callers get a fast, descriptive error
 * before the network round-trip.
 *
 * Consumers (Wave D Tasks 4-6):
 *   - up-stage extension: Sense→Frame→Score→Decide→Critique→Commit transitions.
 *   - up-memory extension: job state changes (BOOTING→INGESTION_WARMING→...).
 *   - up-killswitch extension: KILL_SWITCH_TRIPPED → cycle paused.
 */
import type { Pool } from "pg";

export type LifecycleScope = "job" | "pod" | "market" | "skill" | "cycle";

export interface LifecycleEvent {
  customerId: string;
  jobId: string;
  scope: LifecycleScope;
  scopeRef?: string | null;
  fromState: string;
  toState: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

const VALID_SCOPES = new Set<LifecycleScope>(["job", "pod", "market", "skill", "cycle"]);

export async function writeLifecycleEvent(
  pool: Pool,
  ev: LifecycleEvent,
): Promise<void> {
  if (!VALID_SCOPES.has(ev.scope)) {
    throw new Error(`invalid lifecycle scope: ${ev.scope}`);
  }
  await pool.query(
    "INSERT INTO job_lifecycle_events " +
    "(customer_id, job_id, scope, scope_ref, from_state, to_state, reason, metadata) " +
    "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)",
    [
      ev.customerId, ev.jobId, ev.scope, ev.scopeRef ?? null,
      ev.fromState, ev.toState, ev.reason ?? null,
      JSON.stringify(ev.metadata ?? {}),
    ],
  );
}
