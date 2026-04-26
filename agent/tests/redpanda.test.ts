import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobEventProducer } from "../src/redpanda";

describe("JobEventProducer", () => {
  let mockKafka: any;
  let mockProducer: any;

  beforeEach(() => {
    mockProducer = {
      connect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue([{ partition: 0 }]),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    mockKafka = {
      producer: vi.fn().mockReturnValue(mockProducer),
    };
  });

  it("publishes one event with correct topic and key", async () => {
    const p = new JobEventProducer({
      jobId: "j1",
      brokers: ["redpanda:9092"],
      _kafka: mockKafka,
    });
    await p.connect();
    await p.publish({
      ts: 1,
      type: "tool_call",
      stage: "Sense",
      tool: "discovery_find_markets",
      summary: "8 markets",
    });
    expect(mockProducer.send).toHaveBeenCalledOnce();
    const args = mockProducer.send.mock.calls[0][0];
    expect(args.topic).toBe("job-events");
    expect(args.messages[0].key).toBe("j1");
    const payload = JSON.parse(args.messages[0].value);
    expect(payload.type).toBe("tool_call");
    expect(payload.job_id).toBe("j1");
  });

  it("non-fatal on send failure (logs, does not throw)", async () => {
    mockProducer.send.mockRejectedValueOnce(new Error("broker down"));
    const p = new JobEventProducer({
      jobId: "j1",
      brokers: ["redpanda:9092"],
      _kafka: mockKafka,
    });
    await p.connect();
    await expect(
      p.publish({
        ts: 1,
        type: "tool_call",
        stage: "Sense",
        tool: "x",
        summary: "",
      }),
    ).resolves.toBeUndefined();
  });

  it("disconnect cleans up", async () => {
    const p = new JobEventProducer({
      jobId: "j1",
      brokers: ["r:9092"],
      _kafka: mockKafka,
    });
    await p.connect();
    await p.disconnect();
    expect(mockProducer.disconnect).toHaveBeenCalledOnce();
  });
});
