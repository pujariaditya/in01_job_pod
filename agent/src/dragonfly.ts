/**
 * Module-singleton wrapper around ioredis Redis (Dragonfly-compatible).
 *
 * Pi-migration Wave D Task 2. Used by Wave D extensions that hit the
 * pod-local Dragonfly cache (kill-switch flag, cycle stats, etc.).
 * DRAGONFLY_URL defaults to redis://dragonfly:6379 — the per-pod
 * Dragonfly s6 service inside the Pi job_pod image.
 */
import { Redis } from "ioredis";

let client: Redis | null = null;

export function getDragonfly(): Redis {
  if (!client) {
    client = new Redis(process.env.DRAGONFLY_URL ?? "redis://dragonfly:6379");
  }
  return client;
}

export async function closeDragonfly(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
