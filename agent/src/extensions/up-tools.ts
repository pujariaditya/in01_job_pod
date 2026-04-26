import type { TSchema } from "@sinclair/typebox";
import type { DaemonClient } from "../daemon-client";
import { jsonSchemaToTypebox } from "../schema-convert";

interface ManifestEntry {
  name: string;
  description: string;
  params_schema: any;
}

interface Manifest {
  version: number;
  tools: ManifestEntry[];
}

/**
 * Tool result envelope produced by up-tools and up-mcp-polypi.
 *
 * Shape mirrors MCP's CallToolResult and Pi's AgentToolResult: `content`
 * is a list of text/image parts the LLM sees, `isError` flags failures
 * (Pi's afterToolCall hook respects this), and `details` is opaque
 * structured data for logs/UI. Keeping all three lets the same envelope
 * flow through both Pi (which requires `details`) and the spec's tests
 * (which assert on `isError`).
 */
export interface UpToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  details?: unknown;
}

/**
 * Structural Pi-like surface. The real Pi 0.70 ExtensionAPI is a much
 * wider interface — we depend only on the two methods we use, so
 * up-tools and up-mcp-polypi stay testable with plain mocks and don't
 * have to import Pi-internal types.
 */
export interface PiLike {
  registerTool(spec: {
    name: string;
    label?: string;
    description: string;
    parameters: TSchema;
    execute: (
      callId: string,
      params: unknown,
      signal: AbortSignal,
      onUpdate: (chunk: unknown) => void,
      ctx: unknown,
    ) => Promise<UpToolResult>;
  }): void;
  on(event: string, fn: (...args: any[]) => any): void;
}

/**
 * Fetch the daemon manifest and register every tool with Pi.
 *
 * Each registered tool is a thin proxy: typebox-validated input goes to the
 * daemon over UDS; the daemon's JSON result is wrapped as a Pi tool result.
 */
export async function installUpTools(
  pi: PiLike,
  client: DaemonClient,
): Promise<void> {
  const manifest = (await client.call("_manifest", {})) as unknown as Manifest;
  for (const tool of manifest.tools) {
    const params: TSchema = jsonSchemaToTypebox(tool.params_schema);
    pi.registerTool({
      name: tool.name,
      label: tool.name.replace(/_/g, " "),
      description: tool.description || tool.name,
      parameters: params,
      async execute(_callId, callParams, signal): Promise<UpToolResult> {
        try {
          const result = await client.call(
            tool.name,
            callParams as Record<string, unknown>,
            { signal },
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
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
