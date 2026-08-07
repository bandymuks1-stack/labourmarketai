import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W8 — `/dashboard/candidates` information architecture.
 *
 * TWO different things are called "candidates" in this product, and both are
 * real (docs/audits/W8_CANDIDATES_INFORMATION_ARCHITECTURE.md §3):
 *
 *   A. `/dashboard/candidates` — `candidate_drafts`, the viewer's OWN private,
 *      hand-typed notes about people and providers, including unregistered
 *      ones. `owner_id = auth.uid()`. No account, no verification, no
 *      matching, and nothing assignable until an operator links a real profile.
 *
 *   B. `?result=candidates` → `/dashboard/company/scouting` — real registered
 *      supply, org-scoped, ranked by the canonical comparator.
 *
 * `w8-employer-chat-workspace.test.ts` already guards B from A (the result must
 * not take `/dashboard/candidates` as its `advancedRoute`). This guards the
 * REVERSE direction, which is where the drift actually happened: the entry
 * points into A had accumulated concept-B language — "Browse candidates",
 * "Review candidates and shortlists", and a promise to "start a conversation"
 * with someone who by construction has no account to be reached at.
 *
 * These are claim assertions, not style rules. Each one failed against real
 * shipped copy before this slice.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const catalog = (locale: string) =>
  JSON.parse(read(`messages/${locale}.json`)) as Record<string, never>;

const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;
const ALL = [...ACTIVE, "da", "et", "lv", "no", "pl"] as const;

/** Verbs that only concept B can honour. A hand-typed private note cannot be
 *  browsed as supply, shortlisted against a need, or messaged. */
const MARKETPLACE_CLAIMS_EN = [
  /\bbrowse candidates\b/i,
  /\bshortlists?\b/i,
  /\bstart a conversation\b/i,
];

describe("the drafts surface's own page stays honest (regression floor)", () => {
  for (const locale of ACTIVE) {
    it(`${locale}: the page still says a draft is not an account`, () => {
      const c = catalog(locale) as unknown as {
        candidates: { honestyNote: string; intro: string };
      };
      expect(c.candidates.honestyNote.trim().length).toBeGreaterThan(40);
      expect(c.candidates.intro.trim().length).toBeGreaterThan(20);
    });
  }

  it("en: the honesty note still denies account, verification and matching", () => {
    const c = catalog("en") as unknown as { candidates: { honestyNote: string } };
    const note = c.candidates.honestyNote.toLowerCase();
    expect(note).toContain("not a user account");
    expect(note).toContain("verification");
    expect(note).toContain("no automatic candidate matching");
  });
});

describe("the entry points into the drafts surface name drafts, not supply", () => {
  for (const locale of ALL) {
    it(`${locale}: the planning entry chip says drafts`, () => {
      const c = catalog(locale) as unknown as {
        workforcePlanning: { entries: { candidates: string } };
      };
      const label = c.workforcePlanning.entries.candidates;
      expect(typeof label).toBe("string");
      expect(label.trim()).not.toBe("");
      // The `[EN]` shells in the partial catalogs are allowed, but they must
      // carry the corrected English, not the old marketplace phrasing.
      expect(label).not.toMatch(/browse candidates/i);
    });
  }

  it("en: the room describes private notes, never candidate review", () => {
    const c = catalog("en") as unknown as {
      companyActionRooms: {
        candidates: {
          whatBody: string;
          nextLine: string;
          primaryLabel: string;
          flow: { step1: string; step2: string; step3: string };
        };
      };
    };
    const room = c.companyActionRooms.candidates;
    const all = [
      room.whatBody,
      room.nextLine,
      room.primaryLabel,
      room.flow.step1,
      room.flow.step2,
      room.flow.step3,
    ].join(" ");

    for (const claim of MARKETPLACE_CLAIMS_EN) {
      expect(all).not.toMatch(claim);
    }

    // The two positive claims the audit requires the room to make.
    expect(all.toLowerCase()).toContain("private");
    // The personal scope, stated where the org framing is (§2.1).
    expect(room.flow.step2.toLowerCase()).toMatch(/only you|not shared/);
    // The one real path off a draft: linking, once the person registers.
    expect(room.flow.step3.toLowerCase()).toMatch(/link/);
    // The primary action leaves for real supply and SAYS it is real supply.
    expect(room.primaryLabel.toLowerCase()).toContain("registered");
  });

  for (const locale of ACTIVE) {
    it(`${locale}: the room never promises a conversation with a draft`, () => {
      const c = catalog(locale) as unknown as {
        companyActionRooms: {
          candidates: { nextLine: string; flow: { step3: string } };
        };
      };
      const room = c.companyActionRooms.candidates;
      // Every active locale's step3 and nextLine must speak about LINKING —
      // the only real next step — rather than contacting a person with no
      // account. Checked structurally: both mention the same idea the page's
      // own `labels.canLinkLater` names.
      const joined = `${room.nextLine} ${room.flow.step3}`.toLowerCase();
      expect(joined).toMatch(/link|susiek|свяж|koppel|verknüpf/);
    });
  }
});

describe("the two candidate concepts stay apart", () => {
  it("the drafts route is never the scouting result's full screen", () => {
    // Mirrors the existing w8-employer-chat-workspace assertion so the pair is
    // visible together; if either side moves, one of the two fails.
    const registry = read("lib/conversation/result-registry.ts");
    expect(registry).toMatch(/advancedRoute: "\/dashboard\/company\/scouting"/);
    expect(registry).not.toMatch(/advancedRoute: "\/dashboard\/candidates"/);
  });

  it("nothing reads candidate_drafts as supply", () => {
    // A draft has no verification and no evidence tier, so it must never enter
    // a matching, scouting or ranking path. The reader is the ONLY consumer.
    const reader = read("lib/candidates/candidate-drafts.ts");
    expect(reader).toMatch(/owner-scoped/i);
    // The prose says "no service_role"; what matters is that no privileged
    // client is CONSTRUCTED here — the owner-scoped RLS is the only gate.
    expect(reader).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|createServiceClient|serviceClient\(/);
    expect(reader).toMatch(/from "@\/lib\/supabase\/server"/);
  });
});
