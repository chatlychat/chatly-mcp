/**
 * Billing, usage and the AI spend meter.
 *
 * All reads, and every one of them behind `workspace:billing:read` — a scope
 * a workspace deliberately withholds from most keys, so these are the tools
 * most likely to answer 403 on a key that works everywhere else. That is the
 * correct outcome rather than something to work around: "what are we paying"
 * is an owner's question.
 *
 * Nothing here can start a purchase. `POST /billing/checkout-session` and
 * `portal-session` are not key-accessible at all, and would not be exposed
 * if they were: a model that decides to upgrade a plan at 3am has spent the
 * customer's money with nobody in the room.
 */
import { z } from 'zod';

import { call, type ToolDefinition } from './call.js';

/**
 * The four metered events, as `USAGE_EVENT_TYPES` defines them. REQUIRED on
 * the two usage reads, and an enum rather than a string, because the handler
 * refuses an unknown or absent value with a 400 — an optional field here
 * would be a tool whose default call can only fail.
 */
const usageEventType = z
  .enum(['conversation.opened', 'message.sent.agent', 'message.sent.bot', 'ai.tokens'])
  .describe('Which meter to read.');

export const BILLING_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'get_billing_summary',
    title: 'Plan, seats and billing period',
    description:
      'The workspace plan, seat count, current period and balance. Start here for anything about what this customer is on or owes; `list_plans` is what they could move to.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/billing'),
  },
  {
    name: 'list_plans',
    title: 'The plan catalogue, with real prices',
    description:
      'Every purchasable plan with the amount Stripe would actually charge, monthly and annual. Quote from here rather than from memory — prices change and a wrong figure is a promise the workspace cannot keep. Comes back EMPTY on a deployment with no Stripe keys, which means billing is off, not that there are no plans.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/billing/plans'),
  },
  {
    name: 'list_invoices',
    title: 'Invoice history',
    description:
      'Past invoices with their amounts, status and hosted URLs — the answer to "was I charged" and "when did that payment fail". Paginated: pass `nextCursor` back as `cursor`.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().max(500).optional().describe('From a previous response.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/billing/invoices', {
        query: { limit: args['limit'], cursor: args['cursor'] },
      }),
  },
  {
    name: 'get_usage',
    title: 'One usage meter over a range',
    description:
      'The total and event count for one metered event over an arbitrary window, defaulting to the current calendar month. Use `get_monthly_usage` when you want all four meters at once, and this when you need a window that is not a whole month.',
    inputSchema: z.object({
      eventType: usageEventType,
      from: z.string().max(40).optional().describe('ISO instant, inclusive. Default: month start.'),
      to: z.string().max(40).optional().describe('ISO instant, EXCLUSIVE.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/billing/usage', {
        query: { eventType: args['eventType'], from: args['from'], to: args['to'] },
      }),
  },
  {
    name: 'get_monthly_usage',
    title: 'All four meters for one month',
    description:
      'One entry per metered event for a whole calendar month, plus a grand total — the shape an invoice line is denominated in. The best single tool for "what did we use last month".',
    inputSchema: z.object({
      month: z.string().max(10).optional().describe('YYYY-MM, UTC. Default: this month.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/billing/usage/monthly', { query: { month: args['month'] } }),
  },
  {
    name: 'get_daily_usage',
    title: 'One usage meter, day by day',
    description:
      'A DENSE day-by-day series for one meter — every UTC day in the window appears, zeros included, so a gap in the output is a gap in usage rather than a gap in the data. Use it to find the day something started, not to total a month.',
    inputSchema: z.object({
      eventType: usageEventType,
      from: z.string().max(40).optional().describe('ISO instant, inclusive. Default: month start.'),
      to: z.string().max(40).optional().describe('ISO instant, EXCLUSIVE. Capped at 365 days.'),
    }),
    mutating: false,
    run: (ctx, args) =>
      call(ctx, 'GET', '/v1/billing/usage/daily', {
        query: { eventType: args['eventType'], from: args['from'], to: args['to'] },
      }),
  },
  {
    name: 'get_ai_quota',
    title: 'AI spend against the cap',
    description:
      'Month-to-date AI spend, the plan cap and a projection for the month. This is the tool that answers "why has the AI stopped replying" — a workspace over its cap has autonomous AI disabled until the meter rolls over or the plan changes. Distinct from `get_usage` with `ai.tokens`, which counts tokens rather than money against a ceiling.',
    inputSchema: z.object({}),
    mutating: false,
    run: (ctx) => call(ctx, 'GET', '/v1/ai/quota'),
  },
];
