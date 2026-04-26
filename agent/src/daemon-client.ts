import { Socket, connect } from "node:net";

export class DaemonRemoteError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "DaemonRemoteError";
  }
}

interface PendingResponse {
  resolve: (r: Record<string, unknown>) => void;
  reject: (e: Error) => void;
}

export class DaemonClient {
  private sock: Socket | null = null;
  private buf: Buffer = Buffer.alloc(0);
  private pending = new Map<string, PendingResponse>();
  private idCounter = 0;
  private connected = false;

  constructor(
    private readonly sockPath: string,
    private readonly retryAttempts = 2,
    private readonly retryBackoffMs = 250,
  ) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    await new Promise<void>((resolve, reject) => {
      this.sock = connect(this.sockPath);
      this.sock.once("connect", () => {
        this.connected = true;
        this.sock!.on("data", (c) => this.onData(c));
        this.sock!.on("close", () => this.onClose());
        this.sock!.on("error", (e) => this.onError(e));
        resolve();
      });
      this.sock.once("error", (e) => reject(e));
    });
  }

  async close(): Promise<void> {
    if (!this.sock) return;
    await new Promise<void>((resolve) => {
      this.sock!.end(() => {
        this.connected = false;
        resolve();
      });
    });
  }

  async call(
    tool: string,
    params: Record<string, unknown>,
    opts: { signal?: AbortSignal } = {},
  ): Promise<Record<string, unknown>> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        return await this.callOnce(tool, params, opts);
      } catch (e) {
        lastErr = e as Error;
        if (e instanceof DaemonRemoteError) throw e; // not transport, don't retry
        await this.close();
        await new Promise((r) => setTimeout(r, this.retryBackoffMs));
        try { await this.connect(); } catch (e2) { lastErr = e2 as Error; }
      }
    }
    throw new Error(`daemon unreachable after retries: ${lastErr?.message}`);
  }

  private callOnce(
    tool: string,
    params: Record<string, unknown>,
    opts: { signal?: AbortSignal },
  ): Promise<Record<string, unknown>> {
    if (!this.connected || !this.sock) throw new Error("not connected");
    const id = `c${this.idCounter++}`;
    const body = Buffer.from(
      JSON.stringify({ id, tool, params }),
      "utf-8",
    );
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length, 0);

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (opts.signal) {
        opts.signal.addEventListener("abort", () => {
          this.pending.delete(id);
          reject(new Error("aborted"));
        }, { once: true });
      }
      this.sock!.write(Buffer.concat([header, body]));
    });
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0);
      if (this.buf.length < 4 + len) break;
      const body = this.buf.subarray(4, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      try {
        const resp = JSON.parse(body.toString("utf-8")) as {
          id: string;
          result: Record<string, unknown> | null;
          error: { code: string; message: string; details?: Record<string, unknown> } | null;
        };
        const p = this.pending.get(resp.id);
        if (!p) continue;
        this.pending.delete(resp.id);
        if (resp.error) {
          p.reject(new DaemonRemoteError(resp.error.code, resp.error.message, resp.error.details ?? {}));
        } else {
          p.resolve(resp.result ?? {});
        }
      } catch (e) {
        this.onError(e as Error);
        return;
      }
    }
  }

  private onClose(): void {
    this.connected = false;
    for (const p of this.pending.values()) p.reject(new Error("daemon connection closed"));
    this.pending.clear();
  }

  private onError(e: Error): void {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
    this.connected = false;
  }
}
