import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isEducationFirstWorkspace } from "@/lib/conversation/education-home";
import { EDUCATION_ROLE } from "@/lib/organizations/capabilities";

/**
 * Guard — M10: EDUCATION-SHAPED HOME IDENTITY.
 *
 * The chat-first home has exactly TWO base identities (person/company —
 * systemic-ux-roles-v1, an owner decision). An education institution is an
 * organization with the `training_provider` capability, so it lands in the
 * company workspace — and until M10 it was greeted with "I need workers",
 * candidates and projects: employer copy for an organization that never
 * declared it employs anyone. A linked learner meanwhile got plain worker
 * copy with no acknowledgment of their real learning context.
 *
 * This guard pins the RULES, not one render:
 *
 *   1. the education decision is the canonical capability layer
 *      (`organization_roles` + legacy fallback), never a new vocabulary;
 *   2. the education greeting offers ONLY chips that lead to REAL existing
 *      surfaces (network invite panel / company hub / communication) —
 *      no dead chip, no new route, and the 1–3 owner cap holds;
 *   3. a PLAIN company keeps the employer starters — M10 is additive
 *      (ARCHITECTURE §7 question B: nothing an employer could do narrowed);
 *   4. the server threads the flag from the canonical reads, and the learner
 *      line renders only with a REAL institution name;
 *   5. doctrine §2.4 — every new key exists in ALL 11 catalogs.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const PAGE = read("app/[locale]/dashboard/page.tsx");

// ═══════════════════════════════════════════════════════════════════════════
// 1. The pure decision — canonical capability semantics, no third identity
// ═══════════════════════════════════════════════════════════════════════════

describe("1. isEducationFirstWorkspace decides from the canonical capability layer", () => {
  it("a declared training provider (and nothing else) is education-first", () => {
    expect(
      isEducationFirstWorkspace({ roleSlugs: [EDUCATION_ROLE], legacyType: null }),
    ).toBe(true);
    // Declared rows WIN over the legacy column (capabilities.ts contract):
    // an org that declared ONLY education does not keep an implied employer.
    expect(
      isEducationFirstWorkspace({
        roleSlugs: [EDUCATION_ROLE],
        legacyType: "company",
      }),
    ).toBe(true);
  });

  it("an employer — declared or legacy-implied — keeps the employer greeting", () => {
    expect(
      isEducationFirstWorkspace({ roleSlugs: ["employer"], legacyType: null }),
    ).toBe(false);
    expect(
      isEducationFirstWorkspace({ roleSlugs: [], legacyType: "company" }),
    ).toBe(false);
    // BOTH capabilities → employer chips remain; for such an organization
    // "I need workers" is not wrong copy. Additive, never a swap-away.
    expect(
      isEducationFirstWorkspace({
        roleSlugs: [EDUCATION_ROLE, "employer"],
        legacyType: null,
      }),
    ).toBe(false);
  });

  it("no declaration at all fails CLOSED to the plain company greeting", () => {
    expect(isEducationFirstWorkspace({ roleSlugs: [], legacyType: null })).toBe(false);
    expect(isEducationFirstWorkspace({ roleSlugs: null, legacyType: "other" })).toBe(false);
  });

  it("works WITHIN the two-base-identity model — no third identity invented", () => {
    const roles = read("lib/config/roles.ts");
    expect(roles).toMatch(/export type BaseIdentity = "person" \| "company"/);
    // The chat still derives identity from the SAME owner-locked mapping.
    expect(CHAT).toMatch(/baseIdentityForRole\(auth0\.activeRole\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The education greeting — real chips only, cap held
// ═══════════════════════════════════════════════════════════════════════════

describe("2. the education workspace gets education-shaped starters", () => {
  const starter = /const starterChips[\s\S]*?\],\s*\[labels/.exec(CHAT)?.[0] ?? "";

  it("the education branch exists and is decided by the server-resolved flag", () => {
    expect(starter).toMatch(/educationWorkspace\s*\?/);
  });

  it("every education chip leads to a REAL existing surface (no dead chips)", () => {
    // The invite panel (learner relationship lives there), the company hub
    // (capabilities card), the communication surface. All three routes exist
    // as canonical screens today — link chips route, never duplicate.
    expect(starter).toMatch(/id: "link:\/dashboard\/network", label: labels\.chipEduInviteLearner/);
    expect(starter).toMatch(/id: "link:\/dashboard\/company", label: labels\.chipEduCapabilities/);
    expect(starter).toMatch(/id: "link:\/dashboard\/communication", label: labels\.navMessages/);
  });

  it("a PLAIN company keeps the employer starters (question B — no narrowing)", () => {
    expect(starter).toMatch(/id: "f:company\.create-demand", label: labels\.chipNeedWorkers/);
    expect(starter).toMatch(/id: "candidates", label: labels\.chipCandidates/);
    expect(starter).toMatch(/id: "projects", label: labels\.chipProjects/);
  });

  it("the worker starters are untouched", () => {
    expect(starter).toMatch(/id: "logwork", label: labels\.chipLogWork/);
    expect(starter).toMatch(/id: "cv", label: labels\.chipCv/);
    expect(starter).toMatch(/id: "jobs", label: labels\.chipJobs/);
  });

  it("the 1–3 owner cap holds in EVERY branch of the greeting", () => {
    // Count chip literals per array segment — no branch may exceed three.
    for (const segment of starter.split(/[?:]\s*\[/).slice(1)) {
      const ids = segment.split("]")[0].match(/\{ id: "/g) ?? [];
      expect(ids.length).toBeLessThanOrEqual(3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Server threading — canonical reads, honest degradation
// ═══════════════════════════════════════════════════════════════════════════

describe("3. the page threads the flag from the canonical capability read", () => {
  it("resolves the ACTIVE organization and reads organization_roles", () => {
    expect(PAGE).toMatch(/getActiveOrganizationContext\(\)/);
    expect(PAGE).toMatch(/readOrganizationCapabilities\(/);
    expect(PAGE).toMatch(/isEducationFirstWorkspace\(/);
  });

  it("the learner link comes from the existing engagement read, student slug", () => {
    // The SAME RLS-scoped read the network page uses — no second read path.
    expect(PAGE).toMatch(/listMyEngagements\(\)/);
    expect(PAGE).toMatch(/relationshipSlug === "student"/);
  });

  it("the learner line renders only with a REAL institution name", () => {
    // No name → null → nothing rendered. Never a placeholder on screen.
    expect(PAGE).toMatch(/organizationName\?\.trim\(\) \|\| null/);
    expect(PAGE).toMatch(/learnerGreetingContext.*institution/);
  });

  it("the chat renders the learner line only for the person identity", () => {
    expect(CHAT).toMatch(/learnerContextLine && identity === "person"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Doctrine §2.4 — every new key in ALL 11 catalogs
// ═══════════════════════════════════════════════════════════════════════════

describe("4. i18n parity for the M10 keys", () => {
  const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];
  const KEYS = [
    "chipEduInviteLearner",
    "chipEduCapabilities",
    "learnerGreetingContext",
  ] as const;

  it.each(LOCALES)("%s carries all three keys under conversation.chat", (loc) => {
    const chat = (
      JSON.parse(read(`messages/${loc}.json`)) as {
        conversation: { chat: Record<string, string> };
      }
    ).conversation.chat;
    for (const k of KEYS) {
      expect(typeof chat[k], `${loc}: ${k}`).toBe("string");
      expect(chat[k].length, `${loc}: ${k} empty`).toBeGreaterThan(0);
    }
    // The placeholder must survive every translation — the server resolves it.
    expect(chat.learnerGreetingContext).toContain("{institution}");
  });

  it("the routed locales carry REAL translations (no [EN] markers)", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"]) {
      const chat = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          conversation: { chat: Record<string, string> };
        }
      ).conversation.chat;
      for (const k of KEYS) {
        expect(chat[k], `${loc}: ${k} untranslated`).not.toContain("[EN]");
      }
    }
  });
});
