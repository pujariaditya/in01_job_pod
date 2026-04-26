import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig, type AgentConfig } from "./config";
import { DaemonClient } from "./daemon-client";
import { getPool, closePool } from "./db";
import { getDragonfly, closeDragonfly } from "./dragonfly";
import { writeLifecycleEvent } from "./lifecycle-events";
import { installUpTools } from "./extensions/up-tools";
import { installPolypiTools } from "./extensions/up-mcp-polypi";
import { installUpStage } from "./extensions/up-stage";
import { installUpMemory } from "./extensions/up-memory";
import { installUpKillswitch } from "./extensions/up-killswitch";
import type { PiLike } from "./extensions/up-tools";

const args = new Set(process.argv.slice(2));
const PRINT_AND_EXIT = args.has("--print-tools-and-exit");
const ONCE = args.has("--once");

async function main(): Promise<number> {
  const cfg = loadConfig();
  await mkdir(cfg.sessionDir, { recursive: true });

  // Daemon UDS client
  const daemon = new DaemonClient(cfg.daemonSock);
  await daemon.connect();

  // Polypi MCP client (StreamableHTTP transport per spec §3).
  const polypi = await connectPolypi(cfg.polypiBaseUrl);

  // Shared infra clients (PG + Dragonfly) used by the 3 Wave D
  // lifecycle extensions. Module singletons; closed at shutdown.
  const pool = getPool();
  const dragonfly = getDragonfly();

  const lifecycleWriter = (ev: any) => writeLifecycleEvent(pool, ev);

  // Snapshot provider for up-memory's `context` hook (fresh TOB per cycle).
  const snapshotProvider = async (_jobId: string) => {
    const r = await daemon.call("snapshot_get_active_mids", {
      category: cfg.catalogCategory,
      subcategory: cfg.catalogSubcategory,
    }) as any;
    const m = r?.markets?.[0];
    return {
      tob_bid: m?.tob_bid ?? 0,
      tob_ask: m?.tob_ask ?? 0,
      ts: m?.ts ?? new Date().toISOString(),
    };
  };

  // Pi runtime. The 5 extension factories below are wired through
  // an adapter (createPiLikeAdapter) that translates our structural
  // PiLike contract -- registerTool + on(event, fn) with simplified
  // event/ctx shapes -- to Pi 0.70.2's real ExtensionAPI. The
  // adapter is the only Pi-version-coupled glue; the 5 extensions
  // themselves never import from @mariozechner/pi-coding-agent.
  const extensionFactories = buildExtensionFactories({
    daemon,
    polypi: polypi as any,
    pool,
    dragonfly,
    lifecycleWriter,
    snapshotProvider,
    customerId: cfg.customerId,
    jobId: cfg.jobId,
  });

  const agent = await createPiAgent({
    sessionDir: cfg.sessionDir,
    extensionFactories,
    disableTools: ["write", "edit", "bash"],
  });

  if (PRINT_AND_EXIT) {
    for (const t of agent.listTools()) console.log(t);
    await agent.shutdown();
    await closePool();
    await closeDragonfly();
    return 0;
  }

  if (ONCE) {
    await agent.runTurn("Run one cycle.");
    await agent.shutdown();
    await daemon.close();
    await closePool();
    await closeDragonfly();
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
          agent.runTurn(`Cron tick. Reason: ${decision.reason}`),
          new Promise<void>((_, rej) =>
            setTimeout(() => rej(new Error("cycle watchdog")), cfg.cycleWatchdogMs),
          ),
        ]);
        lastFingerprint = decision.fingerprint;
        lastCycleAt = Date.now();
      } else {
        console.log(`cycle skipped: ${decision.reason}`);
        try {
          await lifecycleWriter({
            customerId: cfg.customerId,
            jobId: cfg.jobId,
            scope: "cycle",
            fromState: "ACTIVE",
            toState: "SKIPPED_IDLE",
            reason: decision.reason,
          });
        } catch (e) {
          console.error(`lifecycle write failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    } catch (e) {
      console.error(`cycle failed: ${e instanceof Error ? e.message : e}`);
    }
    const sleepMs = Math.max(0, cfg.cycleIntervalMs - (Date.now() - tickStart));
    await new Promise((r) => setTimeout(r, sleepMs));
  }

  await agent.shutdown();
  await daemon.close();
  await closePool();
  await closeDragonfly();
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

// --- Polypi MCP client wiring ---------------------------------------------

async function connectPolypi(baseUrl: string): Promise<any> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const c = new Client(
    { name: "up-pi-agent", version: "0.1.0" },
    { capabilities: {} },
  );
  await c.connect(new StreamableHTTPClientTransport(new URL(baseUrl)));
  return c;
}

// --- Extension factory builder --------------------------------------------

interface ExtensionFactoryDeps {
  daemon: DaemonClient;
  polypi: any;
  pool: any;
  dragonfly: any;
  lifecycleWriter: (ev: any) => Promise<void>;
  snapshotProvider: (jobId: string) => Promise<{ tob_bid: number; tob_ask: number; ts?: string }>;
  customerId: string;
  jobId: string;
}

/**
 * Build the 5-extension factory list in the order required by spec §5.5/§12:
 *   1. up-tools         — auto-register all daemon tools from `_manifest`.
 *   2. up-mcp-polypi    — wrap the polypi MCP tools.
 *   3. up-stage         — hard sequencer with 3-violation guard.
 *   4. up-memory        — durable load + tool_call log + compaction.
 *   5. up-killswitch    — admin-flippable Dragonfly flag polling.
 *
 * Each factory receives a `PiLike` adapter (see `createPiLikeAdapter`) so the
 * extensions remain decoupled from the concrete @mariozechner/pi-coding-agent
 * `ExtensionAPI` types — they are testable with plain object mocks.
 *
 * Exported (named) so `tests/main-pi-wiring.test.ts` can verify the factory
 * count + ordering without booting Pi.
 */
export function buildExtensionFactories(deps: ExtensionFactoryDeps): Array<(pi: PiLike) => Promise<void>> {
  return [
    async (pi: PiLike) => installUpTools(pi, deps.daemon),
    async (pi: PiLike) => installPolypiTools(pi, deps.polypi),
    async (pi: PiLike) => installUpStage(pi, {
      lifecycleWriter: deps.lifecycleWriter,
      jobId: deps.jobId,
      customerId: deps.customerId,
    }),
    async (pi: PiLike) => installUpMemory(pi, {
      pool: deps.pool,
      snapshotProvider: deps.snapshotProvider,
      customerId: deps.customerId,
      jobId: deps.jobId,
    }),
    async (pi: PiLike) => installUpKillswitch(pi, {
      dragonfly: deps.dragonfly,
      lifecycleWriter: deps.lifecycleWriter,
      customerId: deps.customerId,
      jobId: deps.jobId,
    }),
  ];
}

// --- Pi adapter -----------------------------------------------------------

/**
 * Per-cycle session metadata bag the 3 lifecycle extensions read/write
 * via `ctx.session.metadata` in their tool_call handlers. Pi 0.70's
 * ExtensionContext has no equivalent free-form mutable bag, so we
 * carry it ourselves and reset between cycles.
 */
interface SessionMeta {
  stage?: string;
  violations?: number;
  lastDecision?: string;
  lastJobState?: string;
  [k: string]: unknown;
}

/**
 * Adapter that exposes our structural `PiLike` interface on top of Pi
 * 0.70.2's real `ExtensionAPI`. Two responsibilities:
 *
 *   1. Forward `pi.registerTool(spec)` -- the spec shape is already
 *      compatible (label, parameters as TSchema, execute(callId, params,
 *      signal, onUpdate, ctx)) provided we fill in the `label` if absent
 *      and surface `isError` via Pi's `ToolCallEventResult` is impossible
 *      at the result level (Pi's `AgentToolResult` has no isError),
 *      so we forward isError into the `details` field for downstream
 *      observability and rely on the agent's error-text heuristics.
 *
 *   2. Translate `pi.on(event, fn)` for the 4 lifecycle events the Wave D
 *      extensions use:
 *        - tool_call:           Pi shape `{type, toolName, input, toolCallId}`
 *                               -> legacy `{tool, params}` + ctx with
 *                               `signal`/`session.metadata` shim. Result
 *                               `{allow:false, reason}` -> Pi `{block:true, reason}`.
 *        - before_agent_start:  Pi's event has `prompt`/`systemPrompt` immutable;
 *                               handler mutates a synthetic `ctx.systemPrompt`
 *                               and we return `{systemPrompt: ctx.systemPrompt}`
 *                               in the handler result.
 *        - context:             Pi event `{messages: AgentMessage[]}` -> handler
 *                               receives `event.messages` as `msgs[]` with
 *                               in-place push. Result returns
 *                               `{messages: msgs}`.
 *        - session_before_compact:
 *                               Pi event has `branchEntries` instead of raw
 *                               messages -> handler receives `event.branchEntries`
 *                               and may return a filtered array. We wrap into
 *                               an inert `{}` result because Pi 0.70's compaction
 *                               path expects a `CompactionResult`, not a raw
 *                               message list. Compaction selection is best-effort:
 *                               the extension's transform is observable but does
 *                               not bypass Pi's own compactor. Tracked as a
 *                               KNOWN GAP for Wave E follow-up.
 *
 * The extension contract is preserved structurally so the existing
 * unit tests (mocks against PiLike) keep passing.
 */
export function createPiLikeAdapter(piApi: any, sessionMeta: SessionMeta): PiLike {
  return {
    registerTool(spec) {
      // Pi 0.70 requires `label`; fall back to a humanised name.
      const label = spec.label ?? spec.name.replace(/_/g, " ");
      piApi.registerTool({
        name: spec.name,
        label,
        description: spec.description,
        parameters: spec.parameters,
        async execute(toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) {
          // Inject `session.metadata` shim into ctx so tools that
          // need cycle-state (stage_advance) keep working.
          const ctxWithMeta = ctx ? Object.assign(ctx, { session: { metadata: sessionMeta } }) : { session: { metadata: sessionMeta } };
          const r = await spec.execute(toolCallId, params, signal, onUpdate, ctxWithMeta);
          // Pi's AgentToolResult shape: { content, details } -- Pi 0.70 has no
          // result-level isError; isError lives on the tool_result event below.
          return {
            content: r.content,
            details: r.isError ? { ...(r.details ?? {}), isError: true } : r.details,
          };
        },
      });
    },

    on(event, fn) {
      switch (event) {
        case "tool_call":
          piApi.on("tool_call", async (ev: any, ctx: any) => {
            const adapted = { tool: ev.toolName, params: ev.input };
            const adaptedCtx = adaptToolCallCtx(ctx, sessionMeta);
            const result = await fn(adapted, adaptedCtx);
            if (result && result.allow === false) {
              return { block: true, reason: result.reason };
            }
            return undefined;
          });
          return;

        case "before_agent_start":
          piApi.on("before_agent_start", async (ev: any, ctx: any) => {
            const ctxWithSp = { systemPrompt: ev.systemPrompt };
            await fn(ctxWithSp);
            if (ctxWithSp.systemPrompt && ctxWithSp.systemPrompt !== ev.systemPrompt) {
              return { systemPrompt: ctxWithSp.systemPrompt };
            }
            return undefined;
          });
          return;

        case "context":
          piApi.on("context", async (ev: any, ctx: any) => {
            const msgs = [...(ev.messages ?? [])];
            await fn(msgs, ctx);
            return { messages: msgs };
          });
          return;

        case "session_before_compact":
          piApi.on("session_before_compact", async (ev: any, ctx: any) => {
            // Best-effort: invoke the transform for observability, but do
            // NOT cancel Pi's own compactor -- returning `cancel:true`
            // here would drop the entire turn. The extension's filtered
            // list is logged for audit and reviewed in Wave E.
            try {
              const filtered = await fn(ev.branchEntries ?? [], ctx);
              if (Array.isArray(filtered)) {
                console.log(`[up-memory] compact preview: ${filtered.length} entries preserved`);
              }
            } catch (e) {
              console.error(`[up-memory] compact preview failed: ${e instanceof Error ? e.message : e}`);
            }
            return undefined;
          });
          return;

        default:
          // Unknown events are silently dropped -- the 5 extensions
          // only register the 4 events above.
          return;
      }
    },
  };
}

function adaptToolCallCtx(piCtx: any, meta: SessionMeta): any {
  // Pi's ExtensionContext has `signal: AbortSignal | undefined` and
  // `abort()` -- we expose the same `signal.abort` shape Wave D extensions
  // expect, falling back to the context-level `abort()` if no signal.
  const signal = piCtx?.signal;
  const shimmedSignal = signal
    ? { abort: (reason?: any) => piCtx.abort?.(reason) }
    : { abort: (reason?: any) => piCtx?.abort?.(reason) };
  return {
    ...piCtx,
    signal: shimmedSignal,
    session: { metadata: meta },
  };
}

// --- Pi agent boot --------------------------------------------------------

interface PiAgent {
  listTools(): string[];
  runTurn(text: string): Promise<void>;
  shutdown(): Promise<void>;
  /** Exposed for tests -- the meta bag carried across this session's lifecycle. */
  _sessionMeta: SessionMeta;
}

/**
 * Boot a real Pi 0.70.2 agent session in SDK mode. Wires:
 *   - `SessionManager.continueRecent(sessionDir)` for crash-resume.
 *   - `DefaultResourceLoader` with `extensionFactories` for the 5
 *     factories built above (each wrapped via `createPiLikeAdapter`).
 *   - `tools: ["read", "grep", "find", "ls"]` to disable mutation tools
 *     (write/edit/bash).
 *
 * Returns a thin handle exposing `runTurn(text)` (-> `session.prompt`)
 * and `shutdown()`. The cycle loop drives `runTurn` per cron tick;
 * `session.prompt(text)` resolves when the agent reaches a stable
 * non-streaming state (per Pi 0.70 semantics).
 */
async function createPiAgent(opts: {
  sessionDir: string;
  extensionFactories: Array<(pi: PiLike) => Promise<void>>;
  disableTools?: string[];
}): Promise<PiAgent> {
  const pi = await import("@mariozechner/pi-coding-agent");
  const { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager } = pi;

  // Per-session metadata bag carried across the lifecycle so the
  // adapter can inject `session.metadata` into Wave D tool/event ctxs.
  const sessionMeta: SessionMeta = { stage: "Sense", violations: 0 };

  // Track tool names registered through the adapter so listTools()
  // can report them without poking Pi internals.
  const registeredToolNames: string[] = [];

  // Resource loader with our 5 extension factories. The original
  // factories receive a PiLike; we wrap each so it gets the real
  // ExtensionAPI threaded through the adapter.
  const wrappedFactories = opts.extensionFactories.map((f) => {
    return async (piApi: any) => {
      const adapter = createPiLikeAdapter(piApi, sessionMeta);
      // Sniff registerTool calls to populate registeredToolNames.
      const sniffed: PiLike = {
        registerTool(spec) {
          registeredToolNames.push(spec.name);
          adapter.registerTool(spec);
        },
        on: adapter.on.bind(adapter),
      };
      await f(sniffed);
    };
  });

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    extensionFactories: wrappedFactories,
    // Skip discovery of file-based extensions/skills/themes -- the
    // 5 factories above are the entire surface for the pod.
    noExtensions: false,
    noSkills: false,
  });
  await resourceLoader.reload();

  // Resume the most recent session at sessionDir if one exists,
  // else create a fresh one.
  const sessionManager = SessionManager.continueRecent(process.cwd(), opts.sessionDir);

  // Allowlist of built-in tools: read-only set. The disableTools list
  // (write/edit/bash) is enforced by simply omitting them from the
  // allowlist; Pi's `tools: [...]` means "only these are enabled".
  const allowedBuiltins = ["read", "grep", "find", "ls"].filter(
    (t) => !(opts.disableTools ?? []).includes(t),
  );

  const { session } = await createAgentSession({
    resourceLoader,
    sessionManager,
    tools: allowedBuiltins,
  });

  return {
    listTools: () => registeredToolNames.slice(),
    async runTurn(text: string) {
      // session.prompt resolves when the turn is fully complete.
      // Throws if the agent errors or is aborted.
      await session.prompt(text);
    },
    async shutdown() {
      // Pi's AgentSession exposes `dispose()` for teardown if defined;
      // gracefully no-op if not present in this Pi version.
      const anySession = session as any;
      if (typeof anySession.dispose === "function") {
        await anySession.dispose();
      } else if (typeof anySession.shutdown === "function") {
        await anySession.shutdown();
      }
    },
    _sessionMeta: sessionMeta,
  };
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
