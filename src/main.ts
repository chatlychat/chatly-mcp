#!/usr/bin/env node
/**
 * Chatly MCP server.
 *
 * Exposes a curated set of workspace operations to any Model Context Protocol
 * host — Claude Desktop, Claude Code, an IDE, or a hosted client over HTTP.
 *
 * ## Two transports, one tool registry
 *
 * **stdio** (the default) is for local tooling: the host launches this as a
 * child process, so there is no port to expose and no network surface to
 * secure. The credential comes from `CHATLY_API_KEY` once, at boot.
 *
 * **HTTP** (`--http`, or `MCP_HTTP_PORT`) is for a hosted client that cannot
 * spawn a process on the user's machine. There the credential is the CALLER's
 * own `Authorization` header, per request — see `http.ts`, which explains why
 * that forces a fresh server per request.
 *
 * ## Auth
 *
 * This process holds no credentials of its own and mints nothing. Every call
 * is made as the supplied credential, so the workspace's existing RBAC
 * decides what the model can actually do. A key scoped to read-only
 * permissions makes every mutating tool fail at the API boundary, which is
 * the correct place for that decision rather than a flag in here.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { createMcpHttpServer } from './http.js';
import { createMcpServer } from './server.js';

const envSchema = z.object({
  CHATLY_API_URL: z.string().url().default('http://localhost:4000'),
  /**
   * Required for stdio and ignored for HTTP.
   *
   * Not `.optional()` with a runtime branch, because the failure it prevents
   * is a stdio server that starts, advertises every tool and 401s on every one
   * of them. The HTTP path parses its own narrower schema below.
   */
  CHATLY_API_KEY: z.string().min(10, 'CHATLY_API_KEY is required').optional(),
  MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
});

/** stderr, never stdout: stdout IS the MCP protocol channel in stdio mode. */
function die(message: string): never {
  process.stderr.write(`chatly-mcp: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    die(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const env = parsed.data;
  const wantsHttp = process.argv.includes('--http') || env.MCP_HTTP_PORT !== undefined;

  if (wantsHttp) {
    const port = env.MCP_HTTP_PORT ?? 4010;
    const server = createMcpHttpServer({ baseUrl: env.CHATLY_API_URL });
    server.listen(port, () => {
      // Safe on stdout here: nothing is speaking MCP over it in HTTP mode.
      process.stdout.write(`chatly-mcp: listening on :${String(port)}/mcp\n`);
    });
    return;
  }

  if (env.CHATLY_API_KEY === undefined) {
    die('CHATLY_API_KEY is required for the stdio transport (or pass --http).');
  }

  const server = createMcpServer({
    baseUrl: env.CHATLY_API_URL,
    apiKey: env.CHATLY_API_KEY,
    fetchImpl: fetch,
  });
  await server.connect(new StdioServerTransport());
}

void main().catch((err: unknown) => {
  die(`fatal: ${String(err)}`);
});
