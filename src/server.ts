/**
 * One MCP server instance, bound to one API context.
 *
 * Factored out of `main.ts` because the HTTP transport builds a FRESH server
 * per request: over HTTP the credential is the caller's own `Authorization`
 * header, so a process-wide server holding one context would serve every
 * caller as whoever started it. Over stdio there is exactly one context and
 * exactly one of these.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { toJsonSchema } from './json-schema.js';
import { TOOLS, TOOLS_BY_NAME, type ApiContext } from './tools/index.js';

export const SERVER_INFO = { name: 'chatly', version: '0.2.0' } as const;

export function createMcpServer(ctx: ApiContext): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: toJsonSchema(t.inputSchema),
      annotations: {
        readOnlyHint: !t.mutating,
        /*
         * `untag_contact` is the only DELETE here and it removes a label from
         * a contact, not the contact. Nothing in this registry destroys a
         * record, and nothing should: a model that can delete a customer on a
         * misread is a product decision nobody made.
         */
        destructiveHint: false,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS_BY_NAME.get(req.params.name);
    if (tool === undefined) {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    const args = tool.inputSchema.safeParse(req.params.arguments ?? {});
    if (!args.success) {
      // Give the model the validation failure rather than a generic error —
      // it can usually correct the call on the next turn.
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Invalid arguments: ${args.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          },
        ],
      };
    }
    try {
      const result = await tool.run(ctx, args.data as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: err instanceof Error ? err.message : String(err) },
        ],
      };
    }
  });

  return server;
}
