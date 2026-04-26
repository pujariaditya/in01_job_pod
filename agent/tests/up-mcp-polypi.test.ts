import { describe, it, expect, vi } from "vitest";
import { installPolypiTools } from "../src/extensions/up-mcp-polypi";

describe("up-mcp-polypi extension", () => {
  it("registers each polypi tool as a Pi tool", async () => {
    const mcpClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: "polypi_create_order",
            description: "Submit signed order",
            inputSchema: {
              type: "object",
              properties: { market_id: { type: "string" }, size_usd: { type: "number" } },
              required: ["market_id", "size_usd"],
            },
          },
          {
            name: "polypi_estimate_slippage",
            description: "",
            inputSchema: { type: "object", properties: {}, required: [] },
          },
        ],
      }),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: '{"ok":true}' }] }),
    };
    const registered: any[] = [];
    const pi = { registerTool: (s: any) => registered.push(s), on: vi.fn() };

    await installPolypiTools(pi as any, mcpClient as any);

    expect(registered.map((r) => r.name).sort()).toEqual([
      "polypi_create_order",
      "polypi_estimate_slippage",
    ]);
  });

  it("forwards tool calls to MCP client with correct args", async () => {
    let handler: any;
    const mcpClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [{
          name: "polypi_estimate_slippage",
          description: "",
          inputSchema: { type: "object", properties: { x: { type: "number" } }, required: [] },
        }],
      }),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"slippage_bps":12}' }],
      }),
    };
    const pi = { registerTool: (s: any) => { handler = s; }, on: vi.fn() };
    await installPolypiTools(pi as any, mcpClient as any);
    const r = await handler.execute("c1", { x: 1 }, new AbortController().signal, () => {}, {});
    expect(r.content[0].text).toContain("slippage_bps");
    expect(mcpClient.callTool).toHaveBeenCalledWith({
      name: "polypi_estimate_slippage",
      arguments: { x: 1 },
    });
  });
});
