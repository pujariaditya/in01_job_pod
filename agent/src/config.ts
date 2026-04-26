export interface AgentConfig {
  jobId: string;
  customerId: string;
  daemonSock: string;
  polypiBaseUrl: string;
  sessionDir: string;
  catalogCategory: string;
  catalogSubcategory: string;
  cycleIntervalMs: number;
  cycleWatchdogMs: number;
  maxIdleMinutes: number;
  midChangeBpsThreshold: number;
  newTradeThreshold: number;
  /**
   * Redpanda brokers for the customer-visibility event bus
   * (Wave G `up-sse` extension). Defaults to the pod-local broker on
   * `127.0.0.1:9092`, matching `/job_pod/redpanda/redpanda.yaml`.
   */
  redpandaBrokers: string[];
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`required env var ${name} is unset`);
  return v;
}

function optionalInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`env var ${name} must be int, got ${v}`);
  return n;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`env var ${name} must be number, got ${v}`);
  return n;
}

export function loadConfig(): AgentConfig {
  return {
    jobId: required("UP_JOB_ID"),
    customerId: required("UP_CUSTOMER_ID"),
    daemonSock: required("UP_DAEMON_SOCK"),
    polypiBaseUrl: required("POLYPI_BASE_URL"),
    sessionDir: required("UP_SESSION_DIR"),
    catalogCategory: required("UP_CATALOG_CATEGORY"),
    catalogSubcategory: required("UP_CATALOG_SUBCATEGORY"),
    cycleIntervalMs: optionalInt("UP_CYCLE_INTERVAL_MS", 60_000),
    cycleWatchdogMs: optionalInt("UP_CYCLE_WATCHDOG_MS", 45_000),
    maxIdleMinutes: optionalInt("UP_MAX_IDLE_MINUTES", 15),
    midChangeBpsThreshold: optionalNumber("UP_MID_CHANGE_BPS", 10),
    newTradeThreshold: optionalInt("UP_NEW_TRADE_THRESHOLD", 1),
    redpandaBrokers: (process.env.REDPANDA_BROKERS ?? "127.0.0.1:9092")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
