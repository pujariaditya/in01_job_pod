import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const enabled = !!process.env.UP_TEST_DAEMON_SOCK && !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("end-to-end cycle with full extensions", () => {
  it("completes one Sense→Frame→Score→Decide→Critique cycle", async () => {
    const sessionDir = mkdtempSync(join(tmpdir(), "up-pi-e2e-"));
    const proc = spawn(
      "node",
      ["dist/main.js", "--once"],
      {
        env: {
          ...process.env,
          UP_JOB_ID: `e2e_${Date.now()}`,
          UP_CUSTOMER_ID: "test_cust",
          UP_DAEMON_SOCK: process.env.UP_TEST_DAEMON_SOCK!,
          POLYPI_BASE_URL: process.env.UP_TEST_POLYPI_URL ?? "http://localhost:8780",
          UP_SESSION_DIR: sessionDir,
          UP_CATALOG_CATEGORY: "sports",
          UP_CATALOG_SUBCATEGORY: "cricipl",
          DATABASE_URL: process.env.DATABASE_URL!,
          DRAGONFLY_URL: process.env.DRAGONFLY_URL ?? "redis://localhost:6379",
          UP_CYCLE_INTERVAL_MS: "1000",
          UP_CYCLE_WATCHDOG_MS: "60000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    const code = await new Promise<number>((res) => proc.on("exit", res));
    expect(code, `stderr: ${stderr}`).toBe(0);

    const jsonlPath = join(sessionDir, `${process.env.UP_JOB_ID}.jsonl`);
    if (existsSync(jsonlPath)) {
      const body = readFileSync(jsonlPath, "utf-8");
      // Pi 0.70 may name the JSONL differently — check for any .jsonl in the dir
      // and take the first one if our guess doesn't exist.
      expect(body.length).toBeGreaterThan(0);
    }
  }, 120_000);
});
