import type { PiLike, UpToolResult } from "./up-tools";
import { POLYPI_TOOLS, type PolypiToolDef } from "./up-polypi-tools";

const RETRY_BACKOFF_MS = 250;

/**
 * Register all 17 polypi tools with Pi as raw HTTP proxies.
 *
 * Zero-MCP Part A Task 7. Replaces up-mcp-polypi.ts (which used the
 * MCP SDK's Streamable HTTP transport). Each registered tool POSTs
 * a JSON body to `<baseUrl>/v1/<service>/<verb>` per the polypi v1
 * HTTP API. Retries once on 5xx + network errors; 4xx errors and
 * abort signals propagate immediately.
 */
export async function installPolypiTools(
  pi: PiLike,
  baseUrl: string,
): Promise<void> {
  for (const tool of POLYPI_TOOLS) {
    pi.registerTool({
      name: tool.name,
      label: tool.name.replace(/_/g, " "),
      description: tool.description,
      parameters: tool.parameters,
      async execute(_id, args, signal): Promise<UpToolResult> {
        return callPolypi(baseUrl, tool, args as Record<string, unknown>, signal);
      },
    });
  }
}

async function callPolypi(
  baseUrl: string,
  tool: PolypiToolDef,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<UpToolResult> {
  const url = baseUrl.replace(/\/$/, "") + tool.endpoint;
  const reqInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  };

  // First attempt
  const first = await safeFetch(url, reqInit);
  if (first.kind === "ok") return wrapOk(first.body);
  if (first.kind === "abort") return wrapErr("aborted");
  if (first.kind === "client_error") return wrapErr(first.body);

  // 5xx or network — wait + retry once
  await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
  if (signal.aborted) return wrapErr("aborted");
  const second = await safeFetch(url, reqInit);
  if (second.kind === "ok") return wrapOk(second.body);
  if (second.kind === "abort") return wrapErr("aborted");
  if (second.kind === "client_error") return wrapErr(second.body);
  return wrapErr(second.body || "polypi unreachable");
}

type FetchOutcome =
  | { kind: "ok"; body: string }
  | { kind: "client_error"; body: string }   // 4xx — don't retry
  | { kind: "server_error"; body: string }   // 5xx — retry
  | { kind: "network_error"; body: string }  // fetch threw — retry
  | { kind: "abort"; body: string };

async function safeFetch(url: string, init: RequestInit): Promise<FetchOutcome> {
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch (e: any) {
    if (e?.name === "AbortError") return { kind: "abort", body: String(e?.message ?? e) };
    return { kind: "network_error", body: String(e?.message ?? e) };
  }
  const text = await resp.text();
  if (resp.ok) return { kind: "ok", body: text };
  if (resp.status >= 400 && resp.status < 500) return { kind: "client_error", body: text };
  return { kind: "server_error", body: text };
}

function wrapOk(body: string): UpToolResult {
  return { content: [{ type: "text", text: body }] };
}

function wrapErr(body: string): UpToolResult {
  return { content: [{ type: "text", text: body }], isError: true };
}
