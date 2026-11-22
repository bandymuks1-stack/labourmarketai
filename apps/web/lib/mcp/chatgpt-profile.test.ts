import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { exposedCapabilities } from "@/lib/capabilities/registry";

import { CHATGPT_PUBLIC_TOOLS, CHATGPT_TOOL_PROFILE, chatgptProfileToolDefs } from "./chatgpt-profile";
import { protectedResourceMetadata } from "./protected-resource-metadata";
import { toolDefsOf } from "./toolset";

const ALL = toolDefsOf(exposedCapabilities());
const PROFILE = chatgptProfileToolDefs(ALL);

/**
 * THE PROFILE CANNOT WIDEN BY ACCIDENT (owner P0 2026-11-11). This exact list
 * is the second of two edits a new tool needs; a new registry capability, a
 * renamed tool or a quietly added line in the profile fails here.
 */
const PINNED = [
  "jobs_search",
  "jobs_get",
  "jobs_new_list",
  "work_find",
  "opportunities_saved_list",
  "candidate_search",
  "workforce_availability",
  "capacity_available_get",
  "service_offering_discover",
  "marketplace_listing_discover",
  "demand_create_draft",
  "demand_create_confirm",
  "demand_list",
  "shortlist_get",
  "client_agency_offers_get",
  "service_request_incoming_list",
  "service_request_outgoing_list",
  "company_respond-team-offer_prepare",
  "company_respond-team-offer_confirm",
  "profile_get",
  "context_list",
  "context_switch",
];

describe("the curated ChatGPT tool profile", () => {
  it("is exactly the pinned list, and stays a reviewable size (15–25)", () => {
    expect([...CHATGPT_TOOL_PROFILE]).toEqual(PINNED);
    expect(PINNED.length).toBeGreaterThanOrEqual(15);
    expect(PINNED.length).toBeLessThanOrEqual(25);
    expect(new Set(PINNED).size).toBe(PINNED.length);
  });

  it("every profile tool is a published tool of the full door (none renamed away)", () => {
    const published = new Set(ALL.map((d) => d.name));
    expect(PINNED.filter((n) => !published.has(n))).toEqual([]);
    expect(PROFILE).toHaveLength(PINNED.length);
  });

  it("every confirm has its draft/prepare in the profile, and every draft/prepare its confirm", () => {
    const names = new Set(PINNED);
    for (const n of PINNED) {
      const m = /^(.*)_(draft|prepare|confirm)$/.exec(n);
      if (!m) continue;
      const pairs = m[2] === "confirm" ? [`${m[1]}_draft`, `${m[1]}_prepare`] : [`${m[1]}_confirm`];
      expect(pairs.some((p) => names.has(p)), `${n} has no pair in the profile`).toBe(true);
    }
  });

  it("only confirm tools and the workspace pointer write; nothing in it deletes", () => {
    const writes = PROFILE.filter((d) => d.annotations?.readOnlyHint !== true).map((d) => d.name);
    expect(writes.sort()).toEqual(
      ["company_respond-team-offer_confirm", "context_switch", "demand_create_confirm"].sort(),
    );
    expect(PROFILE.filter((d) => d.annotations?.destructiveHint === true).map((d) => d.name)).toEqual([]);
  });

  it("the full door is untouched: /api/mcp still publishes every exposed capability", () => {
    expect(ALL).toHaveLength(exposedCapabilities().length);
    const route = readFileSync(join(__dirname, "..", "..", "app", "api", "mcp", "route.ts"), "utf8");
    expect(route).not.toMatch(/selectTools/);
  });

  it("its metadata document names the curated door as the resource, on the same authorization server", () => {
    const curated = protectedResourceMetadata("https://labourmarket.ai", "https://ref.supabase.co", "/api/mcp/chatgpt");
    const full = protectedResourceMetadata("https://labourmarket.ai", "https://ref.supabase.co");
    expect(curated.resource).toBe("https://labourmarket.ai/api/mcp/chatgpt");
    expect(full.resource).toBe("https://labourmarket.ai/api/mcp");
    expect(curated.authorization_servers).toEqual(full.authorization_servers);
  });

  it("only the two public job reads run without sign-in, and both are read-only (owner decision to widen)", () => {
    expect([...CHATGPT_PUBLIC_TOOLS]).toEqual(["jobs_search", "jobs_get"]);
    for (const name of CHATGPT_PUBLIC_TOOLS) {
      const def = PROFILE.find((d) => d.name === name);
      expect(def?.annotations?.readOnlyHint, name).toBe(true);
      expect(def?.annotations?.destructiveHint, name).toBe(false);
    }
  });
});
