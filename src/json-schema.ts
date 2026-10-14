/**
 * Convert a zod object schema to the JSON Schema MCP advertises.
 *
 * Hand-rolled rather than pulling `zod-to-json-schema`: the tool inputs here
 * are small objects of primitives, enums and records, this is a hundred
 * lines, and it keeps this server's dependency count at one.
 *
 * ── Anything it does not understand becomes `{}` ──────────────────────────
 *
 * Which is a property the host renders with no type and a model fills in by
 * guessing. It does not throw and nothing else notices, so
 * `registry.spec.ts` asserts that no advertised property is untyped — and
 * that assertion has earned its keep: `resolve_bot_route` arrived with three
 * NESTED object properties (`page`, `context`, `contact`) and all three
 * advertised as `{}`. A model guessing the shape of `context` would have
 * sent `{ audience: 'buyer' }` to a `.strict()` route that wanted
 * `{ verified: { audience: 'buyer' } }` and got a 400 it could not read.
 *
 * So objects and records recurse now, one level at a time, by the same
 * rules.
 */
import { z } from 'zod';

export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (!(schema instanceof z.ZodObject)) {
    return { type: 'object' };
  }
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, raw] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
    let field = raw;
    let isRequired = true;
    if (field instanceof z.ZodOptional) {
      field = field.unwrap() as z.ZodTypeAny;
      isRequired = false;
    }
    const description = raw.description;
    let node: Record<string, unknown>;
    if (field instanceof z.ZodString) {
      node = { type: 'string' };
    } else if (field instanceof z.ZodNumber) {
      node = { type: 'number' };
    } else if (field instanceof z.ZodBoolean) {
      node = { type: 'boolean' };
    } else if (field instanceof z.ZodEnum) {
      node = { type: 'string', enum: field.options as string[] };
    } else if (field instanceof z.ZodArray) {
      const inner = field.element as z.ZodTypeAny;
      // `ZodEnum.options` is typed loosely by zod; narrow it to the string
      // list JSON Schema wants rather than letting `any` through.
      const enumValues: string[] =
        inner instanceof z.ZodEnum ? (inner.options as unknown as string[]) : [];
      node = {
        type: 'array',
        items: enumValues.length > 0 ? { type: 'string', enum: enumValues } : { type: 'string' },
      };
    } else if (field instanceof z.ZodObject) {
      /*
       * Recurse. Depth is bounded by the schema, not by a counter: these are
       * hand-written tool inputs and the deepest in the registry is two.
       */
      node = toJsonSchema(field);
    } else if (field instanceof z.ZodRecord) {
      /*
       * `z.record(z.string(), X)` — an open bag of attributes, which is what
       * a visitor context and a contact's custom fields are.
       *
       * `additionalProperties` carries the VALUE type where it is a primitive
       * this function knows, and `true` otherwise. Advertising
       * `type: 'object'` with nothing else would tell a model the bag exists
       * and not what may go in it, which for `context.verified` (string to
       * string) is the difference between a working call and a 400.
       */
      // `valueSchema`, not `valueType`: the latter is the static `create`
      // parameter name and is not a property on the instance.
      const value = field.valueSchema as z.ZodTypeAny;
      const additional =
        value instanceof z.ZodString
          ? { type: 'string' }
          : value instanceof z.ZodNumber
            ? { type: 'number' }
            : value instanceof z.ZodBoolean
              ? { type: 'boolean' }
              : true;
      node = { type: 'object', additionalProperties: additional };
    } else {
      node = {};
    }
    if (description !== undefined) {
      node['description'] = description;
    }
    properties[key] = node;
    if (isRequired) {
      required.push(key);
    }
  }
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}
