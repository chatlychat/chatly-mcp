/**
 * Reporting tools.
 *
 * Every one of these is an AGGREGATE over a bounded window, which is why they
 * are safe to hand a model: there is no cursor to exhaust and no per-customer
 * detail in the response. A question like "how did we do last week" should be
 * answered from one of these rather than by listing a thousand conversations
 * and counting them.
 *
 * ── Why each one is written out long-hand ────────────────────────────────
 *
 * These were built by a `report(name, title, description, path)` helper, and
 * two things were wrong with that. The small one: three of the thirteen do
 * not take `?days=` at all, so a single shared schema could only be right
 * for ten of them — `report_cohorts` sent `days` to a handler that reads
 * `?weeks` and silently answered for the default eight weeks, whatever the
 * model asked for.
 *
 * The large one: every reader of this directory is a TEXT parser. The helper
 * put each path in a positional argument with no `call(` in the block and no
 * literal `name:` key, so `reachability.spec.ts` needed a second regex to see
 * these at all, and `scripts/audit/surface-parity.mjs` — which has only the
 * first shape — reported four reports as missing from MCP while they were
 * sitting in this file. A green parity audit listing routes the server
 * already has is the same class of failure as a green gate that parsed
 * nothing. One shape, one parser, no exemptions.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

/**
 * The window most reports take. 90 days is the clamp in the handlers — a
 * larger `days` is not refused, it is quietly reduced, so asking for 365 here
 * would get a 90-day answer under a 365-day heading.
 */
const window90 = z.object({
  days: z.number().int().min(1).max(90).optional().describe('Look-back window in days.'),
});

/**
 * `?days=` plus the explicit range the three newer reports accept. `from` is
 * inclusive and `to` is EXCLUSIVE; a bare date is read as UTC midnight. An
 * explicit range over 366 days is refused rather than clamped, so a figure
 * never arrives under a window nobody asked for.
 */
const windowRange = z.object({
  days: z.number().int().min(1).max(366).optional().describe('Look-back window. Default 30.'),
  from: z
    .string()
    .max(40)
    .optional()
    .describe('Inclusive start — "2026-07-01" or "2026-07-01T09:00:00Z". Wins over `days`.'),
  to: z.string().max(40).optional().describe('EXCLUSIVE end. Use with `from`.'),
});

