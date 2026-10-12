/**
 * Convert a zod object schema to the JSON Schema MCP advertises.
 *
 * Hand-rolled rather than pulling `zod-to-json-schema`: the tool inputs here
 * are flat objects of primitives and small enums, this is sixty lines, and it
 * keeps this server's dependency count at one.
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
