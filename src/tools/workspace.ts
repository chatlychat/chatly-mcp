/**
 * What the workspace IS: its channels, inboxes, labels, macros, skills and
 * teams — plus `whoami`, which is the first thing to call when a tool fails
 * with a 403 and you need to know what this key can actually do.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

export const WORKSPACE_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'whoami',
    title: 'What this credential can do',
    description:
      'The workspace this credential belongs to and the scopes it holds. Call this when a tool returns 403 — the answer is almost always a missing scope rather than a missing feature.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/api-keys/whoami'),
  },
  {
    name: 'list_channels',
    title: 'List channels',
    description:
      'Every channel the workspace has connected — web widget, email, WhatsApp, social. Credentials are redacted.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/channels'),
  },
  {
    name: 'list_inboxes',
    title: 'List inboxes',
    description: 'The inboxes conversations are routed into, with their routing mode.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/inboxes'),
  },
  {
    name: 'list_labels',
    title: 'List labels',
    description:
      'The workspace taxonomy. Matching is case-insensitive everywhere, so prefer an existing label over a near-duplicate.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/labels'),
  },
  {
    name: 'list_macro_templates',
    title: 'List macro templates',
    description:
      'Pre-written reply and action templates the workspace could install. Use these as a model for tone rather than inventing one.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/macros/templates'),
  },
  {
    name: 'get_macro_template',
    title: 'Read a macro template',
    description: 'One template’s body and actions, by slug.',
    inputSchema: z.object({ slug: z.string().min(1).max(200) }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/macros/templates/${encodeURIComponent(String(args['slug']))}`),
  },
  {
    name: 'list_macro_actions',
    title: 'What a macro can do',
    description:
      'The action vocabulary available to a macro. Read it before suggesting a macro that does something unsupported.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/macros/actions'),
  },
  {
    name: 'list_agent_skills',
    title: 'The workspace skill taxonomy',
    description:
      'Distinct skill labels agents are tagged with — what routing can match on. Useful for "who should handle this".',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/agents/skills'),
  },
  {
    name: 'get_team_members',
    title: 'Who is on a team',
    description: 'The roster of one team, for deciding where work should go.',
    inputSchema: z.object({ teamId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/teams/${String(args['teamId'])}/members`),
  },
  {
    name: 'list_brands',
    title: 'List brands',
    description:
      'Sub-tenants inside this workspace, for a customer running several products through one account.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/brands'),
  },
];
