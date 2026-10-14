/**
 * Webhook observability.
 *
 * "Our integration stopped getting events" is one of the most common support
 * questions a workspace asks, and until now a model could not answer any part
 * of it: it could not see the endpoints, the attempts, the HTTP status that
 * came back or the body that was sent. These four reads cover the whole path.
 *
 * `POST /webhooks/deliveries/:id/redeliver` is key-accessible and is NOT a
 * tool. A redelivery re-POSTs a real payload to the customer's own system,
 * which may create an order, charge a card or page somebody; it is also the
 * one action here whose effect lands outside Chatly entirely, where nothing
 * we own can undo it. That belongs to an integrator watching the result, not
 * to a model deciding a retry looks tidy.
 *
 * `POST /webhooks` and `PATCH /webhooks/:id/schema-version` are absent for
 * the ordinary reason: they are configuration writes.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

export const WEBHOOK_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_webhooks',
    title: 'List webhook endpoints',
    description:
      'The endpoints this workspace sends events to, with the event types each is subscribed to, whether it is enabled and which schema version it is pinned to. Read it first when diagnosing a missing event — an endpoint that is disabled, or not subscribed to the event, explains the silence without looking at a single delivery. Signing secrets are not returned by this or any other route.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/webhooks'),
  },
  {
    name: 'list_webhook_deliveries',
    title: 'Webhook delivery attempts',
    description:
      'Every attempt, newest first, with the HTTP status the endpoint returned, the duration, the error and the next retry time. Filter by `status` to find what is failing: `failed` will be retried, `dead` will not and is the one that needs a human. Paginated — pass `nextCursor` back as `cursor`.',
    inputSchema: z.object({
      endpointId: z.string().uuid().optional().describe('Narrow to one endpoint.'),
      status: z
        .enum(['pending', 'delivered', 'failed', 'dead'])
        .optional()
        .describe('`dead` is given up on; `failed` is still being retried.'),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().max(500).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/webhooks/deliveries', {
        query: {
          endpointId: args['endpointId'],
          status: args['status'],
          limit: args['limit'],
          cursor: args['cursor'],
        },
      }),
  },
  {
    name: 'get_webhook_delivery',
    title: 'One delivery, with the exact body we sent',
    description:
      'The whole attempt including the JSON payload as it was POSTed and the endpoint URL as it stands now. This is the tool for "the payload was wrong" or "we never got field X" — read the body rather than reasoning about what the schema should have produced.',
    inputSchema: z.object({ deliveryId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/webhooks/deliveries/${String(args['deliveryId'])}`),
  },
  {
    name: 'list_webhook_event_types',
    title: 'What a webhook can subscribe to',
    description:
      'The platform-wide list of subscribable event types. Check a name here before telling anyone an event exists — the dashboard once offered three the platform never emits, and this route is what settled it.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/webhooks/events'),
  },
  {
    name: 'list_webhook_schema_versions',
    title: 'Pinnable webhook schema versions',
    description:
      'Each published payload version, which event types it carries, which is latest and which are deprecated. Read it when a customer asks what upgrading a pin would change.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/webhooks/schema-versions'),
  },
];
