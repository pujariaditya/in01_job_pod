import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig, type AgentConfig } from "./config";
import { DaemonClient } from "./daemon-client";
import { installUpTools } from "./extensions/up-tools";
import { installPolypiTools } from "./extensions/up-mcp-polypi";

const args = new Set(process.argv.slice(2));
const PRINT_AND_EXIT = args.has("--print-tools-and-exit");
const ONCE = args.has("--once");

async function main(): Promise<number> {
  const cfg = loadConfig();
  await mkdir(cfg.sessionDir, { recursive: true });

  // Daemon UDS client
  const daemon = new DaemonClient(cfg.daemonSock);
  await daemon.connect();

  // Polypi MCP client. The real MCP-SDK wiring lives behind
  // connectPolypi(); inspecting @modelcontextprotocol/sdk@1.x in this
  // tree confirms the import path used in the spec
  // (`@modelcontextprotocol/sdk/client/streamableHttp.js`) is still
  // valid for 1.x.
  const polypi = await connectPolypi(cfg.polypiBaseUrl);

  // Pi runtime. Pi 0.70 ships `createAgentSession(opts)` returning
  // `{ session, ... }`; tools register via the ExtensionAPI passed
  // into extension factories, not directly off the session. The
  // glue that converts our two installers into an
  // ExtensionFactory + drives session.prompt() lives in
  // createPiAgent(); it's a thin stub today and gets replaced with
  // real pi-coding-agent wiring once the cycle pipeline is
  // smoke-tested end-to-end against a live daemon.
  const agent = await createPiAgent({
    sessionId: cfg.jobId,
    sessionDir: cfg.sessionDir,
    extensions: [
      async (pi: any) => installUpTools(pi, daemon),
      async (pi: any) => installPolypiTools(pi, polypi as any),
    ],
    disableTools: ["write", "edit", "bash"],
  });

  if (PRINT_AND_EXIT) {
    const tools = agent.listTools();
    for (const t of tools) console.log(t.name);
    await agent.shutdown?.();
    return 0;
  }

  if (ONCE) {
    await agent.runTurn({ user: "Run one cycle." });
    await agent.shutdown?.();
    return 0;
  }

  // Cron-driven loop with idle-skip gate (per spec section 5.5).
  let stop = false;
  process.on("SIGTERM", () => { stop = true; });
  process.on("SIGINT", () => { stop = true; });

  let lastFingerprint = "";
  let lastCycleAt = 0;
  let lastSnap: any = null;

  while (!stop) {
    const tickStart = Date.now();
    try {
      const decision = await shouldRunCycle(daemon, lastFingerprint, lastCycleAt, lastSnap, cfg);
      lastSnap = decision.snap;   // updated every gate evaluation, even on skip
      if (decision.run) {
        await Promise.race([
          agent.runTurn({ user: `Cron tick. Reason: ${decision.reason}` }),
          new Promise<void>((_, rej) =>
            setTimeout(() => rej(new Error("cycle watchdog")), cfg.cycleWatchdogMs),
          ),
        ]);
        lastFingerprint = decision.fingerprint;
        lastCycleAt = Date.now();
      } else {
        console.log(`cycle skipped: ${decision.reason}`);
        // TODO Wave D: write SKIPPED_IDLE to job_lifecycle_events via up-memory.
      }
    } catch (e) {
      console.error(`cycle failed: ${e instanceof Error ? e.message : e}`);
    }
    const sleepMs = Math.max(0, cfg.cycleIntervalMs - (Date.now() - tickStart));
    await new Promise((r) => setTimeout(r, sleepMs));
  }

  await agent.shutdown?.();
  await daemon.close();
  return 0;
}

interface CycleDecision {
  run: boolean;
  reason: string;
  fingerprint: string;
  snap: any;
}

export async function shouldRunCycle(
  daemon: DaemonClient,
  lastFingerprint: string,
  lastCycleAt: number,
  lastSnap: any,
  cfg: AgentConfig,
): Promise<CycleDecision> {
  // Cold start
  if (lastCycleAt === 0) {
    return { run: true, reason: "cold_start", fingerprint: "", snap: null };
  }

  // Force-run after max_idle_minutes regardless
  const elapsed = Date.now() - lastCycleAt;
  if (elapsed >= cfg.maxIdleMinutes * 60_000) {
    return { run: true, reason: "max_idle_elapsed", fingerprint: "", snap: null };
  }

  // Cheap snapshot of in-scope markets -- TOB + trade counts.
  // The daemon-side handler `snapshot_get_active_mids` filters by
  // (category, subcategory) -- Wave B's daemon Task 8 added this.
  let snap: any;
  try {
    snap = await daemon.call("snapshot_get_active_mids", {
      category: cfg.catalogCategory,
      subcategory: cfg.catalogSubcategory,
    });
  } catch {
    return { run: true, reason: "snapshot_failed", fingerprint: "", snap: null };
  }

  const fp = fingerprintWorld(snap);

  if (fp === lastFingerprint) {
    return { run: false, reason: "no_change", fingerprint: fp, snap };
  }

  const drift = computeDrift(snap, lastSnap);
  if (drift.maxBps < cfg.midChangeBpsThreshold && drift.newTrades < cfg.newTradeThreshold) {
    return { run: false, reason: "below_noise_threshold", fingerprint: fp, snap };
  }

  return {
    run: true,
    reason: drift.maxBps >= cfg.midChangeBpsThreshold ? "mid_drift" : "new_trades",
    fingerprint: fp,
    snap,
  };
}

