import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Dashboard Empty-State Clarity v1.
 *
 * Every dashboard "room" list/section that can render with no data must show
 * clear, honest empty-state copy that exists + stays aligned in the two
 * canonical launch locales (LT + EN). A blank/null empty state, an LT/EN drift
 * (key added in one locale only), or an overclaiming empty state ("AI matched",
 * "verified", "paid plan active", outcome guarantee) are all regressions this
 * guard blocks. Runs in CI via `pnpm -F web test`.
 *
 * This is an i18n + source-wiring contract — it does NOT invent copy. Audited
 * surfaces (2026-06-01): /dashboard, account, profile, buyer, company, agency,
 * journal. `account` (fixed role catalogue) and `profile` (manual-add form
 * always shown) have no emptyable list lacking copy, so they carry no entry.
 *
 * Doctrine: PLATFORM_DOCTRINE §7 (no fake verification / AI / matching /
 * paid claims), CLAUDE.md "no unlabeled fake data — we will not invent people".
 */

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}
function get(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]),
      obj,
    );
}

const CANONICAL_LOCALES = ["lt", "en"] as const;

// src: "mono" => messages/<loc>.json ; "journal" => messages/<loc>/journal.json
type Source = "mono" | "journal";
type Entry = { room: string; key: string; src: Source };

// The empty-state copy contract. Every key here is rendered by an empty-state
// branch in the room's page/section (wiring asserted below).
const EMPTY_STATE_KEYS: Entry[] = [
  // journal room (split namespace)
  { room: "journal", key: "listEmpty", src: "journal" },
  { room: "journal", key: "noContext.none", src: "journal" },
  { room: "journal", key: "noContext.pending", src: "journal" },
  { room: "journal", key: "noContext.roster", src: "journal" },
  { room: "journal", key: "noContextCta", src: "journal" },
  // buyer room
  { room: "buyer", key: "roleDashboards.buyer.requests.emptyStateHeading", src: "mono" },
  { room: "buyer", key: "roleDashboards.buyer.requests.emptyStateBody", src: "mono" },
  { room: "buyer", key: "roleDashboards.buyer.requests.attachments.empty", src: "mono" },
  // company room
  { room: "company", key: "roleDashboards.company.workers.noWorkersHeading", src: "mono" },
  { room: "company", key: "roleDashboards.company.workers.noWorkersBody", src: "mono" },
  { room: "company", key: "roleDashboards.company.workers.invitationsEmpty", src: "mono" },
  { room: "company", key: "teamRosterEmpty.company.title", src: "mono" },
  { room: "company", key: "teamRosterEmpty.company.intro", src: "mono" },
  { room: "company", key: "teamRosterEmpty.company.footnote", src: "mono" },
  // agency room
  { room: "agency", key: "roleDashboards.agency.workers.noWorkersHeading", src: "mono" },
  { room: "agency", key: "roleDashboards.agency.workers.noWorkersBody", src: "mono" },
  { room: "agency", key: "roleDashboards.agency.workers.invitationsEmpty", src: "mono" },
  { room: "agency", key: "teamRosterEmpty.agency.title", src: "mono" },
  { room: "agency", key: "teamRosterEmpty.agency.intro", src: "mono" },
  { room: "agency", key: "teamRosterEmpty.agency.footnote", src: "mono" },
  // org members panel (shared by company + agency)
  { room: "orgMembers", key: "orgMembers.noMembers", src: "mono" },
  { room: "orgMembers", key: "orgMembers.noAddable", src: "mono" },
  { room: "orgMembers", key: "orgMembers.allAdded", src: "mono" },
];

// Subtrees whose EN/LT key sets must match exactly (catches a one-locale add).
const ALIGNED_SUBTREES: { src: Source; path: string }[] = [
  { src: "mono", path: "teamRosterEmpty.company" },
  { src: "mono", path: "teamRosterEmpty.agency" },
  { src: "mono", path: "orgMembers" },
];

