import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ASSIGNABLE_WORKERS_LIMIT,
  composeAssignableWorkers,
} from "@/lib/projects/assignable-workers";

/**
 * Guard — the chat's assign-to-project population equals the page's.
 *
 * D5 agency-chain walk on production (2026-09-06, README in
 * docs/launch/pilot-feedback/walks-2026-09-06/walk-d5-agency-chain/): a client
 * who accepted an agency's candidate, whose booking the worker accepted, held
 * an ACTIVE `company_worker_engagements` row. The PAGE picker offered that
 * person (optgroup "Priimto pasiūlymo kandidatai") and the RPC gate
 * `caller_has_booking_engagement_for_project` accepted them — but the CHAT
 * ("Kas turėtų jame dirbti?") offered the roster alone. Two surfaces, two
 * truths. This pins the fix: one pure composition of the two EXISTING reads,
 * and the adapter/chat wired to it.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

// RFC-4122 fixture ids (z.uuid()-shaped, never real rows).
const ROSTER_ONLY = "11111111-1111-4111-8111-111111111111";
const BOTH = "22222222-2222-4222-8222-222222222222";
const ENGAGEMENT_ONLY = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "99999999-9999-4999-8999-999999999999";

describe("composeAssignableWorkers — pure, no third population", () => {
  it("a booking-only candidate appears exactly once, labelled as engagement", () => {
    const out = composeAssignableWorkers(
      [{ profileId: ROSTER_ONLY, name: "Roster One" }],
      [{ workerProfileId: ENGAGEMENT_ONLY, name: "Placed Person" }],
    );
    expect(out.map((w) => w.profileId)).toEqual([ROSTER_ONLY, ENGAGEMENT_ONLY]);
    expect(out.filter((w) => w.profileId === ENGAGEMENT_ONLY)).toHaveLength(1);
    expect(out.find((w) => w.profileId === ENGAGEMENT_ONLY)?.source).toBe("engagement");
    expect(out.find((w) => w.profileId === ROSTER_ONLY)?.source).toBe("roster");
  });

  it("a person on BOTH lists appears once — as roster (the stronger relationship)", () => {
    const out = composeAssignableWorkers(
      [{ profileId: BOTH, name: "Both Ways" }],
      [
        { workerProfileId: BOTH, name: "Both Ways (engagement)" },
        { workerProfileId: ENGAGEMENT_ONLY, name: "Placed Person" },
      ],
    );
    expect(out.filter((w) => w.profileId === BOTH)).toHaveLength(1);
    expect(out.find((w) => w.profileId === BOTH)).toEqual({
      profileId: BOTH,
      name: "Both Ways",
      source: "roster",
    });
    expect(out).toHaveLength(2);
  });

  it("an outsider (in neither input) can never appear", () => {
    const out = composeAssignableWorkers(
      [{ profileId: ROSTER_ONLY, name: "Roster One" }],
      [{ workerProfileId: ENGAGEMENT_ONLY, name: "Placed Person" }],
    );
    expect(out.some((w) => w.profileId === OUTSIDER)).toBe(false);
    // Every output id came from an input.
    const inputs = new Set([ROSTER_ONLY, ENGAGEMENT_ONLY]);
    for (const w of out) expect(inputs.has(w.profileId)).toBe(true);
  });

  it("duplicates INSIDE one input collapse too, and blank ids are dropped", () => {
    const out = composeAssignableWorkers(
      [
        { profileId: ROSTER_ONLY, name: "A" },
        { profileId: ROSTER_ONLY, name: "A again" },
        { profileId: "", name: "no id" },
      ],
      [
        { workerProfileId: ENGAGEMENT_ONLY, name: "B" },
        { workerProfileId: ` ${ENGAGEMENT_ONLY} `, name: "B padded" },
        { workerProfileId: "   ", name: "blank" },
      ],
    );
    expect(out.map((w) => w.profileId)).toEqual([ROSTER_ONLY, ENGAGEMENT_ONLY]);
  });

  it("both empty → empty (no invented candidate)", () => {
    expect(composeAssignableWorkers([], [])).toEqual([]);
  });

  it("the composed list is bounded", () => {
    const many = Array.from({ length: ASSIGNABLE_WORKERS_LIMIT + 20 }, (_, i) => ({
      workerProfileId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `P${i}`,
    }));
    expect(composeAssignableWorkers([], many)).toHaveLength(ASSIGNABLE_WORKERS_LIMIT);
  });
});

describe("the chat population composes the SAME two reads the page uses", () => {
  const adapter = read("lib/projects/project-workspace.ts");
  const page = read("app/[locale]/dashboard/projects/page.tsx");
  const chat = read("components/app/conversation/chat/conversation-chat.tsx");

  it("adapter reads roster AND accepted-booking engagements, then composes", () => {
    const fn = adapter.slice(adapter.indexOf("export async function loadAssignableWorkersForProject"));
    expect(fn).toMatch(/listActiveCompanyWorkers\(ctx\.companyId\)/);
    expect(fn).toMatch(/listBookingEngagementWorkers\(\)/);
    expect(fn).toMatch(/composeAssignableWorkers\(roster,\s*engagement\.workers\)/);
  });

  it("the page's picker reads through the same engagement reader — no second source", () => {
    expect(page).toMatch(/listBookingEngagementWorkers\(\)/);
    expect(adapter).toMatch(/from "@\/lib\/projects\/booking-engagement-workers"/);
    // Neither surface reads the engagement table directly.
    expect(adapter).not.toMatch(/company_worker_engagements/);
    expect(page).not.toMatch(/company_worker_engagements/);
  });

  it("failed reads stay NAMED — never an empty team", () => {
    const fn = adapter.slice(adapter.indexOf("export async function loadAssignableWorkersForProject"));
    expect(fn).toMatch(/res\.kind === "needs-migration"\)\s*return \{ kind: "needs-migration" \}/);
    expect(fn).toMatch(/res\.kind !== "ok"\)\s*return \{ kind: "blocked" \}/);
    expect(fn).toMatch(/engagement\.kind === "error"\)\s*return \{ kind: "blocked" \}/);
  });

  it("the chat labels an engagement candidate honestly and dispatches the same chip id", () => {
    expect(chat).toMatch(/w\.source === "engagement"/);
    expect(chat).toMatch(/labels\.assignEngagementCandidate/);
    expect(chat).toMatch(/id: `assign:\$\{projectId\}:\$\{w\.profileId\}`/);
  });

  it("the honest label exists in every locale catalogue", () => {
    const locales = ["lt", "en", "de", "nl", "ru", "da", "et", "lv", "no", "pl", "sv"] as const;
    for (const locale of locales) {
      const j = JSON.parse(read(`messages/${locale}.json`)) as {
        conversation?: { chat?: Record<string, string> };
      };
      expect(j.conversation?.chat?.assignEngagementCandidate, `${locale}`).toBeTruthy();
    }
    expect(read("components/app/conversation/chat/labels.ts")).toMatch(
      /"assignEngagementCandidate"/,
    );
  });
});
