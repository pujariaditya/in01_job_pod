/**
 * Redpanda (Kafka API) producer for the customer-visibility event bus.
 *
 * Pi-migration Wave G Task 2. The pod's `up-sse` extension (Task 4)
 * publishes JobEvent objects here; customer_backend's SSE endpoint
 * (Task 5) consumes the same topic and proxies events to the customer's
 * browser as text/event-stream.
 *
 * Best-effort by design: a publish failure is logged and swallowed —
 * visibility infrastructure must NEVER crash the trading agent.
 */
import { Kafka, type Producer } from "kafkajs";

export interface JobEvent {
  ts: number;                // Date.now()
  type: "tool_call" | "stage_advance" | "agent_message" | "lifecycle" | "decision" | "idle";
  stage?: string;
  tool?: string;
  summary?: string;
  decision?: "BUY" | "SELL" | "HOLD";
  market_id?: string;
  payload?: Record<string, unknown>;
}

export interface ProducerOptions {
  jobId: string;
  brokers: string[];
  topic?: string;
  /** Injected for tests — when set, replaces `new Kafka(...)`. */
  _kafka?: any;
}

export class JobEventProducer {
  private producer: Producer | null = null;
  private readonly topic: string;

  constructor(private readonly opts: ProducerOptions) {
    this.topic = opts.topic ?? "job-events";
  }

  async connect(): Promise<void> {
    const kafka = this.opts._kafka ?? new Kafka({
      clientId: `up-pi-pod-${this.opts.jobId}`,
      brokers: this.opts.brokers,
    });
    const producer = kafka.producer({ allowAutoTopicCreation: true });
    await producer.connect();
    this.producer = producer;
  }

  async publish(event: JobEvent): Promise<void> {
    if (!this.producer) throw new Error("producer not connected");
    const value = JSON.stringify({ ...event, job_id: this.opts.jobId });
    try {
      await this.producer.send({
        topic: this.topic,
        messages: [{ key: this.opts.jobId, value }],
      });
    } catch (e) {
      // Visibility is best-effort — never crash the agent because the bus is down.
      console.error(`up-sse publish failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }
}