// Affirmative overclaim phrases forbidden in empty-state copy. Qualified so the
// honest negating copy ("Matching is not offered yet") is never matched —
// empty-state values are scanned, and none should carry these claims.
const FORBIDDEN: RegExp[] = [
  /\bAI[\s-]*(?:match|matching|verif|confirm)/i,
  /\bAI[\s-]+powered\b/i,
  /\bautomatically\s+verified\b/i,
  /\bautomatic\s+verification\b/i,
  /\bverified\s+automatically\b/i,
  /\binstant\s+hiring\b/i,
  /\bpaid\s+plan\s+active\b/i,
  /\bwe\s+guarantee\b/i,
  /\bguaranteed\b/i,
  /\bautomatiškai\s+patvirtin/i,
  /\bgarantuojame\b/i,
];

function localeBlob(locale: string, src: Source): Record<string, unknown> {
  return src === "journal"
    ? loadJson(`messages/${locale}/journal.json`)
    : loadJson(`messages/${locale}.json`);
}

describe("Guard: every dashboard empty state has aligned LT+EN copy", () => {
  for (const locale of CANONICAL_LOCALES) {
    const mono = localeBlob(locale, "mono");
    const journal = localeBlob(locale, "journal");
    for (const { room, key, src } of EMPTY_STATE_KEYS) {
      it(`${locale} ${room}: ${src === "journal" ? "journal." : ""}${key} is a non-empty string`, () => {
        const v = get(src === "journal" ? journal : mono, key);
        expect(
          typeof v === "string" && (v as string).trim().length > 0,
          `${locale} ${src} key "${key}" must be a non-empty string`,
        ).toBe(true);
      });
    }
  }

  for (const { src, path } of ALIGNED_SUBTREES) {
    it(`${path} key set is identical in LT and EN (no drift)`, () => {
      const en = get(localeBlob("en", src), path) as Record<string, unknown>;
      const lt = get(localeBlob("lt", src), path) as Record<string, unknown>;
      expect(en, `en ${path} missing`).toBeTruthy();
      expect(lt, `lt ${path} missing`).toBeTruthy();
      expect(Object.keys(en).sort()).toEqual(Object.keys(lt).sort());
    });
  }
});

describe("Guard: empty-state copy carries no overclaim", () => {
  for (const locale of CANONICAL_LOCALES) {
    it(`${locale} empty-state copy is honest (no AI/verify/paid/guarantee)`, () => {
      const mono = localeBlob(locale, "mono");
      const journal = localeBlob(locale, "journal");
      for (const { key, src } of EMPTY_STATE_KEYS) {
        const v = get(src === "journal" ? journal : mono, key) as string;
        if (typeof v !== "string") continue;
        for (const rx of FORBIDDEN) {
          expect(
            rx.test(v),
            `${locale} "${key}" overclaim matching ${rx}: ${v}`,
          ).toBe(false);
        }
      }
    });
  }
});

describe("Guard: rooms still render their empty-state branches", () => {
  it("journal page renders the no-context + empty-list states", () => {
    const src = read("app/[locale]/dashboard/journal/page.tsx");
    expect(src).toMatch(/noContext/);
    expect(src).toMatch(/listEmpty/);
  });

  it("buyer requests section renders empty list + empty attachments", () => {
    const src = read("components/app/buyer-requests-section.tsx");
    expect(src).toMatch(/rows\.length === 0/);
    expect(src).toMatch(/emptyStateHeading/);
    expect(src).toMatch(/requestAttachments\.length === 0/);
    expect(src).toMatch(/attachmentsEmpty/);
  });

  for (const role of ["company", "agency"] as const) {
    it(`${role} workers section renders empty workers + invitations`, () => {
      const src = read(`components/app/${role}-workers-section.tsx`);
      expect(src).toMatch(/activeWorkers\.length === 0/);
      expect(src).toMatch(/noWorkersHeading/);
      expect(src).toMatch(/pendingInvitations\.length === 0/);
      expect(src).toMatch(/invitationsEmpty/);
    });
  }

  it("org members panel renders its empty state", () => {
    const src = read("components/app/org-members-panel.tsx");
    expect(src).toMatch(/members\.length === 0/);
    expect(src).toMatch(/noMembers/);
  });

  it("team roster empty state resolves the teamRosterEmpty namespace", () => {
    const src = read("components/app/team-roster-empty-state.tsx");
    expect(src).toMatch(/getTranslations\(\s*`teamRosterEmpty\./);
    expect(src).toMatch(/t\("title"\)/);
    expect(src).toMatch(/t\("footnote"\)/);
  });
});
