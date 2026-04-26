/**
 * Module-singleton wrapper around pg.Pool.
 *
 * Pi-migration Wave D Task 2. Used by Wave D extensions that hit the
 * customer_backend Postgres for skill_posteriors / agent_findings /
 * job_lifecycle_events. DATABASE_URL is required at first call;
 * single pool with max=4 is sized for one job pod's expected concurrency
 * (Sense + Frame + Score + Decide are sequential within a cycle).
 */
import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL!,
      max: 4,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
