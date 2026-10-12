/**
 * Contact tools, including the two that make this server more than a reader:
 * `create_contact` upserts by `externalId`, and `track_event` is the
 * ingestion route keys exist for.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

export const CONTACT_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_contacts',
    title: 'List contacts',
    description: 'Contacts in the workspace, newest first.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/contacts', {
        query: { limit: args['limit'], cursor: args['cursor'] },
      }),
  },
  {
    name: 'get_contact',
    title: 'Get one contact',
    description:
      'One contact with their email, phone, locale, tags and custom attributes. Use `search` first if you have a name or an email rather than an id.',
    inputSchema: z.object({ contactId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/contacts/${String(args['contactId'])}`),
  },
  {
    name: 'get_contact_journey',
    title: 'Everything that happened to this contact',
    description:
      'A merged timeline — conversations, tracked events, tickets, surveys. The single best tool for "what is going on with this customer".',
    inputSchema: z.object({
      contactId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/contacts/${String(args['contactId'])}/journey`, {
        query: { limit: args['limit'] },
      }),
  },
  {
    name: 'get_contact_mood',
    title: 'How this contact has been feeling',
    description:
      'Sentiment across this contact’s recent messages. Use it to decide tone, not to decide facts.',
    inputSchema: z.object({ contactId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/contacts/${String(args['contactId'])}/mood`),
  },
  {
    name: 'get_customer_cards',
    title: 'Live data from the workspace’s own backend',
    description:
      'Customer cards for this contact — the plan, the invoice, the shipment, whatever this workspace configured. Pulled live from their systems, so it is the freshest thing available and may be unavailable.',
    inputSchema: z.object({
      contactId: z.string().uuid(),
      conversationId: z.string().uuid().optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'POST', `/v1/contacts/${String(args['contactId'])}/cards`, {
        body:
          args['conversationId'] === undefined ? {} : { conversationId: args['conversationId'] },
      }),
  },
  {
    name: 'list_contact_events',
    title: 'Tracked events',
    description:
      'Product events recorded against contacts. Answers "did my tracking call land" and "what did they do before writing in".',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', '/v1/cdp/events', { query: { limit: args['limit'] } }),
  },
  {
    name: 'create_contact',
    title: 'Create or update a contact',
    description:
      'Upserts by `externalId` — calling it twice with the same one updates rather than duplicating. Omit `externalId` only if you want a new contact every time.',
    inputSchema: z.object({
      externalId: z.string().max(256).optional().describe('Your own id for this person.'),
      email: z.string().email().optional(),
      phone: z.string().max(32).optional(),
      name: z.string().max(160).optional(),
      locale: z.string().max(10).optional(),
      timezone: z.string().max(64).optional(),
    }),
    mutating: true,
    run: (ctx, args) => call(ctx, 'POST', '/v1/contacts', { body: args }),
  },
  {
    name: 'tag_contact',
    title: 'Add a tag to a contact',
    description:
      'Tags drive saved views, routing and reports, so prefer a tag the workspace already uses — `list_labels` shows them.',
    inputSchema: z.object({ contactId: z.string().uuid(), tag: z.string().min(1).max(64) }),
    mutating: true,
    run: (ctx, args) =>
      call(ctx, 'POST', `/v1/contacts/${String(args['contactId'])}/tags`, {
        body: { tag: args['tag'] },
      }),
  },
  {
    name: 'untag_contact',
    title: 'Remove a tag from a contact',
    description: 'Removes one tag. The tag itself stays in the workspace registry.',
    inputSchema: z.object({ contactId: z.string().uuid(), tag: z.string().min(1).max(64) }),
    mutating: true,
    run: (ctx, args) =>
      call(
        ctx,
        'DELETE',
        `/v1/contacts/${String(args['contactId'])}/tags/${encodeURIComponent(String(args['tag']))}`,
      ),
  },
  {
    name: 'track_event',
    title: 'Record a product event',
    description:
      'Records something this contact did in the product. Events appear on their journey and can trigger workflows, so a wrong event name is not merely untidy.',
    inputSchema: z.object({
      contactId: z.string().uuid(),
      name: z.string().min(1).max(120).describe('e.g. "trial_started", "plan_upgraded"'),
    }),
    mutating: true,
    run: (ctx, args) =>
      call(ctx, 'POST', '/v1/cdp/events', {
        body: { contactId: args['contactId'], name: args['name'], properties: {} },
      }),
  },
  {
    name: 'unsubscribe_contact',
    title: 'Opt this contact out',
    description:
      'Marks the contact unsubscribed from campaigns and bulk sends. Honour a request to stop being emailed with this rather than by deleting them.',
    inputSchema: z.object({ contactId: z.string().uuid() }),
    mutating: true,
    run: (ctx, args) =>
      call(ctx, 'POST', `/v1/contacts/${String(args['contactId'])}/unsubscribe`, { body: {} }),
  },
];
