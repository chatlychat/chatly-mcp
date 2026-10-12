/**
 * Ticket tools. All reads: a ticket's status, assignee and comments are
 * attributed to a person, and an API key is not one — so the writes stay
 * closed and this surface is for understanding work rather than moving it.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

export const TICKET_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_tickets',
    title: 'List tickets',
    description:
      'Tickets in the workspace. Use the standard filter syntax for status or assignee, e.g. `status:open`.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/tickets', {
        query: { limit: args['limit'], cursor: args['cursor'] },
      }),
  },
  {
    name: 'list_ticket_queues',
    title: 'List ticket queues',
    description: 'The queues tickets are routed into, with their SLA policies.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/tickets/queues'),
  },
  {
    name: 'get_ticket_comments',
    title: 'Read a ticket’s comments',
    description:
      'The internal discussion on one ticket. These are NOT visible to the customer — do not quote one back to them.',
    inputSchema: z.object({ ticketId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/tickets/${String(args['ticketId'])}/comments`),
  },
  {
    name: 'get_tickets_for_conversation',
    title: 'Tickets raised from a conversation',
    description:
      'Whether this thread already has a ticket, and what state it is in. Check before suggesting one is raised.',
    inputSchema: z.object({ conversationId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/tickets/for-conversation/${String(args['conversationId'])}`),
  },
  {
    name: 'get_ticket_conversations',
    title: 'Conversations attached to a ticket',
    description: 'Every thread linked to one ticket, for a ticket raised from several complaints.',
    inputSchema: z.object({ ticketId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/tickets/${String(args['ticketId'])}/conversations`),
  },
];
