import type { McpToolDef } from "./protocol";

/**
 * THE CURATED CHATGPT PROFILE (owner P0 2026-11-11, C-lane).
 *
 * `/api/mcp` publishes every exposed capability (236 tools) to every MCP
 * client, and existing clients — the ChatGPT connector the owner set up, the
 * mobile app, the production walks — keep exactly that. A ChatGPT app shown
 * to the public is reviewed on a much smaller surface, so this profile is a
 * SECOND DOOR over the SAME registry, the same identity resolver and the same
 * draft→confirm contract — a narrower list, never a second implementation.
 *
 * What it covers, and nothing else (the owner's four functions):
 *   1. job search;
 *   2. searching for workers and B2B teams;
 *   3. publishing a company need, signed in, through draft→confirm;
 *   4. reviewing candidates and offers within the caller's own permissions;
 * plus the workspace tools every one of those needs (who am I, which
 * organization am I acting for).
 *
 * A tool joins by being added HERE and to the exact list pinned in
 * `chatgpt-profile.test.ts` — two edits on purpose, so the profile can never
 * widen by accident (a new capability in the registry does not appear here).
 */
export const CHATGPT_PROFILE_PATH = "/api/mcp/chatgpt" as const;

export const CHATGPT_TOOL_PROFILE = [
  // 1. Job search.
  "jobs_search",
  "jobs_get",
  "jobs_new_list",
  "work_find",
  "opportunities_saved_list",
  // 2. Workers and B2B teams.
  "candidate_search",
  "workforce_availability",
  "capacity_available_get",
  "service_offering_discover",
  "marketplace_listing_discover",
  // 3. A company need, published through draft→confirm.
  "demand_create_draft",
  "demand_create_confirm",
  "demand_list",
  // 4. Candidates and offers, within the caller's permissions.
  "shortlist_get",
  "client_agency_offers_get",
  "service_request_incoming_list",
  "service_request_outgoing_list",
  "company_respond-team-offer_prepare",
  "company_respond-team-offer_confirm",
  // Workspace.
  "profile_get",
  "context_list",
  "context_switch",
] as const;

export type ChatgptProfileTool = (typeof CHATGPT_TOOL_PROFILE)[number];

/**
 * The ONLY profile tools a caller with no credential may run (owner P0
 * 2026-11-11; a privacy change that needs the owner's approval). Both read
 * the public vacancy board through SQL functions granted to `anon` that
 * enumerate the anonymous columns — no employer, place, title, contact or
 * application link (`lib/capabilities/public-jobs-capabilities.ts`). Pinned
 * in `chatgpt-profile.test.ts`; widening it is a new owner decision.
 */
export const CHATGPT_PUBLIC_TOOLS = ["jobs_search", "jobs_get"] as const satisfies readonly ChatgptProfileTool[];

const PROFILE = new Set<string>(CHATGPT_TOOL_PROFILE);

/** The profile's tool list, in the registry's own order. */
export function chatgptProfileToolDefs(all: readonly McpToolDef[]): McpToolDef[] {
  return all.filter((d) => PROFILE.has(d.name));
}

export const CHATGPT_PROFILE_INSTRUCTIONS =
  "LabourMarket.ai for the signed-in user: search jobs, search workers and " +
  "B2B teams, publish a company need, and review candidates and offers. " +
  "Reads return recorded facts under the user's own permissions; nothing is " +
  "shown that the user could not see on the web. Publishing a need and " +
  "answering a team offer go through a _draft/_prepare tool that writes " +
  "nothing and returns a one-time token, then its _confirm tool, called once. " +
  "context_switch changes which organization the session acts for " +
  "(context_list shows the choices).";
