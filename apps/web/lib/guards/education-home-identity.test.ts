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
  // 2026-09-04 (owner contract §5–§6): the greeting row is no longer a fixed
  // per-role branch inside the chat — it is DERIVED in
  // `lib/conversation/starters.ts` from the capabilities the workspace holds
  // and its facts. The rules this section protects (real chips only, the cap,
  // no narrowing of the plain company or the worker) now bind that module.
  const STARTERS = read("lib/conversation/starters.ts");
  const SIGNALS = read("lib/conversation/starter-signals.ts");

  it("the education track exists and is decided by the canonical capability read", () => {
    expect(STARTERS).toMatch(/capabilities\.includes\("training_provider"\)/);
    expect(SIGNALS).toMatch(/isEducationFirstWorkspace\(/);
    expect(SIGNALS).toMatch(/readOrganizationCapabilities\(/);
  });

  it("every education chip leads to a REAL existing surface (no dead chips)", () => {
    // The invite panel (learner relationship lives there), the programmes
    // section on the company hub, the hub itself. All exist as canonical
    // screens today — link chips route, never duplicate.
    expect(STARTERS).toMatch(/id: "link:\/dashboard\/network\?relationship=student", labelKey: "chipInviteStudent"/);
    expect(STARTERS).toMatch(/id: "link:\/dashboard\/company#institution-programs-title", labelKey: "chipProgrammes"/);
    expect(STARTERS).toMatch(/id: "link:\/dashboard\/company", labelKey: "chipEduCapabilities"/);
  });

  it("a PLAIN company keeps the employer starters (question B — no narrowing)", () => {
    expect(STARTERS).toMatch(/id: "f:company\.create-demand", labelKey: "chipNeedWorkers"/);
    expect(STARTERS).toMatch(/id: "candidates", labelKey: "chipCandidates"/);
    expect(STARTERS).toMatch(/id: "projects", labelKey: "chipProjects"/);
    // The employer track is held by EVERY company — a school or an agency
    // never loses it.
    expect(STARTERS).toMatch(/const all: CapabilityTrack\[\] = \["employer", "operations"\]/);
  });

  it("the worker starters are untouched", () => {
    expect(STARTERS).toMatch(/id: "logwork", labelKey: "chipLogWork"/);
    expect(STARTERS).toMatch(/id: "cv", labelKey: "chipCv"/);
    expect(STARTERS).toMatch(/id: "jobs", labelKey: "chipJobs"/);
  });

  it("the 1–3 owner cap holds for EVERY derivation", () => {
    expect(STARTERS).toMatch(/export const STARTER_CAP = 3/);
    expect(STARTERS).toMatch(/\.slice\(0, STARTER_CAP\)/);
    expect(CHAT).toMatch(/\.slice\(0, STARTER_CAP\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Server threading — canonical reads, honest degradation
// ═══════════════════════════════════════════════════════════════════════════

describe("3. the page threads the flag from the canonical capability read", () => {
  it("resolves the ACTIVE organization and reads organization_roles", () => {
    // Since 2026-09-04 the page delegates to the ONE starter-context loader,
    // which runs the same canonical reads.
    expect(PAGE).toMatch(/loadCompanyStarterContext\(\)/);
    const SIGNALS = read("lib/conversation/starter-signals.ts");
    expect(SIGNALS).toMatch(/getActiveOrganizationContext\(\)/);
    expect(SIGNALS).toMatch(/readOrganizationCapabilities\(/);
    expect(SIGNALS).toMatch(/isEducationFirstWorkspace\(/);
  });

  it("the learner link comes from the existing engagement read, student slug", () => {
    // The SAME RLS-scoped read the network page uses — no second read path.
    expect(PAGE).toMatch(/listMyEngagements\(\)/);
    expect(PAGE).toMatch(/relationshipSlug === "student"/);
  });

  it("the learner's institution is named ONCE — by the opening brief, never also by this page", () => {
    // W6 honesty (2026-09-06), measured on production: the learner's first
    // screen said "Mokotės su X" twice — this page's own intro line AND the
    // opening brief. The brief (`briefLearner`) is the one source; the page
    // keeps the engagement read only for the starters, and still renders a
    // name only when it is REAL (no placeholder on screen).
    expect(PAGE).toMatch(/organizationName\?\.trim\(\) \|\| null/);
    expect(PAGE).not.toMatch(/learnerGreetingContext/);
    expect(PAGE).not.toMatch(/learnerContextLine=/);
    const BRIEF = read("lib/conversation/opening-brief.ts");
    expect(BRIEF).toMatch(/t\("briefLearner", \{ organization: learner\.organizationName \}\)/);
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
