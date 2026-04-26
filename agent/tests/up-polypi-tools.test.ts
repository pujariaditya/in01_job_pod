import { describe, it, expect } from "vitest";
import { POLYPI_TOOLS } from "../src/extensions/up-polypi-tools";

describe("POLYPI_TOOLS catalog", () => {
  it("has exactly 17 tools (8 account + 9 order)", () => {
    expect(POLYPI_TOOLS).toHaveLength(17);
    const accountCount = POLYPI_TOOLS.filter((t) => t.endpoint.startsWith("/v1/account/")).length;
    const orderCount = POLYPI_TOOLS.filter((t) => t.endpoint.startsWith("/v1/order/")).length;
    expect(accountCount).toBe(8);
    expect(orderCount).toBe(9);
  });

  it("every tool name follows polypi_<service>_<verb> convention", () => {
    for (const t of POLYPI_TOOLS) {
      expect(t.name).toMatch(/^polypi_(account|order)_[a-z][a-z0-9_]+$/);
    }
  });

  it("every tool's endpoint matches its name (deterministic)", () => {
    for (const t of POLYPI_TOOLS) {
      const tail = t.name.slice("polypi_".length);
      const firstUnderscore = tail.indexOf("_");
      const service = tail.slice(0, firstUnderscore);
      const verb = tail.slice(firstUnderscore + 1);
      expect(t.endpoint).toBe(`/v1/${service}/${verb}`);
    }
  });

  it("every tool has a non-empty description", () => {
    for (const t of POLYPI_TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it("no duplicate names or endpoints", () => {
    const names = new Set(POLYPI_TOOLS.map((t) => t.name));
    const endpoints = new Set(POLYPI_TOOLS.map((t) => t.endpoint));
    expect(names.size).toBe(17);
    expect(endpoints.size).toBe(17);
  });
});
