import { Type, type TSchema } from "@sinclair/typebox";

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  anyOf?: JsonSchema[];
  $ref?: string;
}

/**
 * Convert a JSON Schema (as emitted by Pydantic v2 model_json_schema())
 * into a runtime typebox TSchema. Supports the subset Pydantic generates
 * for our handlers: object/string/integer/number/boolean/array/enum/null
 * plus minimum/maximum/length bounds and anyOf-with-null for Optional.
 */
export function jsonSchemaToTypebox(schema: JsonSchema): TSchema {
  // anyOf [X, null] → Union pattern (typebox doesn't have a direct Optional
  // helper that translates JSON-Schema anyOf-null into "nullable")
  if (schema.anyOf && schema.anyOf.length === 2) {
    const nullIdx = schema.anyOf.findIndex((s) => s.type === "null");
    if (nullIdx >= 0) {
      const other = schema.anyOf[1 - nullIdx];
      return Type.Union([jsonSchemaToTypebox(other!), Type.Null()]);
    }
  }

  // Enum on a string
  if (Array.isArray(schema.enum)) {
    return Type.Union(schema.enum.map((v) => Type.Literal(v as any)));
  }

  switch (schema.type) {
    case "object": {
      const props: Record<string, TSchema> = {};
      const required = new Set(schema.required ?? []);
      for (const [k, v] of Object.entries(schema.properties ?? {})) {
        const t = jsonSchemaToTypebox(v);
        props[k] = required.has(k) ? t : Type.Optional(t);
      }
      return Type.Object(props, { additionalProperties: false });
    }

    case "string":
      return Type.String({
        minLength: schema.minLength,
        maxLength: schema.maxLength,
        description: schema.description,
      });

    case "integer":
      return Type.Integer({
        minimum: schema.minimum,
        maximum: schema.maximum,
        description: schema.description,
      });

    case "number":
      return Type.Number({
        minimum: schema.minimum,
        maximum: schema.maximum,
        description: schema.description,
      });

    case "boolean":
      return Type.Boolean({ description: schema.description });

    case "array":
      return Type.Array(
        schema.items ? jsonSchemaToTypebox(schema.items) : Type.Any(),
        { description: schema.description },
      );

    case "null":
      return Type.Null();
  }

  return Type.Any({ description: schema.description });
}
