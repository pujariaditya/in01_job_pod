import type { TSchema } from "@sinclair/typebox";
import { jsonSchemaToTypebox } from "../schema-convert";
import type { PiLike, UpToolResult } from "./up-tools";

interface MCPToolList {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
}

/**
 * Structural MCP-client surface. The real client is
 * `Client` from @modelcontextprotocol/sdk; we depend only on the two
 * methods we use so this extension stays unit-testable with a plain
 * mock and decoupled from MCP-SDK version churn.
 */
export interface MCPClientLike {
  listTools(): Promise<MCPToolList>;
  callTool(args: { name: string; arguments: Record<string, unknown> }): Promise<{
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }>;
}

/**
 * Discover polypi MCP tools and register each as a Pi tool.
 *
 * polypi (separate repo, AWS Lambda, signer-bound) stays MCP per spec
 * §3 because it is the only remote, signed trade-execution surface.
 * This wrapper preserves MCP's content envelope (text parts +
 * isError) so polypi errors propagate cleanly to Pi's tool-result
 * handling.
 */
export async function installPolypiTools(
  pi: PiLike,
  mcpClient: MCPClientLike,
): Promise<void> {
  const list = await mcpClient.listTools();
  for (const tool of list.tools) {
    const params: TSchema = jsonSchemaToTypebox(tool.inputSchema);
    pi.registerTool({
      name: tool.name,
      label: tool.name.replace(/_/g, " "),
      description: tool.description ?? tool.name,
      parameters: params,
      async execute(_callId, args, signal): Promise<UpToolResult> {
        if (signal.aborted) {
          return {
            content: [{ type: "text", text: "aborted" }],
            isError: true,
            details: { error: "aborted" },
          };
        }
        try {
          const r = await mcpClient.callTool({
            name: tool.name,
            arguments: args as Record<string, unknown>,
          });
          return {
            content: r.content,
            isError: r.isError,
            details: r,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text", text: msg }],
            isError: true,
            details: { error: msg },
          };
        }
      },
    });
  }
}