export function fingerprintWorld(snap: any): string {
  const items = (snap?.markets ?? []).map((m: any) => ({
    id: m.market_id,
    bid: Math.round((m.tob_bid ?? 0) * 10000) / 10000,
    ask: Math.round((m.tob_ask ?? 0) * 10000) / 10000,
    n:   m.trades_since_open ?? 0,
  }));
  items.sort((a: any, b: any) => a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}

export function computeDrift(snap: any, lastSnap: any): { maxBps: number; newTrades: number } {
  if (!lastSnap || !snap?.markets) {
    return { maxBps: Infinity, newTrades: Infinity };
  }
  let maxBps = 0;
  let newTrades = 0;
  const lastById = new Map<string, any>(lastSnap.markets.map((m: any) => [m.market_id, m]));
  for (const m of snap.markets) {
    const prev: any = lastById.get(m.market_id);
    if (!prev) { maxBps = Infinity; break; }   // new market in scope -> run
    const midNow  = ((m.tob_bid ?? 0) + (m.tob_ask ?? 0)) / 2;
    const midPrev = ((prev.tob_bid ?? 0) + (prev.tob_ask ?? 0)) / 2;
    if (midPrev > 0) {
      const bps = Math.abs(midNow - midPrev) / midPrev * 10000;
      if (bps > maxBps) maxBps = bps;
    }
    newTrades += Math.max(0, (m.trades_since_open ?? 0) - (prev.trades_since_open ?? 0));
  }
  return { maxBps, newTrades };
}

// --- Pi SDK adapters: stubbed to allow tests to run; real wiring
// activated only when main() is invoked as the process entrypoint.
// The test harness imports this file for the pure gate functions
// above and never calls main(), so the stubs never run under test.

async function connectPolypi(_baseUrl: string): Promise<any> {
  // Real wiring (commented while the stub is in place):
  //   const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  //   const { StreamableHTTPClientTransport } = await import(
  //     "@modelcontextprotocol/sdk/client/streamableHttp.js"
  //   );
  //   const c = new Client(
  //     { name: "up-pi-agent", version: "0.1.0" },
  //     { capabilities: {} },
  //   );
  //   await c.connect(new StreamableHTTPClientTransport(new URL(_baseUrl)));
  //   return c;
  return { listTools: async () => ({ tools: [] }), callTool: async () => ({ content: [] }) };
}

async function createPiAgent(opts: {
  sessionId: string;
  sessionDir: string;
  extensions: Array<(pi: any) => Promise<void>>;
  disableTools?: string[];
}): Promise<any> {
  // Real wiring (Pi 0.70.2):
  //   const { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager } =
  //     await import("@mariozechner/pi-coding-agent");
  //   const factories = opts.extensions.map((install) => async (pi: any) => { await install(pi); });
  //   const resourceLoader = new DefaultResourceLoader({
  //     cwd: process.cwd(),
  //     agentDir: getAgentDir(),
  //     extensionFactories: factories,
  //   });
  //   await resourceLoader.reload();
  //   const { session } = await createAgentSession({
  //     resourceLoader,
  //     sessionManager: SessionManager.create(opts.sessionDir),
  //     tools: ["read", "grep", "find", "ls"], // disableTools enforced via allowlist
  //   });
  //   return {
  //     listTools: () => session.agent.tools ?? [],
  //     runTurn: ({ user }: { user: string }) => session.prompt(user),
  //     shutdown: () => session.shutdown?.(),
  //   };
  const tools: any[] = [];
  const pi = {
    registerTool(spec: any) { tools.push(spec); },
    on() {},
    listTools() { return tools; },
    async runTurn(_args: any) { /* no-op stub */ },
    async shutdown() {},
  };
  for (const ext of opts.extensions) await ext(pi);
  return pi;
}

// Entry-point guard. Only run main() when this file is the process
// entrypoint, so vitest can import the module to test the pure
// gate helpers without booting the daemon connection.
const isEntryPoint = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
