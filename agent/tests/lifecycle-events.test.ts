import { describe, it, expect, vi } from "vitest";
import { writeLifecycleEvent } from "../src/lifecycle-events";

describe("writeLifecycleEvent", () => {
  it("inserts a row with all fields", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as any;
    await writeLifecycleEvent(pool, {
      customerId: "c1",
      jobId: "j1",
      scope: "job",
      fromState: "BOOTING",
      toState: "INGESTION_WARMING",
      reason: "all healthy",
      metadata: { healthcheck_count: 5 },
    });
    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0]!;
    const sql = call[0];
    const args = call[1];
    expect(sql).toContain("INSERT INTO job_lifecycle_events");
    expect(args).toEqual([
      "c1", "j1", "job", null, "BOOTING", "INGESTION_WARMING",
      "all healthy", JSON.stringify({ healthcheck_count: 5 }),
    ]);
  });

  it("rejects unknown scope", async () => {
    const pool = { query: vi.fn() } as any;
    await expect(
      writeLifecycleEvent(pool, {
        customerId: "c1", jobId: "j1",
        scope: "wat" as any, fromState: "x", toState: "y",
      }),
    ).rejects.toThrow(/scope/);
  });
});
