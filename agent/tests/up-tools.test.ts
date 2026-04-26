import { describe, it, expect, vi } from "vitest";
import { installUpTools } from "../src/extensions/up-tools";

describe("up-tools extension", () => {
  it("calls registerTool for every manifest entry", async () => {
    const mockClient = {
      connect: vi.fn(),
      call: vi.fn().mockResolvedValue({
        version: 1,
        tools: [
          {
            name: "discovery_find_markets",
            description: "List markets",
            params_schema: {
              type: "object",
              properties: { limit: { type: "integer", minimum: 1 } },
              required: ["limit"],
            },
          },
          {
            name: "snapshot_get_top_of_book",
            description: "Get TOB",
            params_schema: {
              type: "object",
              properties: { asset_id: { type: "string" } },
              required: ["asset_id"],
            },
          },
        ],
      }),
    };
    const registered: Array<{ name: string; description: string }> = [];
    const mockPi = {
      registerTool: vi.fn((spec: any) => {
        registered.push({ name: spec.name, description: spec.description });
      }),
      on: vi.fn(),
    };

    await installUpTools(mockPi as any, mockClient as any);

    expect(registered.map((r) => r.name).sort()).toEqual([
      "discovery_find_markets",
      "snapshot_get_top_of_book",
    ]);
  });

  it("forwards tool calls to the daemon and returns content envelope", async () => {
    let registeredHandler: any;
    const mockClient = {
      connect: vi.fn(),
      call: vi.fn(async (name: string, _params: any) => {
        if (name === "_manifest") {
          return {
            version: 1,
            tools: [
              {
                name: "discovery_find_markets",
                description: "",
                params_schema: { type: "object", properties: {}, required: [] },
              },
            ],
          };
        }
        return { markets: [{ id: "m1" }] };
      }),
    };
    const mockPi = {
      registerTool: (spec: any) => { registeredHandler = spec; },
      on: vi.fn(),
    };

    await installUpTools(mockPi as any, mockClient as any);
    const result = await registeredHandler.execute("call1", {}, new AbortController().signal, () => {}, {});
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.markets[0].id).toBe("m1");
  });

  it("returns isError on daemon error", async () => {
    let registeredHandler: any;
    const mockClient = {
      connect: vi.fn(),
      call: vi.fn(async (name: string) => {
        if (name === "_manifest") {
          return {
            version: 1,
            tools: [{ name: "boom", description: "", params_schema: { type: "object", properties: {}, required: [] } }],
          };
        }
        const err = new Error("daemon error: HANDLER_ERROR: kaboom");
        (err as any).code = "HANDLER_ERROR";
        throw err;
      }),
    };
    const mockPi = { registerTool: (s: any) => { registeredHandler = s; }, on: vi.fn() };
    await installUpTools(mockPi as any, mockClient as any);
    const result = await registeredHandler.execute("c1", {}, new AbortController().signal, () => {}, {});
    expect(result.isError).toBe(true);
  });
});
