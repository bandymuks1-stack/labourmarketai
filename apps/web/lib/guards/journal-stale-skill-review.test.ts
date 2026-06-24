import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractJournalSuggestions } from "@/lib/structuring/extract-journal-suggestions";
import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";

/**
 * Journal stale/wrong-skill review state guard (PR B).
 *
 * Pins: (a) the owner recognition examples never produce a construction bundle,
 * (b) the per-entry chip SOURCE wiring is real (page computes it from the entry
 * text + verified flag), (c) the entry card surfaces a "needs review" state and
 * safe actions, (d) it still does NOT render the whole profile skill set per
 * entry, and (e) the honest-source i18n exists in all active locales.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const repoRoot = join(__dirname, "..", "..", "..", "..");

const CONSTRUCTION_SLUGS = new Set(SKILL_HINTS_LT.map((r) => r.slug));
function constructionSlugs(text: string): string[] {
  return extractJournalSuggestions(text).skillSlugs.filter((s) => CONSTRUCTION_SLUGS.has(s));
}

describe("Guard: owner examples — no random construction bundle", () => {
  it("'Dirbau su svetainės dizainu 9 h' → zero construction (web/interior design)", () => {
    expect(constructionSlugs("Dirbau su svetainės dizainu 9 h")).toEqual([]);
  });

  it("combined 'vedžiojau šunį Keičiau skaitliuką ir dažiau tvorą valandą laiko' → no unrelated bundle", () => {
    // "dažiau (tvorą)" legitimately supports `painting` (they painted) — that is
    // text-supported, not random. What must NOT appear is the unrelated heavy-
    // construction bundle (crane/timber/window/blueprint/scaffolding/…). So the
    // ONLY construction slug allowed here is the text-supported `painting`.
    const got = constructionSlugs("vedžiojau šunį Keičiau skaitliuką ir dažiau tvorą valandą laiko");
    const bundle = got.filter((s) => s !== "painting");
    expect(bundle, `unexpected construction bundle: ${bundle.join(", ")}`).toEqual([]);
    // Hard stop on the owner-named bundle items in particular.
    for (const banned of ["timber-framing", "blueprint-reading", "scaffolding", "bricklaying", "concrete-pouring", "rebar-cutting", "welding-blueprint"]) {
      expect(got).not.toContain(banned);
    }
  });

  it("the construction vocabulary is non-trivial (the guard could actually fire)", () => {
    // Sanity: a real construction sentence DOES yield construction slugs, so the
    // negative assertions above are meaningful, not vacuous.
    expect(constructionSlugs("Klijavau plyteles ir glaisčiau sienas 8 h").length).toBeGreaterThan(0);
  });
});

describe("Guard: journal page computes a real per-entry chip source", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");
  it("reads worker_skills.verified for the confirmed source", () => {
    expect(page).toMatch(/select\(\s*["']skill_id,\s*verified,\s*skills\(slug\)["']/);
  });
  it("recognizes skills from THIS entry's real text", () => {
    expect(page).toContain("extractJournalSuggestions(e.original_text");
    expect(page).toContain("buildEntrySkillSources");
  });
  it("passes the per-entry sources into the skill-link UI", () => {
    expect(page).toMatch(/skillSources,?\s*\n/);
  });
});

describe("Guard: entry card surfaces review state + safe actions, not a profile-wide wall", () => {
  const comp = read("components/app/journal-entry-skill-links.tsx");
  it("renders a 'needs review' bucket distinct from clean evidence", () => {
    expect(comp).toMatch(/entry-skill-review-\$\{entryId\}/);
    expect(comp).toContain("reviewHeading");
    expect(comp).toContain("needsReview(");
  });
  it("offers safe review actions (re-check + unlink the wrong ones)", () => {
    expect(comp).toMatch(/entry-skill-review-again-\$\{entryId\}/);
    expect(comp).toMatch(/entry-skill-unlink-flagged-\$\{entryId\}/);
    expect(comp).toContain("unlinkFlagged");
  });
  it("does NOT render all profile skills by default (picker stays opt-in)", () => {
    // Default list is the linked/clean chips; the full set only when `picker`.
    expect(comp).toMatch(/picker \? availableSkills : cleanChips/);
    expect(comp).toMatch(/setPicker/);
  });
  it("unlink is explicit (no silent overwrite of links)", () => {
    // Links only change through toggle()/unlinkFlagged() → setJournalEntrySkillLinks.
    expect(comp).toContain("setJournalEntrySkillLinks");
    expect(comp).toMatch(/function unlinkFlagged/);
  });
});

describe("Guard: honest-source i18n exists in all active locales", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: journalSkillLinks source + review keys present`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as Record<string, unknown>;
      const jsl = j.journalSkillLinks as Record<string, unknown>;
      const src = jsl.source as Record<string, string>;
      for (const k of ["recognized", "confirmed", "manual"] as const) {
        expect(src?.[k], `${loc}.journalSkillLinks.source.${k}`).toBeTruthy();
      }
      for (const k of ["reviewHeading", "reviewHelper", "reviewAgain", "unlinkFlagged"] as const) {
        expect(jsl[k], `${loc}.journalSkillLinks.${k}`).toBeTruthy();
      }
    });
  }
});

describe("Guard: PR B audit docs exist", () => {
  it("map visual-action bridge audit + contact/permission/quota audit are present", () => {
    expect(existsSync(join(repoRoot, "docs/audits/market-map-visual-action-bridge-v1.md"))).toBe(true);
    expect(existsSync(join(repoRoot, "docs/audits/contact-permission-quota-bridge-v1.md"))).toBe(true);
  });
});
