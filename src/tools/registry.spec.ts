/**
 * MCP tool contract.
 *
 * The risk with an MCP surface is not that a tool fails — it is that a model
 * calls a mutating one believing it to be a read, or that a write goes out
 * without the idempotency key this API requires and a host retry double-posts
 * to a real customer.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
   *
   * It read `78` until 2026-10-19, which was not the registry's size — it was
   * the stale number out of the README, and the two were wrong together. See
   * the advertised-counts block below, which is what now pins the real one.
   */
  it('still carries the whole registry', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(80);
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

/**
 * ══ THE ADVERTISED COUNTS MUST BE THE REGISTRY'S OWN ══════════════════════
 *
 * Three places state how many tools this server has: `README.md`, the
 * `description` in `package.json`, and the public docs. npm shows the first
 * two ON THE SAME PAGE, and on 2026-10-19 they contradicted each other there:
 * the description said "83 typed tools (76 reads, 7 writes)" and the README
 * body said "78 typed tools — 71 reads and 7 writes".
 *
 * How that shipped is the lesson. `0.1.3` existed FOR this correction — its
 * changelog entry says so, "description only; no code change" — but the
 * README was still on 78 at the commit that set the version, and the fix
 * landed in a later commit that was never published. So half the payload went
 * out (the description, already correct at the version commit) and half did
 * not, and the published page argued with itself for five days. A version
 * bump is not a publish.
 *
 * The number nobody checked was also hiding in this very file: the floor above
 * read `78`, copied from the README rather than measured, so the registry's
 * real size of 83 was unasserted and the two stale numbers agreed with each
 * other.
 *
 * So no count is written down here. Both are DERIVED from `TOOLS` and the
 * prose is required to match, which means adding a tool fails this spec until
 * the advertised numbers are updated — and there is no constant to edit
 * without reading.
 */
describe('the advertised tool counts', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const writes = TOOLS.filter((t) => t.mutating === true).length;
  const reads = TOOLS.length - writes;

  /**
   * Pull [total, reads, writes] out of a "N typed tools … N reads … N writes"
   * sentence. Two idioms are in play — the README's em-dashed prose and the
   * description's parenthetical — so this reads the three numbers by their
   * nouns rather than matching either sentence's punctuation.
   *
   * Returns null when any of the three is absent, and the callers assert on
   * that: a reworded sentence must fail loudly. A matcher that quietly finds
   * nothing and reports no mismatch is how the README got here.
   */
  function countsIn(text: string): [number, number, number] | null {
    const total = /(\d+) typed tools/.exec(text);
    const r = /(\d+) reads/.exec(text);
    const w = /(\d+) writes/.exec(text);
    if (total === null || r === null || w === null) {
      return null;
    }
    return [Number(total[1]), Number(r[1]), Number(w[1])];
  }

  it('the extractor reads both idioms, and refuses a sentence it cannot parse', () => {
    expect(countsIn('83 typed tools over stdio — 76 reads and 7 writes.')).toEqual([83, 76, 7]);
    expect(countsIn('Chatly MCP server — 83 typed tools (76 reads, 7 writes) over stdio')).toEqual([
      83, 76, 7,
    ]);
    // No counts at all, and a partial sentence: both must be null rather than
    // a tuple with a guessed member.
    expect(countsIn('The Chatly MCP server, for Claude and Cursor.')).toBeNull();
    expect(countsIn('83 typed tools over stdio or a remote HTTP endpoint.')).toBeNull();
  });

  it('reads and writes account for every tool', () => {
    expect(reads + writes).toBe(TOOLS.length);
    expect(writes).toBeGreaterThan(0);
    expect(reads).toBeGreaterThan(0);
  });

  it("README.md advertises the registry's own numbers", () => {
    const got = countsIn(readFileSync(`${root}README.md`, 'utf8'));
    expect(got).not.toBeNull();
    expect(got).toEqual([TOOLS.length, reads, writes]);
  });

  it("package.json's description advertises the registry's own numbers", () => {
    const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as { description: string };
    const got = countsIn(pkg.description);
    expect(got).not.toBeNull();
    expect(got).toEqual([TOOLS.length, reads, writes]);
  });
});
