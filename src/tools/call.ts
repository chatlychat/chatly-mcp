/**
 * What every MCP tool shares: the API context, the definition shape, and the
 * one function that makes the request.
 *
 * Split out of `tools.ts` when the tool set went from 6 to 36 — one file
 * holding the caller and every definition would be well past this repo's
 * 650-line ceiling, and the domains have nothing to say to each other.
 */
import type { z } from 'zod';

/** Everything a tool needs to reach the API. */
export interface ApiContext {
  readonly baseUrl: string;
  /**
   * A `ck_` workspace API key, or an Atlas session token.
   *
   * In stdio mode this comes from the operator's environment once. Over HTTP
   * it is the CALLER's own `Authorization` header, per request — see
   * `http.ts`. Either way this process holds no credential of its own and
   * mints nothing: the workspace's RBAC decides what the model can do, at the
   * API boundary, which is the correct place for that decision rather than a
   * flag in here.
   */
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
}

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodTypeAny;
  /**
   * True when the tool changes state. Surfaced to the host as
   * `readOnlyHint: false` so a client can require confirmation — a model
   * should not silently close a customer's conversation because it thought
   * that was tidy.
   */
  readonly mutating: boolean;
  readonly run: (ctx: ApiContext, args: Record<string, unknown>) => Promise<unknown>;
}

export async function call(
  ctx: ApiContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  init?: { query?: Record<string, unknown>; body?: unknown },
): Promise<unknown> {
  const url = new URL(`${ctx.baseUrl.replace(/\/+$/, '')}${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${ctx.apiKey}`,
    'content-type': 'application/json',
  };
  // Every write on this API requires an idempotency key. Minting one per call
  // means an MCP host retrying a tool call cannot double-post a message.
  if (method !== 'GET') {
    headers['idempotency-key'] = crypto.randomUUID();
  }
  const res = await ctx.fetchImpl(url.toString(), {
    method,
    headers,
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface the API's own error to the model — it is structured and often
    // actionable ("conversation is already closed"), which a generic
    // "request failed" is not.
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return text.length === 0 ? null : (JSON.parse(text) as unknown);
}

/**
 * The repeated `?filter[]=` / `?limit=` shape, built once.
 *
 * The API's list convention is `?filter[]=field:value` repeated, and
 * `URLSearchParams.set` would overwrite rather than repeat — so a tool taking
 * several filters joins them here, matching `qs.parse({ comma: false })`.
 */
export function listQuery(args: {
  limit?: unknown;
  cursor?: unknown;
  filters?: readonly string[];
}): Record<string, unknown> {
  return {
    ...(args.limit === undefined ? {} : { limit: args.limit }),
    ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
    ...(args.filters === undefined || args.filters.length === 0
      ? {}
      : { 'filter[]': args.filters.join(',') }),
  };
}
