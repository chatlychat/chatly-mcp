/**
 * Conversation tools: read the thread, then act on it.
 *
 * `send_message` is the only mutating one, and it is the whole point of the
 * server — everything else here exists so a model can read before it writes.
 *
 * The four other key-accessible writes on this surface are deliberately not
 * tools. `POST :id/scheduled-messages` is `send_message` with a timer, and a
 * message a human cannot see yet is one nobody will catch before the
 * customer does; `DELETE scheduled-messages/:id` silently unsends a
 * colleague's planned reply; `PUT :id/agent-handling` takes a thread off
 * whoever has it, or drops one mid-conversation; `POST
 * :id/generated-replies` spends the workspace's AI budget per call. Every
 * one of them is reachable with an API key by an integrator who meant it.
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
    name: 'get_unread_counts',
    title: 'The inbox badges',
    description:
      'Unread totals for this credential — overall, and bucketed per inbox, team and label. The fastest read of "where is the backlog": one call, no listing. It is scoped to what this credential may open, so a number here is a number the caller could act on.',
    inputSchema: z.object({
      brand: z.string().uuid().optional().describe('Narrow to one brand.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/conversations/unread-counts', { query: { brand: args['brand'] } }),
  },
  {
    name: 'get_scheduled_messages',
    title: 'Sends queued on this thread',
    description:
      'Messages an agent queued to go out later, with their send times. ALWAYS check this before replying: the customer has not seen these yet, and answering the same point again — or contradicting it — is the failure this tool exists to prevent. Cancelling one is not available here; ask a human.',
    inputSchema: z.object({ conversationId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/conversations/${String(args['conversationId'])}/scheduled-messages`),
  },
  {
    name: 'get_generated_replies',
    title: 'AI-drafted replies awaiting a human',
    description:
      'Replies an AI agent proposed on this thread, pending or recently decided, with who edited or discarded them and why. Read it to see whether a draft is already waiting rather than writing a second one, and to learn how this workspace rewrites drafts before they go out.',
    inputSchema: z.object({ conversationId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/conversations/${String(args['conversationId'])}/generated-replies`),
  },
  {
    name: 'get_agent_handling',
    title: 'Who is working this thread',
    description:
      'Whether a BYO agent has claimed this conversation, which one, and when — `handling` is null when nobody has. Check it before replying: another agent holding the thread means your reply arrives on top of theirs. Claiming or releasing a thread is a write and is not exposed.',
    inputSchema: z.object({ conversationId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/conversations/${String(args['conversationId'])}/agent-handling`),
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
