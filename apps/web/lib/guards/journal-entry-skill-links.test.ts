import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Journal Entry ↔ Skill links v1.
 *
 * A worker can mark which of their declared skills a work-journal entry
 * supports — a DURABLE relation (`journal_entry_skills`) that strengthens the
 * real evidence chain. This guard pins the honesty + canonical-surface
 * invariants so it can't drift into fake verification or a parallel surface:
 *
 *   1. The durable relation exists as a migration (additive, owner-scoped RLS,
 *      grant to authenticated only).
 *   2. It is EVIDENCE-SUPPORT, never verification: the link UI copy + the write
 *      action never claim verified/confirmed, and the action never flips
 *      worker_skills.verified / source='manager_confirmed'.
 *   3. Canonical surfaces: the journal page is the input (renders the link UI),
 *      the profile hub is the output (uses the durable read). No new route.
 *   4. LT/EN copy parity for the link UI.
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const JOURNAL_PAGE = "app/[locale]/dashboard/journal/page.tsx";
const PROFILE_PAGE = "app/[locale]/dashboard/profile/page.tsx";
const LINK_UI = "components/app/journal-entry-skill-links.tsx";
const ACTION = "lib/journal/journal-entry-skills-actions.ts";
const HELPERS = "lib/journal/journal-entry-skills.ts";
const LOCALES = ["lt", "en"] as const;

// ── 1. The durable migration exists, additive + owner-scoped ──────────────

describe("Guard: journal_entry_skills durable relation migration", () => {
  const dir = join(REPO_ROOT, "supabase", "migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_journal_entry_skills.sql"));

  it("a timestamped migration file exists", () => {
    expect(file, "no *_journal_entry_skills.sql migration found").toBeTruthy();
    expect(file!).toMatch(/^\d{14}_journal_entry_skills\.sql$/);
  });

  it("creates the table with the entry+skill+worker columns + a unique pair", () => {
    const sql = readFileSync(join(dir, file!), "utf8");
    expect(sql).toMatch(/create table if not exists public\.journal_entry_skills/);
    expect(sql).toMatch(/journal_entry_id\s+uuid/);
    expect(sql).toMatch(/skill_id\s+uuid/);
    expect(sql).toMatch(/worker_id\s+uuid/);
    expect(sql).toMatch(/unique\s*\(\s*journal_entry_id\s*,\s*skill_id\s*\)/);
  });

  it("is owner-scoped RLS + grants to authenticated only (never anon/public)", () => {
    const sql = readFileSync(join(dir, file!), "utf8");
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/owns_worker\(/);
    expect(sql).toMatch(/grant[\s\S]*?on public\.journal_entry_skills to authenticated/i);
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    // has the required rollback comment (migration-safety GREEN)
    expect(sql).toMatch(/--[^\n]*rollback/i);
  });
});

// ── 2. Evidence-support, never verification ───────────────────────────────

const VERIFY_CLAIM = /patvirtint|patikrint|\bverified\b|\bconfirmed\b/i;

describe("Guard: the link layer is evidence-support, never verification", () => {
  it("the write action never verifies/confirms a skill", () => {
    const action = read(ACTION);
    // It must not flip worker_skills.verified or set manager_confirmed.
    expect(action).not.toMatch(/manager_confirmed/);
    expect(action).not.toMatch(/verified\s*[:=]\s*true/);
    expect(action).not.toMatch(/\.update\(/); // it only inserts/deletes links
  });

  it("the write action is owner-scoped (re-checks worker + skill ownership)", () => {
    const action = read(ACTION);
    expect(action).toMatch(/from\("workers"\)/);
    expect(action).toMatch(/profile_id/);
    expect(action).toMatch(/skill_not_owned/);
    expect(action).toMatch(/from\("worker_skills"\)/);
  });

  for (const loc of LOCALES) {
    it(`${loc}: journalSkillLinks copy never claims verified/confirmed (except the honest negation)`, () => {
      const ns = loadJson(`messages/${loc}.json`).journalSkillLinks as Record<string, string>;
      expect(ns, `${loc} journalSkillLinks missing`).toBeTruthy();
      for (const [k, v] of Object.entries(ns)) {
        if (k === "helper") continue; // the "evidence, not verification" line
        expect(VERIFY_CLAIM.test(v), `${loc} journalSkillLinks.${k}: "${v}"`).toBe(false);
      }
    });

    it(`${loc}: the helper says this is evidence, NOT verification`, () => {
      const ns = loadJson(`messages/${loc}.json`).journalSkillLinks as Record<string, string>;
      const helper = ns.helper ?? "";
      const honest = loc === "lt" ? /ne\s+patvirtinimas/i.test(helper) : /not\s+verification/i.test(helper);
      expect(honest, `${loc} helper must frame as evidence not verification: "${helper}"`).toBe(true);
    });
  }

  it("LT and EN journalSkillLinks key sets are identical (no drift)", () => {
    const lt = Object.keys(loadJson("messages/lt.json").journalSkillLinks as object).sort();
    const en = Object.keys(loadJson("messages/en.json").journalSkillLinks as object).sort();
    expect(lt).toEqual(en);
  });
});

// ── 3. Canonical surfaces: journal input, profile output, no new route ────

describe("Guard: canonical surfaces only", () => {
  it("the journal page (input) renders the per-entry link UI", () => {
    const page = read(JOURNAL_PAGE);
    expect(page).toMatch(/journal_entry_skills/);
    expect(page).toMatch(/skillLinks=\{/);
  });

  it("the link UI persists via the owner-scoped action + announces the result", () => {
    const ui = read(LINK_UI);
    expect(ui).toMatch(/setJournalEntrySkillLinks/);
    expect(ui).toMatch(/role="alert"|role="status"/);
  });

  it("the profile hub (output) uses the durable relation for evidence-support", () => {
    const page = read(PROFILE_PAGE);
    expect(page).toMatch(/journal_entry_skills/);
    expect(page).toMatch(/journalSupported|supportedSkillIds/);
  });

  it("the pure helpers expose the durable derivation", () => {
    const h = read(HELPERS);
    expect(h).toMatch(/supportedSkillIds/);
    expect(h).toMatch(/countEntriesBySkill/);
  });

  it("creates NO new profile/CV/skill/journal/AI route", () => {
    const ROUTE_DIRS = [
      "app/[locale]/dashboard/skills",
      "app/[locale]/dashboard/evidence",
      "app/[locale]/dashboard/journal-skills",
      "app/[locale]/dashboard/cv",
      "app/[locale]/dashboard/ai",
    ];
    for (const d of ROUTE_DIRS) {
      expect(existsSync(join(APP_ROOT, d)), `forbidden parallel route ${d}`).toBe(false);
    }
  });
});

// ── Negative controls ─────────────────────────────────────────────────────

describe("Guard: detectors are real (negative controls)", () => {
  it("the verify-claim detector flags affirmative claims, not 'evidence'", () => {
    expect(VERIFY_CLAIM.test("Įgūdis patvirtintas")).toBe(true);
    expect(VERIFY_CLAIM.test("verified")).toBe(true);
    expect(VERIFY_CLAIM.test("Išsaugota")).toBe(false);
    expect(VERIFY_CLAIM.test("evidence, not verification")).toBe(false);
  });
});
