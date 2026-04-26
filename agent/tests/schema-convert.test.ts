import { describe, it, expect } from "vitest";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { jsonSchemaToTypebox } from "../src/schema-convert";

describe("jsonSchemaToTypebox", () => {
  it("converts a primitive object", () => {
    const t = jsonSchemaToTypebox({
      type: "object",
      properties: {
        sport: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      required: ["sport"],
    });
    expect(Value.Check(t, { sport: "cricket", limit: 50 })).toBe(true);
    expect(Value.Check(t, { limit: 50 })).toBe(false);
    expect(Value.Check(t, { sport: "cricket", limit: 1000 })).toBe(false);
  });

  it("handles nullable fields via anyOf with null type", () => {
    const t = jsonSchemaToTypebox({
      type: "object",
      properties: {
        sport: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    });
    expect(Value.Check(t, { sport: null })).toBe(true);
    expect(Value.Check(t, { sport: "cricket" })).toBe(true);
  });

  it("handles arrays of primitives", () => {
    const t = jsonSchemaToTypebox({
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
      },
      required: ["ids"],
    });
    expect(Value.Check(t, { ids: ["a", "b"] })).toBe(true);
    expect(Value.Check(t, { ids: [1, 2] })).toBe(false);
  });

  it("handles enum strings", () => {
    const t = jsonSchemaToTypebox({
      type: "object",
      properties: {
        side: { type: "string", enum: ["buy", "sell"] },
      },
      required: ["side"],
    });
    expect(Value.Check(t, { side: "buy" })).toBe(true);
    expect(Value.Check(t, { side: "wat" })).toBe(false);
  });

  it("handles number bounds", () => {
    const t = jsonSchemaToTypebox({
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["score"],
    });
    expect(Value.Check(t, { score: 0.5 })).toBe(true);
    expect(Value.Check(t, { score: 2 })).toBe(false);
  });
});
