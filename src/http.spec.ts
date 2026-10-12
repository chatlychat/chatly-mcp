/**
 * The remote transport, over a real loopback HTTP server.
 *
 * What is pinned here is the ONE claim the whole design rests on: the
 * credential is the caller's, per request. A process-wide context would serve
 * every caller as whoever started the process, which on a shared deployment
 * is a cross-tenant read dressed as a feature — and it would pass any test
 * that only ever makes one request with one token.
 *
 * So two requests are made, with two different tokens, and the token the
 * upstream API sees is asserted each time.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMcpHttpServer, readBearer } from './http.js';

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server | null = null;

async function listen(fetchImpl: typeof fetch): Promise<string> {
  const s = createMcpHttpServer({ baseUrl: 'https://api.test', fetchImpl });
  server = s;
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const addr = s.address() as AddressInfo;
  return `http://127.0.0.1:${String(addr.port)}`;
}

afterEach(async () => {
  if (server !== null) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
});

/** One JSON-RPC request, with the headers a Streamable HTTP client sends. */
async function rpc(
  base: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The transport requires BOTH, and a client sending only one gets a 406.
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

const INITIALIZE = {
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  },
};

describe('readBearer', () => {
  it('reads a bearer token, case-insensitively on the scheme', () => {
    expect(readBearer('Bearer abc')).toBe('abc');
    expect(readBearer('bearer abc')).toBe('abc');
    expect(readBearer('  Bearer   abc  ')).toBe('abc');
  });

  it('refuses anything that is not a bearer', () => {
    expect(readBearer(undefined)).toBeNull();
    expect(readBearer('')).toBeNull();
    expect(readBearer('Basic abc')).toBeNull();
    expect(readBearer('Bearer')).toBeNull();
    // A token with a space in it is two words, not a token.
    expect(readBearer('Bearer a b')).toBeNull();
  });

  it('takes the first value when a header arrives repeated', () => {
    expect(readBearer(['Bearer first', 'Bearer second'])).toBe('first');
  });
});

describe('MCP over HTTP', () => {
  it('refuses a request with no credential, and says what to send', async () => {
    const base = await listen(vi.fn() as unknown as typeof fetch);
    const res = await rpc(base, INITIALIZE);
    expect(res.status).toBe(401);
    // -32001, not -32600: the request was well formed, the credential was
    // missing, and a client that cannot tell those apart retries forever.
    expect(JSON.parse(res.text).error.code).toBe(-32001);
    expect(res.text).toContain('Authorization');
  });

  it('answers initialize when a credential is present', async () => {
    const base = await listen(vi.fn() as unknown as typeof fetch);
    const res = await rpc(base, INITIALIZE, { authorization: 'Bearer ck_test' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('chatly');
  });

  it('uses the CALLER’s token upstream, per request', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)['authorization'] ?? '');
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const base = await listen(fetchImpl);

    for (const token of ['ck_alice', 'ck_bob']) {
      await rpc(base, INITIALIZE, { authorization: `Bearer ${token}` });
      await rpc(
        base,
        {
          jsonrpc: '2.0' as const,
          id: 2,
          method: 'tools/call',
          params: { name: 'list_labels', arguments: {} },
        },
        { authorization: `Bearer ${token}` },
      );
    }

    // Two different callers, two different upstream credentials. If the
    // server held one context, both would read `Bearer ck_alice`.
    expect(seen).toEqual(['Bearer ck_alice', 'Bearer ck_bob']);
  });

  it('advertises every tool in the registry', async () => {
    const base = await listen(vi.fn() as unknown as typeof fetch);
    await rpc(base, INITIALIZE, { authorization: 'Bearer ck_test' });
    const res = await rpc(
      base,
      { jsonrpc: '2.0' as const, id: 3, method: 'tools/list', params: {} },
      { authorization: 'Bearer ck_test' },
    );
    const { TOOLS } = await import('./tools/index.js');
    // The response is an SSE frame or a JSON body depending on negotiation,
    // so count the tool names rather than parsing a shape.
    for (const t of TOOLS) {
      expect(res.text).toContain(`"${t.name}"`);
    }
  });

  it('serves an unauthenticated liveness probe', async () => {
    const base = await listen(vi.fn() as unknown as typeof fetch);
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuses a GET on the MCP path with the reason', async () => {
    const base = await listen(vi.fn() as unknown as typeof fetch);
    const res = await fetch(`${base}/mcp`, { headers: { authorization: 'Bearer ck_test' } });
    expect(res.status).toBe(405);
    expect(await res.text()).toContain('stateless');
  });

  it('404s any other path', async () => {
    const base = await listen(vi.fn() as unknown as typeof fetch);
    const res = await fetch(`${base}/`, { method: 'POST' });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('/mcp');
  });
});
