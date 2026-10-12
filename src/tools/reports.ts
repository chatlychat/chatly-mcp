/**
 * Reporting tools.
 *
 * Every one of these is an AGGREGATE over a bounded window, which is why they
 * are safe to hand a model: there is no cursor to exhaust and no per-customer
 * detail in the response. A question like "how did we do last week" should be
 * answered from one of these rather than by listing a thousand conversations
 * and counting them.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

/** Every report takes the same window. 90 days is the API's own ceiling. */
const windowSchema = z.object({
  days: z.number().int().min(1).max(90).optional().describe('Look-back window. Default 7.'),
});

const report = (
  name: string,
  title: string,
  description: string,
  path: string,
): ToolDefinition => ({
  name,
  title,
  description,
  inputSchema: windowSchema,
  mutating: false,
  run: (ctx, args) => call(ctx, 'GET', path, { query: { days: args['days'] } }),
});

export const REPORT_TOOLS: readonly ToolDefinition[] = [
  report(
    'report_overview',
    'Workspace overview',
    'Conversation volume, response and resolution times, CSAT. Start here for "how are we doing".',
    '/v1/reports/overview',
  ),
  report(
    'report_conversations_by_day',
    'Conversations per day',
    'Daily buckets over the window — the shape of demand, for spotting a spike nobody mentioned.',
    '/v1/reports/conversations-by-day',
  ),
  report(
    'report_agents',
    'Per-agent performance',
    'Volume, first-response and resolution time per agent. Numbers about people: report them, do not editorialise about them.',
    '/v1/reports/agents',
  ),
  report(
    'report_sources',
    'Where conversations come from',
    'Volume by channel. Answers "is the widget or email busier".',
    '/v1/reports/sources',
  ),
  report(
    'report_attribution',
    'What page or campaign started the conversation',
    'Conversation volume grouped by the page, referrer or UTM the visitor arrived on. The marketing-side read of the inbox.',
    '/v1/reports/attribution',
  ),
  report(
    'report_response_times',
    'Response-time distribution',
    'First-response and resolution percentiles rather than a mean — a p90 is what a customer actually experiences.',
    '/v1/reports/response-times',
  ),
  report(
    'report_labels',
    'Volume by label',
    'What the workspace is being asked about, if its taxonomy is applied consistently.',
    '/v1/reports/labels',
  ),
  report(
    'report_teams',
    'Per-team rollup',
    'The same figures as `report_agents`, grouped by team.',
    '/v1/reports/teams',
  ),
  report(
    'report_sla',
    'SLA attainment and breaches',
    'Which policies are being met and which are not. A breach is a commitment that was missed, so be precise about it.',
    '/v1/reports/sla',
  ),
  report(
    'report_cohorts',
    'Contact cohorts over time',
    'Retention-style view of contacts by the period they first wrote in.',
    '/v1/reports/cohorts',
  ),
];
