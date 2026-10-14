/**
 * Bots, their routing table, and why a push-delivered agent is not answering.
 *
 * "Our assistant stopped replying" has three completely different causes and
 * a model could not previously distinguish any of them: no route matched, a
 * route matched and the agent's endpoint is rejecting us, or the bot is
 * paused. These five reads cover the path end to end — the table, the dry-run
 * that explains it, the bot itself, and the delivery ledger with the HTTP
 * status the customer's own endpoint returned.
 *
 * `POST /v1/bot-routes/resolve` is a POST and it is NOT mutating. It reads no
 * conversation, writes no row, and takes a hypothetical visitor in the body
 * because that is too much structure for a query string. `mutating: false` is
 * a claim about effect, not about the verb, and `registry.spec.ts` pins the
 * mutating set by NAME so this cannot be loosened quietly.
 *
 * What is deliberately absent:
 *
 *   - `POST /v1/bots/{id}/deliveries/{id}/redeliver` — it re-POSTs a real
 *     payload to the customer's own system, which may create an order or
 *     charge a card, and the effect lands outside Chatly where nothing we own
 *     can undo it. Same reasoning as the webhook redelivery, one feature over.
 *   - `POST /v1/bots/{id}/test-delivery` — it POSTs to a third party's
 *     endpoint. Harmless in intent and still an outbound request a model
 *     should not be making on its own initiative.
 *   - every write on `/v1/bots` and `/v1/bot-routes` — configuration, and
 *     `rotate-secret` additionally invalidates a live credential with no
 *     overlap window.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

export const BOT_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_bots',
    title: 'List bots and external agents',
    description:
      'Every configured bot, with its status and type. `type: "external"` is a customer-run agent reached by webhook; the rest are Chatly personas. A bot that is `paused` or `draft` answers nothing however well a route matched, which is the first thing to rule out when an assistant has gone quiet. Paginated — pass `nextCursor` back as `cursor`.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().max(500).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/bots', {
        query: {
          ...(args.limit === undefined ? {} : { limit: args.limit }),
          ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
        },
      }),
  },
  {
    name: 'list_bot_routes',
    title: 'The routing table, in evaluation order',
    description:
      'Which bot answers where. Ordered by priority ascending with ties broken on creation time, and the FIRST match wins — not most-specific-wins, which is the assumption that causes most routing surprises. Each route carries its channel filter, its brand scope, its conditions and whether it is enabled.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/bot-routes'),
  },
  {
    name: 'resolve_bot_route',
    title: 'Dry-run the routing table',
    description:
      'Given a hypothetical visitor, which bot would answer and why not the others. Answers `{ selected, routes, event }`: every enabled route with a verdict (`matched`, `not_eligible_at_moment`, `channel_excluded`, `brand_excluded`, `condition_failed`), plus the event object the conditions were evaluated against. A failed condition carries `actual` — the value the field resolved to — which is the whole diagnosis: absent means the visitor has no such attribute, a different value means routing works and the expectation was wrong. Writes nothing and reads no conversation. Set `moment` to `follow_up` to find out why a route works on the first message and then stops.',
    inputSchema: z.object({
      page: z
        .object({ url: z.string().max(2_048).optional(), path: z.string().max(1_024).optional() })
        .optional()
        .describe('`path` is derived from `url` when only the URL is given.'),
      context: z
        .object({
          verified: z.record(z.string(), z.string()).optional(),
          unverified: z.record(z.string(), z.string()).optional(),
        })
        .optional()
        .describe('Signed and unsigned visitor attributes, as a condition reads them.'),
      contact: z
        .object({
          identityVerified: z.boolean().optional(),
          attributes: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
      channelType: z.string().max(40).optional().describe('Defaults to `web`.'),
      brandId: z.string().uuid().optional(),
      locale: z.string().max(16).optional(),
      body: z
        .string()
        .max(4_000)
        .optional()
        .describe('The message text, for `contains`/`matches`.'),
      moment: z.enum(['conversation_start', 'follow_up']).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'POST', '/v1/bot-routes/resolve', {
        /*
         * Only the keys the caller supplied. The route's schema is `.strict()`
         * and every field has a default, so sending `undefined` for an
         * absent one would be the difference between "no page" and a 400.
         */
        body: Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)),
      }),
  },
  {
    name: 'list_agent_deliveries',
    title: 'What we pushed to an external agent',
    description:
      "An external agent's delivery ledger, newest first: the status, how many attempts were made, the HTTP status its endpoint returned, the latency and the first 300 characters of its error body. `failed` will be retried; `dead` will not and needs a human. `dead` with a 401 is the customer's signature check; `dead` with a null HTTP status is a timeout or DNS; `failed` with a 503 is their load balancer and will clear itself. The signed payload is not in a list row — read one delivery for it. A 404 means the bot is not an external agent, so it has no ledger.",
    inputSchema: z.object({
      botId: z.string().uuid().describe('The external agent.'),
      status: z
        .enum(['pending', 'delivered', 'failed', 'dead'])
        .optional()
        .describe('`dead` is given up on; `failed` is still being retried.'),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().max(500).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/bots/${encodeURIComponent(String(args.botId))}/deliveries`, {
        query: {
          ...(args.status === undefined ? {} : { status: args.status }),
          ...(args.limit === undefined ? {} : { limit: args.limit }),
          ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
        },
      }),
  },
  {
    name: 'get_agent_delivery',
    title: 'One delivery, with the body that was signed',
    description:
      'The same fields as the list plus `payload` — the exact object that was serialised, signed and POSTed. Every retry re-sends these bytes, so this is what the integrator received, not a reconstruction. Use it when the ledger says a delivery was rejected and the question is what was in it.',
    inputSchema: z.object({
      botId: z.string().uuid(),
      deliveryId: z.string().uuid(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(
        ctx,
        'GET',
        `/v1/bots/${encodeURIComponent(String(args.botId))}/deliveries/${encodeURIComponent(
          String(args.deliveryId),
        )}`,
      ),
  },
];
