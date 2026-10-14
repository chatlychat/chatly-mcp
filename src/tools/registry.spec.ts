/**
 * MCP tool contract.
 *
 * The risk with an MCP surface is not that a tool fails — it is that a model
 * calls a mutating one believing it to be a read, or that a write goes out
 * without the idempotency key this API requires and a host retry double-posts
 * to a real customer.
 */
import { describe, expect, it, vi } from 'vitest';

import { TOOLS, TOOLS_BY_NAME, type ApiContext, type ToolDefinition } from './index.js';
import { toJsonSchema } from '../json-schema.js';

/**
 * Look up a tool, failing loudly if it is gone.
 *
 * Avoids `!` on every lookup: a renamed tool should fail with "no such tool",
 * not a null-dereference several lines later.
 */
function tool(name: string): ToolDefinition {
  const t = TOOLS_BY_NAME.get(name);
  if (t === undefined) {
    throw new Error(`No such tool: ${name}`);
  }
  return t;
}

function ctxWith(capture: { calls: Array<{ url: string; init: RequestInit }> }): ApiContext {
  return {
    baseUrl: 'https://api.test',
    apiKey: 'k'.repeat(20),
    fetchImpl: vi.fn(async (url: string, init?: RequestInit) => {
      capture.calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch,
  };
}

describe('tool registry', () => {
  it('has unique names', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });

  it('every tool has a description a model can act on', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(30);
    }
  });

  /**
   * The whole write surface, pinned by name.
   *
   * Every other tool is a read, and that is a decision rather than an
   * accident of what got built: the question asked of each candidate was
   * what happens if a model gets it wrong at 3am with nobody watching. A
   * read answers it badly; a write to configuration changes how the
   * workspace behaves for everybody, and a write that leaves Chatly — a
   * webhook redelivery, a message to a customer — cannot be taken back at
   * all.
   *
   * So this list is the decision, not a description of it. Adding a name
   * here is the moment somebody chose to widen what a model may do, and
   * this test is what makes that moment visible in a diff rather than
   * buried in a `mutating: true` three files away. Several key-accessible
   * writes were considered and left out: macro create/update/delete,
   * `contacts.merge`, `contacts.bulk_upsert`, ticket merge/split/bulk,
   * webhook redelivery, scheduling and cancelling messages, taking over a
   * thread, and every bot / trigger / channel / brand / AI-provider write.
   */
  const MUTATING_TOOLS = [
    'create_contact',
    'send_message',
    'sync_docs_source',
    'tag_contact',
    'track_event',
    'unsubscribe_contact',
    'untag_contact',
  ];

  it('mutates through exactly the tools somebody decided on', () => {
    expect(
      TOOLS.filter((t) => t.mutating)
        .map((t) => t.name)
        .sort(),
    ).toEqual([...MUTATING_TOOLS].sort());
  });

  /**
   * A floor, not an equality. The set is meant to grow, and a number that
   * has to be edited for every addition gets edited without being read.
   * What this catches is the opposite: a domain file dropped from the
   * registry in `index.ts`, which shrinks `TOOLS` silently — every other
   * assertion here iterates `TOOLS`, so each one gets WEAKER as it shrinks
   * and none of them would notice.
   */
  it('still carries the whole registry', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(78);
  });

  it('marks exactly the state-changing tools as mutating', () => {
    // A model deciding whether to ask permission relies on this flag being
    // right, so it is asserted explicitly rather than derived.
    expect(tool('send_message').mutating).toBe(true);
    // `react_to_message` was removed: a reaction records who reacted, and an
    // API key is not a person, so that route rejects key auth outright.
    expect(tool('search').mutating).toBe(false);
    expect(tool('get_messages').mutating).toBe(false);
    expect(tool('list_conversations').mutating).toBe(false);
  });
});

describe('requests', () => {
  it('sends an Idempotency-Key on writes', async () => {
    // Without it the API rejects the write in production; with a fresh one
    // per call, a host retrying a tool cannot double-post.
    const capture = { calls: [] as Array<{ url: string; init: RequestInit }> };
    await tool('send_message').run(ctxWith(capture), {
      conversationId: '00000000-0000-7000-8000-000000000001',
      body: 'hello',
    });
    const headers = capture.calls[0]?.init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBeTruthy();
  });

  it('does NOT send an Idempotency-Key on reads', async () => {
    const capture = { calls: [] as Array<{ url: string; init: RequestInit }> };
    await tool('search').run(ctxWith(capture), { q: 'invoice' });
    const headers = capture.calls[0]?.init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBeUndefined();
  });

  it('authenticates with the workspace key', async () => {
    const capture = { calls: [] as Array<{ url: string; init: RequestInit }> };
    await tool('search').run(ctxWith(capture), { q: 'x' });
    const headers = capture.calls[0]?.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${'k'.repeat(20)}`);
  });

  it('surfaces the API error body rather than a generic failure', async () => {
    // "conversation is already closed" is actionable; "request failed" is not.
    const ctx: ApiContext = {
      baseUrl: 'https://api.test',
      apiKey: 'k'.repeat(20),
      fetchImpl: (async () =>
        new Response('{"error":{"message":"already closed"}}', { status: 409 })) as typeof fetch,
    };
    await expect(tool('search').run(ctx, { q: 'x' })).rejects.toThrow(/already closed/);
  });
});

describe('advertised schemas', () => {
  /**
   * `toJsonSchema` is hand-rolled and understands strings, numbers, booleans,
   * enums and arrays of enums. Anything else falls through to `{}` — a
   * property the host shows with no type, which a model fills in by guessing.
   * It does not throw and nothing else would notice, so the check is here:
   * every advertised property must carry a type.
   */
  it('every tool input converts to a typed JSON Schema', () => {
    const untyped: string[] = [];
    for (const t of TOOLS) {
      const schema = toJsonSchema(t.inputSchema);
      expect(schema['type']).toBe('object');
      const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>;
      for (const [key, node] of Object.entries(properties)) {
        if (node['type'] === undefined) {
          untyped.push(`${t.name}.${key}`);
        }
      }
    }
    expect(untyped).toEqual([]);
  });
});

describe('input validation', () => {
  it('rejects a non-uuid conversation id', () => {
    const schema = tool('get_messages').inputSchema;
    expect(schema.safeParse({ conversationId: 'not-a-uuid' }).success).toBe(false);
  });

  it('caps result limits so a model cannot pull the whole workspace', () => {
    const schema = tool('list_conversations').inputSchema;
    expect(schema.safeParse({ limit: 10_000 }).success).toBe(false);
  });

  it('requires a non-empty message body', () => {
    const schema = tool('send_message').inputSchema;
    expect(
      schema.safeParse({ conversationId: '00000000-0000-7000-8000-000000000001', body: '' })
        .success,
    ).toBe(false);
  });
});
