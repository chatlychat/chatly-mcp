/**
 * Conversation tools: read the thread, then act on it.
 *
 * `send_message` is the only mutating one, and it is the whole point of the
 * server — everything else here exists so a model can read before it writes.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

export const CONVERSATION_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_conversations',
    title: 'List conversations',
    description:
      'Recent conversations, newest first. Filter by status to find open work. Use `filters` for the standard filter syntax, e.g. `status:open` or `assigneeUserId:<uuid>`.',
    inputSchema: z.object({
      status: z.string().optional().describe('Shortcut for one status: open, pending, closed'),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional().describe('From a previous response, to page forward.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/conversations', {
        query: { status: args['status'], limit: args['limit'], cursor: args['cursor'] },
      }),
  },
  {
    name: 'get_conversation',
    title: 'Get one conversation',
    description:
      'One conversation with its status, channel, assignee and contact — without its messages. Cheaper than `get_messages` when you only need to know the state of a thread.',
    inputSchema: z.object({ conversationId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/conversations/${String(args['conversationId'])}`),
  },
  {
    name: 'get_messages',
    title: 'Read a conversation',
    description: 'Messages in one conversation, so you can read the thread before acting on it.',
    inputSchema: z.object({
      conversationId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/conversations/${String(args['conversationId'])}/messages`, {
        query: { limit: args['limit'] },
      }),
  },
  {
    name: 'list_unattended_conversations',
    title: 'Conversations nobody has answered',
    description:
      'Open conversations with no agent reply, oldest first. This is the queue a human is about to be judged on, so it is the right place to start when asked what needs attention.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/conversations/unattended', { query: { limit: args['limit'] } }),
  },
  {
    name: 'get_linked_conversations',
    title: 'Conversations linked to this one',
    description:
      'Threads marked as duplicates or follow-ups of this one. Worth checking before answering, so the same question is not answered twice differently.',
    inputSchema: z.object({ conversationId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/conversations/${String(args['conversationId'])}/linked`),
  },
  {
    name: 'send_message',
    title: 'Reply in a conversation',
    description:
      'Send a message as an agent. This is visible to the customer immediately — read the thread first and be sure a reply is wanted.',
    inputSchema: z.object({
      conversationId: z.string().uuid(),
      body: z.string().min(1).max(10_000),
    }),
    mutating: true,
    run: (ctx, args) =>
      call(ctx, 'POST', `/v1/conversations/${String(args['conversationId'])}/messages`, {
        body: { conversationId: args['conversationId'], body: args['body'], kind: 'text' },
      }),
  },
];
