/**
 * What the workspace IS: its channels, inboxes, labels, macros, skills and
 * teams — plus `whoami`, which is the first thing to call when a tool fails
 * with a 403 and you need to know what this key can actually do.
 *
 * Reads only. Every write on this surface is configuration — a macro, a
 * channel, a brand, a trigger — and a wrong one is not a bad answer in one
 * conversation but a standing change to how the workspace behaves, applied
 * to everybody, with nobody watching. `POST`/`PATCH`/`DELETE /v1/macros` and
 * `PATCH /v1/channels/:id` are all key-accessible and all deliberately
 * absent.
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
    name: 'get_channel',
    title: 'Read one channel',
    description:
      'One channel with its settings, as `list_channels` returns them but for a single id — including `originsRestricted`, which is what answers "why does the widget not load on their site". Credentials are redacted on this route exactly as on the list; there is no way to read a channel secret through MCP.',
    inputSchema: z.object({ channelId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/channels/${String(args['channelId'])}`),
  },
  {
    name: 'get_workspace_settings',
    title: 'Workspace settings',
    description:
      'The settings blob: business hours, privacy and retention choices, onboarding state, portal and widget preferences. Read it before telling anyone how their workspace behaves — most "why did it do that" questions are answered by a setting rather than by a bug.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/workspace/settings'),
  },
  {
    name: 'list_macros',
    title: 'The workspace macro library',
    description:
      'The macros this workspace has actually written — canned replies and conversation actions, ranked by how much they are used. Prefer wording from here over inventing your own: it is the voice the customer already hears. Distinct from `list_macro_templates`, which is the catalogue of macros they could install but have not. Answers a BARE ARRAY, not a page, capped at 200 rows.',
    inputSchema: z.object({
      query: z.string().max(120).optional().describe('Substring match on name or body.'),
      scope: z.enum(['workspace', 'team', 'personal']).optional(),
      team: z.string().uuid().optional().describe('Only macros scoped to this team.'),
      language: z
        .string()
        .max(8)
        .optional()
        .describe('Ranks macros in this language first. Does not filter.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/macros', {
        query: {
          query: args['query'],
          scope: args['scope'],
          team: args['team'],
          language: args['language'],
        },
      }),
  },
  {
    name: 'get_macro',
    title: 'Read one macro',
    description:
      'One macro’s full body, short code and actions, by id. Read it before describing what applying it would do — the actions are what change the conversation, not the text.',
    inputSchema: z.object({ macroId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', `/v1/macros/${String(args['macroId'])}`),
  },
  {
    name: 'list_api_key_scopes',
    title: 'Every scope a key can hold',
    description:
      'The static vocabulary of API-key permissions, grouped by prefix. Pair it with `whoami` when a tool 403s: `whoami` says what this credential holds, this says what it could have been granted, and the difference is the answer to give the customer.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/api-keys/scopes'),
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
