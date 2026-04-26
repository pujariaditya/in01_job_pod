import { describe, it, expect, afterEach } from "vitest";
import { createServer, Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { DaemonClient, DaemonRemoteError } from "../src/daemon-client";

let server: Server | null = null;
let sockPath: string;

afterEach(async () => {
  if (server) {
    await new Promise<void>((res) => server!.close(() => res()));
    server = null;
  }
  if (sockPath && existsSync(sockPath)) unlinkSync(sockPath);
});

function startMockDaemon(handler: (req: any) => any): Promise<string> {
  return new Promise((resolve) => {
    sockPath = join(tmpdir(), `up-test-${Date.now()}.sock`);
    server = createServer((conn) => {
      let buf = Buffer.alloc(0);
      conn.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 4) {
          const len = buf.readUInt32BE(0);
          if (buf.length < 4 + len) break;
          const body = JSON.parse(buf.subarray(4, 4 + len).toString("utf-8"));
          buf = buf.subarray(4 + len);
          const resp = handler(body);
          const rb = Buffer.from(JSON.stringify(resp), "utf-8");
          const hd = Buffer.alloc(4);
          hd.writeUInt32BE(rb.length, 0);
          conn.write(Buffer.concat([hd, rb]));
        }
      });
    });
    server.listen(sockPath, () => resolve(sockPath));
  });
}

describe("DaemonClient", () => {
  it("returns result on successful call", async () => {
    await startMockDaemon((req) => ({
      id: req.id,
      result: { sum: req.params.a + req.params.b },
      error: null,
    }));
    const c = new DaemonClient(sockPath);
    await c.connect();
    const r = await c.call("add", { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await c.close();
  });

  it("throws DaemonRemoteError on error response", async () => {
    await startMockDaemon((req) => ({
      id: req.id,
      result: null,
      error: { code: "UNKNOWN_TOOL", message: "no handler", details: {} },
    }));
    const c = new DaemonClient(sockPath);
    await c.connect();
    await expect(c.call("missing", {})).rejects.toThrow(DaemonRemoteError);
    await c.close();
  });

  it("multiplexes concurrent calls on one connection", async () => {
    await startMockDaemon((req) => ({
      id: req.id,
      result: { tool: req.tool, x: req.params.x },
      error: null,
    }));
    const c = new DaemonClient(sockPath);
    await c.connect();
    const results = await Promise.all([
      c.call("a", { x: 1 }),
      c.call("b", { x: 2 }),
      c.call("c", { x: 3 }),
    ]);
    expect(results.map((r: any) => r.x)).toEqual([1, 2, 3]);
    await c.close();
  });
});
