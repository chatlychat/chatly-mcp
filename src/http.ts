/**
 * Remote MCP over Streamable HTTP.
 *
 * ── Why a remote transport at all ───────────────────────────────────────
 *
 * stdio covers local tooling: a host launches this as a child process and
 * there is no port and no network surface. It does NOT cover a hosted client
 * — claude.ai, a team's shared workspace, anything that cannot spawn a
 * process on the user's machine. Those connect to a URL, and a URL is the
 * difference between "a developer can wire this up" and "a workspace can turn
 * it on".
 *
 * ── The auth design, which is the whole point ───────────────────────────
 *
 * **This server holds no credential.** The caller's own `Authorization`
 * header IS the Chatly credential, taken per request and used verbatim: a
 * `ck_` workspace API key, or an Atlas session token for a signed-in agent.
 * The API already accepts both, and already decides what each can do.
 *
 * That is why the server is built PER REQUEST rather than once at boot. A
 * process-wide server holding one context would serve every caller as whoever
 * started it — which, on a shared deployment, is a cross-tenant read dressed
 * as a feature. There is no session store and no token exchange here, so
 * there is nothing to leak and nothing to keep in sync; the cost is one
 * `Server` object per request, which is cheap next to the HTTP call each tool
 * makes anyway.
 *
 * Stateless mode (`sessionIdGenerator: undefined`) follows from the same
 * decision: a session would be state keyed by something other than the
 * credential, and then the credential would stop being the whole answer.
 *
 * ── Deliberately NOT here ───────────────────────────────────────────────
 *
 * No OAuth authorization-server metadata, no dynamic client registration. If
 * a host needs an OAuth flow, Atlas is the authorization server and Chatly is
 * a resource server (ADR 0047) — the token it issues arrives in this same
 * header. Re-implementing a second authorization server inside an MCP proxy
 * would be a second place for consent and revocation to disagree.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createMcpServer } from './server.js';

import type { Server as HttpServer } from 'node:http';

/** The one path. A client configures `https://host/mcp`. */
const MCP_PATH = '/mcp';

/**
 * JSON-RPC's own error shape, since a transport-level refusal happens before
 * any MCP machinery exists to format it.
 *
 * `-32001` rather than `-32600`: the request was well-formed, it was the
 * credential that was missing, and a client that cannot tell those apart will
 * retry a malformed request forever.
 */
function rpcError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/** The bearer token, or null. Never logged — it is a live credential. */
export function readBearer(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') {
    return null;
  }
  const m = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  return m?.[1] ?? null;
}

export function createMcpHttpServer(opts: {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}): HttpServer {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res, opts);
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { readonly baseUrl: string; readonly fetchImpl?: typeof fetch },
): Promise<void> {
  const path = (req.url ?? '').split('?')[0] ?? '';

  // An unauthenticated liveness probe, so a load balancer does not need a
  // credential to decide this process is up.
  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (path !== MCP_PATH) {
    rpcError(res, 404, -32601, `Not found. The MCP endpoint is ${MCP_PATH}.`);
    return;
  }

  /*
   * Stateless mode answers POST only. A GET on this path is a client
   * expecting a server-initiated SSE stream, which needs a session to hang
   * it off — so it is refused with the reason rather than left to time out.
   */
  if (req.method !== 'POST') {
    rpcError(
      res,
      405,
      -32601,
      'This endpoint is stateless and accepts POST only. Server-initiated streams are not offered.',
    );
    return;
  }

  const token = readBearer(req.headers.authorization);
  if (token === null) {
    rpcError(
      res,
      401,
      -32001,
      'Send a Chatly credential as `Authorization: Bearer <token>` — a `ck_` workspace API key, or an Atlas session token.',
    );
    return;
  }

  const server = createMcpServer({
    baseUrl: opts.baseUrl,
    apiKey: token,
    fetchImpl: opts.fetchImpl ?? fetch,
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  /*
   * Closed on the way out, both of them, in a `finally`.
   *
   * A per-request server that is not closed leaks a `Server` and its
   * transport's listeners for the life of the process — which is the failure
   * mode of exactly this pattern, and it looks like a slow memory leak under
   * load rather than like a bug in request handling.
   */
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err: unknown) {
    if (!res.headersSent) {
      rpcError(res, 500, -32603, err instanceof Error ? err.message : String(err));
    }
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
