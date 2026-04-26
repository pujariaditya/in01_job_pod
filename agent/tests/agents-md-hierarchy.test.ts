import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_AGENTS = join(__dirname, "..", "..", ".pi", "AGENTS.md");

describe("AGENTS.md hierarchy", () => {
  it("project-level AGENTS.md exists and declares stage allowlists", () => {
    expect(existsSync(PROJECT_AGENTS)).toBe(true);
    const body = readFileSync(PROJECT_AGENTS, "utf-8");
    expect(body).toContain("Stage allowlists");
    expect(body).toContain("polypi_create_order");
  });

  it("documents BUY/SELL/HOLD enum and HOLD-ends-cycle rule", () => {
    const body = readFileSync(PROJECT_AGENTS, "utf-8");
    expect(body).toContain("BUY");
    expect(body).toContain("SELL");
    expect(body).toContain("HOLD");
    expect(body).toMatch(/HOLD`?\s+ends the cycle/i);
  });

  it("global baseline contains no customer-specific info", () => {
    const body = readFileSync(PROJECT_AGENTS, "utf-8");
    expect(body).not.toMatch(/customer_id:\s*\w+/);
    expect(body).not.toMatch(/risk_profile:/);
  });
});
