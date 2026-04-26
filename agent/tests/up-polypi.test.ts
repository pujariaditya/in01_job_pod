import { describe, it, expect, vi, beforeEach } from "vitest";
import { installPolypiTools } from "../src/extensions/up-polypi";

function makePi() {
  const tools: any[] = [];
  return {
    registerTool: (spec: any) => { tools.push(spec); },
    on: vi.fn(),
    _tools: tools,
  };
}

describe("up-polypi extension (HTTP)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers all 17 polypi tools with Pi", async () => {
    const pi = makePi();
    await installPolypiTools(pi as any, "https://polypi.example.com");
    expect(pi._tools).toHaveLength(17);
    const names = pi._tools.map((t: any) => t.name).sort();
    expect(names).toContain("polypi_order_place_order");
    expect(names).toContain("polypi_account_compute_pnl");
  });

  it("execute() calls fetch with the right URL + body + JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ trade_id: "0xabc", fill_price: 0.418 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const pi = makePi();
    await installPolypiTools(pi as any, "https://polypi.example.com");
    const placeOrder = pi._tools.find((t: any) => t.name === "polypi_order_place_order");
    expect(placeOrder).toBeDefined();

    const args = {
      customer_id: "cust_42",
      market_id: "MUM",
      side: "BUY",
      size_usd: 200.0,
    };
    const result = await placeOrder.execute("call1", args, new AbortController().signal, () => {}, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0]!;
    const url = call[0];
    const init = call[1] as any;
    expect(url).toBe("https://polypi.example.com/v1/order/place_order");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(args);

    expect(result.content?.[0]?.type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.trade_id).toBe("0xabc");
    expect(result.isError).toBeFalsy();
  });

  it("returns isError on HTTP 4xx without retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: { error: { code: "BAD_PARAMS", message: "missing size_usd" } } }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const pi = makePi();
    await installPolypiTools(pi as any, "https://polypi.example.com");
    const placeOrder = pi._tools.find((t: any) => t.name === "polypi_order_place_order");
    const result = await placeOrder.execute(
      "c1",
      { customer_id: "c1", market_id: "MUM", side: "BUY", size_usd: 0 },
      new AbortController().signal, () => {}, {},
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/BAD_PARAMS|422|missing size_usd/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on HTTP 5xx", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("server crash", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pi = makePi();
    await installPolypiTools(pi as any, "https://polypi.example.com");
    const placeOrder = pi._tools.find((t: any) => t.name === "polypi_order_place_order");
    const result = await placeOrder.execute(
      "c1",
      { customer_id: "c1", market_id: "MUM", side: "BUY", size_usd: 1 },
      new AbortController().signal, () => {}, {},
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.isError).toBeFalsy();
  });

  it("aborts on signal", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init: any) => {
      if (init.signal?.aborted) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pi = makePi();
    await installPolypiTools(pi as any, "https://polypi.example.com");
    const placeOrder = pi._tools.find((t: any) => t.name === "polypi_order_place_order");
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await placeOrder.execute(
      "c1",
      { customer_id: "c1", market_id: "MUM", side: "BUY", size_usd: 1 },
      ctrl.signal, () => {}, {},
    );
    expect(result.isError).toBe(true);
  });
});
