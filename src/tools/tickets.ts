/**
 * Ticket tools. All reads: a ticket's status, assignee and comments are
 * attributed to a person, and an API key is not one — so the writes stay
 * closed and this surface is for understanding work rather than moving it.
 *
 * Three ticket writes ARE key-accessible and are deliberately not here.
 * `POST :id/merge` folds one ticket into another and leaves the loser
 * closed and redirected; `POST :id/split` manufactures new tickets out of a
 * thread; `POST /bulk` does either to a list of them at once. Each is a
 * judgement about how work is organised, each is tedious to undo by hand,
 * and a model that guesses wrong has reorganised a real queue. A human with
 * an API key can still do all three.
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
  {
    name: 'get_ticket_status_history',
    title: 'How a ticket moved, and how long it sat',
    description:
      'Every recorded status transition on one ticket, oldest first, with who moved it and the time spent in the previous status. The tool for "why did this take four days" — the answer is usually one status it sat in, which a current-state read cannot show. `truncated` true means the timeline hit its 500-row cap.',
    inputSchema: z.object({ ticketId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/tickets/${String(args['ticketId'])}/status-history`),
  },
  {
    name: 'get_ticket_lineage',
    title: 'Tickets this one came from or leads to',
    description:
      'Split and follow-up relationships in both directions, resolved to ticket numbers and titles. Check it before answering a ticket that looks like it is missing context: the context is often on a parent, or on the ticket this one was split out of.',
    inputSchema: z.object({ ticketId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/tickets/${String(args['ticketId'])}/lineage`),
  },
  {
    name: 'get_ticket_time',
    title: 'Time logged against a ticket',
    description:
      'Each time entry with its minutes, note and billable flag, plus a total. What to quote when asked how much work a ticket took, or what to invoice for it — do not estimate it from timestamps.',
    inputSchema: z.object({ ticketId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/tickets/${String(args['ticketId'])}/time`),
  },
  {
    name: 'get_open_ticket_count',
    title: 'Does this conversation have unfinished work',
    description:
      'The number of OPEN tickets attached to one conversation — keyed by a CONVERSATION id, not a ticket or a queue. One integer, so it is the cheap check before closing a thread or telling a customer their issue is done. Use `get_tickets_for_conversation` when you need to know which tickets they are.',
    inputSchema: z.object({ conversationId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/tickets/open-count/${String(args['conversationId'])}`),
  },
];
