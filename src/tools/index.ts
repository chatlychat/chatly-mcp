/**
 * The tool registry.
 *
 * Each tool is a thin, typed wrapper over one REST endpoint. Deliberately not
 * a generic "call any endpoint" tool: that would hand a model the whole API
 * surface including destructive and billing routes, and give it no schema to
 * reason about. A curated set is both safer and easier for a model to use
 * correctly.
 *
 * `react_to_message` and `get_widget_config` used to be here and neither
 * could work. A reaction records *who* reacted and an API key is not a
 * person, so that endpoint requires a signed-in user; channel configuration
 * needs a scope no key can hold. Both returned 403 to every call — invisible
 * in CI, because the suite mocks `fetch` and never reaches a real route.
 * `reachability.spec.ts` is what stops that recurring, and it walks THIS
 * directory rather than one file.
 */
export { call, listQuery, type ApiContext, type ToolDefinition } from './call.js';

import { CONTACT_TOOLS } from './contacts.js';
import { CONVERSATION_TOOLS } from './conversations.js';
import { KNOWLEDGE_TOOLS } from './knowledge.js';
import { REPORT_TOOLS } from './reports.js';
import { TICKET_TOOLS } from './tickets.js';
import { WORKSPACE_TOOLS } from './workspace.js';

import type { ToolDefinition } from './call.js';

export const TOOLS: readonly ToolDefinition[] = [
  // Search first, deliberately: it is the order a host renders them in, and
  // the tool a model should reach for before any of the listers.
  ...KNOWLEDGE_TOOLS,
  ...CONVERSATION_TOOLS,
  ...CONTACT_TOOLS,
  ...TICKET_TOOLS,
  ...WORKSPACE_TOOLS,
  ...REPORT_TOOLS,
];

/** Name → definition, for dispatch. */
export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition> = new Map(
  TOOLS.map((t) => [t.name, t]),
);
