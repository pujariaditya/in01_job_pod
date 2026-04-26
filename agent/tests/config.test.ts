import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config";

const ORIG_ENV = { ...process.env };

describe("loadConfig", () => {
  beforeEach(() => { process.env = { ...ORIG_ENV }; });
  afterEach(() => { process.env = { ...ORIG_ENV }; });

  it("loads required vars from env", () => {
    process.env.UP_JOB_ID = "job_42";
    process.env.UP_CUSTOMER_ID = "cust_1";
    process.env.UP_DAEMON_SOCK = "/tmp/d.sock";
    process.env.POLYPI_BASE_URL = "https://polypi.example.com";
    process.env.UP_SESSION_DIR = "/var/lib/pi/sessions";
    process.env.UP_CATALOG_CATEGORY = "sports";
    process.env.UP_CATALOG_SUBCATEGORY = "cricipl";

    const cfg = loadConfig();

    expect(cfg.jobId).toBe("job_42");
    expect(cfg.customerId).toBe("cust_1");
    expect(cfg.daemonSock).toBe("/tmp/d.sock");
    expect(cfg.polypiBaseUrl).toBe("https://polypi.example.com");
    expect(cfg.sessionDir).toBe("/var/lib/pi/sessions");
    expect(cfg.catalogCategory).toBe("sports");
    expect(cfg.catalogSubcategory).toBe("cricipl");
  });

  it("throws when a required var is missing", () => {
    delete process.env.UP_JOB_ID;
    expect(() => loadConfig()).toThrow(/UP_JOB_ID/);
  });

  it("uses defaults for optional vars", () => {
    process.env.UP_JOB_ID = "j1";
    process.env.UP_CUSTOMER_ID = "c1";
    process.env.UP_DAEMON_SOCK = "/tmp/d.sock";
    process.env.POLYPI_BASE_URL = "https://p";
    process.env.UP_SESSION_DIR = "/s";
    process.env.UP_CATALOG_CATEGORY = "sports";
    process.env.UP_CATALOG_SUBCATEGORY = "cricipl";
    delete process.env.REDPANDA_BROKERS;

    const cfg = loadConfig();
    expect(cfg.cycleIntervalMs).toBe(60_000);
    expect(cfg.cycleWatchdogMs).toBe(45_000);
    expect(cfg.maxIdleMinutes).toBe(15);
    expect(cfg.midChangeBpsThreshold).toBe(10);
    expect(cfg.newTradeThreshold).toBe(1);
    // Wave G: pod-local Redpanda broker is the default.
    expect(cfg.redpandaBrokers).toEqual(["127.0.0.1:9092"]);
  });

  it("parses REDPANDA_BROKERS as a comma-separated list", () => {
    process.env.UP_JOB_ID = "j1";
    process.env.UP_CUSTOMER_ID = "c1";
    process.env.UP_DAEMON_SOCK = "/tmp/d.sock";
    process.env.POLYPI_BASE_URL = "https://p";
    process.env.UP_SESSION_DIR = "/s";
    process.env.UP_CATALOG_CATEGORY = "sports";
    process.env.UP_CATALOG_SUBCATEGORY = "cricipl";
    process.env.REDPANDA_BROKERS = "host1:9092, host2:9092 ,host3:9092";
    const cfg = loadConfig();
    expect(cfg.redpandaBrokers).toEqual(["host1:9092", "host2:9092", "host3:9092"]);
  });
});
