/**
 * Search and the knowledge base.
 *
 * `search` first, always: it is the one tool that answers "does this already
 * exist" across every entity type, and a model that skips it invents an
 * answer the workspace already wrote down.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

export const KNOWLEDGE_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'search',
    title: 'Search Chatly',
    description:
      'Full-text search across contacts, conversations, messages, tickets and knowledge-base articles. Use this first when asked about anything that already exists in the workspace.',
    inputSchema: z.object({
      q: z
        .string()
        .min(1)
        .describe('Search terms. Quotes match a phrase; a leading minus excludes.'),
      kinds: z
        .array(z.enum(['contact', 'conversation', 'message', 'ticket', 'kb']))
        .optional()
        .describe('Restrict to these entity types.'),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/search', {
        query: {
          q: args['q'],
          limit: args['limit'],
          /*
           * A plain `kinds`, as an ARRAY. Two bugs in one line before this:
           * the key was the bracketed `kinds[]`, which `searchQuerySchema`
           * strips as unknown (so the search ran unnarrowed and returned
           * everything with a 200), and the values were comma-JOINED, so even
           * once the key was read the value `"kb,ticket"` is not a member of
           * the enum. Every `search` tool call with a `kinds` argument has
           * been silently ignoring it.
           */
          ...(Array.isArray(args['kinds']) ? { kinds: args['kinds'] as string[] } : {}),
        },
      }),
  },
  {
    name: 'search_kb',
    title: 'Search the knowledge base',
    description:
      'Find help-centre articles. Prefer answering from these over inventing an answer — results carry ids you can cite.',
    inputSchema: z.object({
      q: z.string().min(1),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/search', {
        // `kinds`, not `kinds[]` — the bracketed key is stripped by the
        // schema, and this tool was searching every entity type while
        // telling the model it had searched the knowledge base.
        query: { q: args['q'], kinds: ['kb'], limit: args['limit'] },
      }),
  },
  {
    name: 'list_kb_articles',
    title: 'List knowledge-base articles',
    description:
      'Articles in the workspace, newest first. Use `search_kb` when you have a question; use this when you want to know what is documented at all.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/kb/articles', {
        query: { limit: args['limit'], cursor: args['cursor'] },
      }),
  },
  {
    name: 'get_kb_article',
    title: 'Read a knowledge-base article',
    description:
      'The full body of one article, by slug. Read it before paraphrasing it to a customer.',
    inputSchema: z.object({ slug: z.string().min(1).max(200) }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/kb/articles/${encodeURIComponent(String(args['slug']))}`),
  },
  {
    name: 'list_kb_collections',
    title: 'List knowledge-base collections',
    description: 'How the help centre is organised — useful for deciding where a new article goes.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/kb/collections'),
  },
  {
    name: 'list_docs_sources',
    title: 'Connected documentation providers',
    description:
      'External docs (GitBook, Forumulate, Discourse, ReadMe, a crawled site) syncing into the knowledge base, with their last sync and any error.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/docs-sources'),
  },
  {
    name: 'sync_docs_source',
    title: 'Sync a documentation source now',
    description:
      'Enqueues the same job the periodic scan runs. Use it after an edit upstream rather than waiting for the interval.',
    inputSchema: z.object({ sourceId: z.string().uuid() }),
    mutating: true,
    run: (ctx, args) =>
      call(ctx, 'POST', `/v1/docs-sources/${String(args['sourceId'])}/sync`, { body: {} }),
  },
];