export const REPORT_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'report_overview',
    title: 'Workspace overview',
    description:
      'Conversation volume, response and resolution times, CSAT. Start here for "how are we doing" — then reach for a narrower report once you know which number moved.',
    inputSchema: window90,
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', '/v1/reports/overview', { query: { days: args['days'] } }),
  },
  {
    name: 'report_conversations_by_day',
    title: 'Conversations per day',
    description:
      'Daily buckets over the window — the shape of demand, for spotting a spike nobody mentioned. Use this rather than `report_overview` when the question is "when", not "how much".',
    inputSchema: window90,
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/reports/conversations-by-day', { query: { days: args['days'] } }),
  },
  {
    name: 'report_agents',
    title: 'Per-agent performance',
    description:
      'Volume, first-response and resolution time per agent. Numbers about people: report them, do not editorialise about them.',
    inputSchema: window90,
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', '/v1/reports/agents', { query: { days: args['days'] } }),
  },
  {
    name: 'report_sources',
    title: 'Where conversations come from',
    description:
      'Volume by channel. Answers "is the widget or email busier". For the page or campaign a conversation started on, use `report_attribution` instead.',
    inputSchema: window90,
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', '/v1/reports/sources', { query: { days: args['days'] } }),
  },
  {
    name: 'report_attribution',
    title: 'What page or campaign started the conversation',
    description:
      'Conversation volume and resolution grouped by one dimension of the page context captured when the visitor first wrote in — the marketing-side read of the inbox. An unknown `dimension` is REFUSED rather than defaulted, so call it again with a value from the error rather than guessing twice.',
    inputSchema: z.object({
      dimension: z
        .string()
        .max(64)
        .optional()
        .describe('What to group by. Defaults to utm_source; utm_campaign and utm_medium exist.'),
      days: z.number().int().min(1).max(90).optional().describe('Look-back window. Default 30.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/reports/attribution', {
        query: { dimension: args['dimension'], days: args['days'] },
      }),
  },
  {
    name: 'report_response_times',
    title: 'Response-time distribution',
    description:
      'First-response and resolution percentiles (p50/p95) with the sample size, rather than a mean — a p95 is what the unlucky customer actually experienced, and one agent at lunch moves a mean more than a hundred fast replies do.',
    inputSchema: window90,
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/reports/response-times', { query: { days: args['days'] } }),
  },
  {
    name: 'report_labels',
    title: 'Volume by label',
    description:
      'What the workspace is being asked about, if its taxonomy is applied consistently. Capped at the 50 busiest labels. For what customers wrote about REGARDLESS of labelling, use `report_themes` — it clusters the text itself.',
    inputSchema: windowRange,
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/reports/labels', {
        query: { days: args['days'], from: args['from'], to: args['to'] },
      }),
  },
  {
    name: 'report_teams',
    title: 'Per-team rollup',
    description:
      'The same figures as `report_agents`, grouped by team, plus SLA breaches per team.',
    inputSchema: windowRange,
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/reports/teams', {
        query: { days: args['days'], from: args['from'], to: args['to'] },
      }),
  },
  {
    name: 'report_sla',
    title: 'SLA attainment and breaches',
    description:
      'Which policies are being met and which are not, with breaches by policy, team and agent. A breach is a commitment that was missed, so be precise about it. `breachesTruncated` true means the list hit its 200-row cap and there is no cursor for the rest.',
    inputSchema: windowRange,
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/reports/sla', {
        query: { days: args['days'], from: args['from'], to: args['to'] },
      }),
  },
  {
    name: 'report_cohorts',
    title: 'Contact cohorts over time',
    description:
      'Retention-style grid of contacts by the week they first wrote in. Takes WEEKS, not days — this is the one report whose window is not in days.',
    inputSchema: z.object({
      weeks: z.number().int().min(2).max(26).optional().describe('Cohort weeks. Default 8.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/reports/cohorts', { query: { weeks: args['weeks'] } }),
  },
  {
    name: 'report_voice',
    title: 'Voice call analytics',
    description:
      'Call volume, answer rate, talk time, an hour-by-day heatmap and per-agent figures. The only report that covers phone and WebRTC calls — none of the conversation reports count a call.',
    inputSchema: z.object({
      days: z.number().int().min(1).max(365).optional().describe('Look-back window. Default 30.'),
    }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', '/v1/reports/voice', { query: { days: args['days'] } }),
  },
  {
    name: 'report_themes',
    title: 'What customers wrote about, clustered',
    description:
      'The latest batch of conversation themes: a label, a summary, how many conversations fell into it and the average sentiment. This is the answer to "what are people complaining about" when the workspace has not labelled anything — it clusters the message text rather than trusting a taxonomy. One batch, capped at 20 themes; pass `date` to read an older batch. Drill into one with `report_theme_conversations`.',
    inputSchema: z.object({
      date: z
        .string()
        .max(20)
        .optional()
        .describe('Batch date, YYYY-MM-DD. Omit for the most recent batch.'),
    }),
    mutating: false,
    run: (ctx, args) => call(ctx, 'GET', '/v1/reports/themes', { query: { date: args['date'] } }),
  },
  {
    name: 'report_theme_conversations',
    title: 'The conversations inside one theme',
    description:
      'Conversation ids for one theme, as the snapshot recorded them — the drill-down from `report_themes`, which deliberately omits them. Feed an id to `get_messages` to read what was actually said. An unknown or purged theme id answers with an empty list rather than an error.',
    inputSchema: z.object({ themeId: z.string().uuid() }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', `/v1/reports/themes/${String(args['themeId'])}/conversations`),
  },
];
