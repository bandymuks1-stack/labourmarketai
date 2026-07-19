import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal Proof Engine v1 guard (Sprint v2 §3) — pins the doctrine rules of
 * the proof-engine slice:
 *   - spreadsheet mode is a BULK SURFACE over the ONE journal write path
 *     (createJournalEntry only — no batch RPC, no second journal system);
 *   - profession templates are a §10 SLUG REGISTRY (owner-gated draft
 *     migration, every seed inactive, admin-only writes) — never a hardcoded
 *     UI enum;
 *   - AI suggestions run through the shared router's work_journal agent with
 *     an honest off state; every candidate is confirm/discard (§7.1) and the
 *     confirm paths REUSE the existing CV-slice actions;
 *   - migration hygiene: -- DOWN section, paired rollback file, ledger entry;
 *   - launch-locale copy exists (lt/en/ru/nl/de).
 */
const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf8").replace(/\r/g, "");
const readRepo = (rel: string): string =>
  readFileSync(join(REPO, rel), "utf8").replace(/\r/g, "");

const MIGRATION = "supabase/migrations/20260714180000_journal_profession_templates_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260714180000_journal_profession_templates_v1.down.sql";

describe("spreadsheet mode — one write path", () => {
  const comp = read("components/app/journal-spreadsheet-entry.tsx");
  const model = read("lib/journal/spreadsheet-entry-model.ts");
  it("every row saves via the existing createJournalEntry action only", () => {
    expect(comp).toContain('import { createJournalEntry } from "@/lib/journal/actions"');
    expect(comp).not.toMatch(/supabase|\.rpc\(|createJournalEntriesBatch/);
  });
  it("batch is bounded and units come from the §15 registry subset", () => {
    expect(model).toMatch(/SPREADSHEET_MAX_ROWS = 15/);
    expect(model).toMatch(/SPREADSHEET_UNIT_OPTIONS/);
    // No invented unit slug: every option is one the composer already offers.
    expect(model).not.toMatch(/cubic_meters|liters|tons/);
  });
  it("failed rows are reported honestly (per-row error + real summary)", () => {
    expect(comp).toMatch(/journal-spreadsheet-row-error-/);
    expect(comp).toMatch(/journal-spreadsheet-summary/);
    expect(comp).toMatch(/savedSummary/);
  });
});

describe("profession templates — §10 slug registry, owner-gated", () => {
  const migration = readRepo(MIGRATION);
  it("migration + paired rollback + ledger entry exist", () => {
    expect(existsSync(join(REPO, ROLLBACK)), ROLLBACK).toBe(true);
    expect(migration).toContain("-- DOWN");
    expect(readRepo("docs/APPLIED_LEDGER.md")).toContain(
      "20260714180000_journal_profession_templates_v1.sql",
    );
  });
  it("every seed ships inactive; activation is an owner action", () => {
    expect(migration).toMatch(/active\s+boolean not null default false/);
    // The three seeds all end with `false` — no template is live at apply.
    const seedTails = migration.match(/'::jsonb,\s*\n\s*(true|false)\s*\n\s*\)/g) ?? [];
    expect(seedTails.length).toBe(3);
    for (const tail of seedTails) expect(tail).toContain("false");
  });
  it("authenticated read of active rows only; writes admin-only", () => {
    expect(migration).toMatch(/using \(active or public\.is_admin\(\)\)/);
    expect(migration).toMatch(
      /for all\s*\n\s*using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/,
    );
  });
  it("templates are DATA — the composer hardcodes no template slugs (§10)", () => {
    const composer = read("components/app/journal-entry-composer.tsx");
    expect(composer).not.toMatch(/construction_daily|transport_daily|cleaning_daily/);
    // Honest absence: the picker renders only when active templates exist.
    expect(composer).toMatch(/visibleTemplates\.length > 0/);
    expect(composer).toMatch(/data-testid="journal-template-picker"/);
  });
  it("the server read degrades honestly when the registry is not applied", () => {
    const lib = read("lib/journal/journal-templates.ts");
    // P0 perf v1: still returns [] on error, and additionally memoizes the
    // proven-absent registry so the 404 isn't re-paid on every navigation.
    expect(lib).toMatch(/if \(res\.error\) \{[\s\S]{0,200}return \[\];/);
    expect(lib).toMatch(/templatesStoreAbsent/);
  });
});

describe("AI suggestions — shared router, §7.1 confirm-only", () => {
  const action = read("lib/journal/journal-ai-suggestions-actions.ts");
  const comp = read("components/app/journal-ai-suggestions.tsx");
  it("runs the registered work_journal agent through the shared router", () => {
    expect(action).toContain('runAiAgent(\n      "work_journal"');
    expect(action).toContain('from "@/lib/ai/run-agent-server"');
    // Data minimisation: only the entry draft text is sent.
    expect(action).toMatch(/\{ rawText \}/);
  });
  it("has an honest off state (no fake AI, no error wall)", () => {
    expect(action).toMatch(/return \{ status: "off" \}/);
    expect(comp).toMatch(/data-testid="journal-ai-off-note"/);
  });
  it("confirm paths REUSE the existing CV-slice actions (no duplicates)", () => {
    expect(comp).toContain("saveProfileSkillClaimsAction");
    expect(comp).toContain("confirmCvAchievementAction");
    expect(comp).toContain("confirmCvWorkHistoryAction");
    expect(comp).not.toMatch(/\.from\(|\.rpc\(|insert\(/);
  });
  it("nothing persists without an explicit user confirm (button-gated)", () => {
    // The run itself is user-initiated…
    expect(comp).toMatch(/data-testid="journal-ai-suggest-cta"/);
    // …and every item carries confirm + discard controls.
    expect(comp).toMatch(/journal-ai-confirm-/);
    expect(comp).toMatch(/t\("discard"\)/);
  });
  it("work_journal v1.1 candidates stay suggestion-only in the prompt", () => {
    const agent = read("lib/ai/registry/agents/work-journal.ts");
    expect(agent).toMatch(/version: "1\.1\.0"/);
    expect(agent).toMatch(/suggested_achievements/);
    expect(agent).toMatch(/suggested_experience_periods/);
    expect(agent).toMatch(/suggested_project_names/);
    expect(agent).toMatch(/never invented/i);
  });
});

describe("proof-engine loop strip — real counts on the journal page", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");
  it("renders one dense strip with the loop counts + CV link", () => {
    expect(page).toMatch(/data-testid="journal-proof-loop"/);
    expect(page).toMatch(/entriesThisMonth/);
    expect(page).toMatch(/evidencedSkillIds\.size/);
    expect(page).toMatch(/verifiedSkillIds\.size/);
    expect(page).toMatch(/data-testid="journal-proof-loop-cv-link"/);
  });
});

describe("i18n copy present (launch locales)", () => {
  for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
    it(`${loc}: spreadsheet / templates / aiSuggest / proofLoop keys exist`, () => {
      const j = JSON.parse(read(`messages/${loc}/journal.json`));
      for (const k of [
        "title",
        "hint",
        "colDate",
        "colText",
        "saveAll",
        "savedSummary",
        "rowCount",
      ]) {
        expect(typeof j.spreadsheet?.[k], `${loc} spreadsheet.${k}`).toBe("string");
      }
      for (const k of [
        "text_required",
        "date_invalid",
        "quantity_invalid",
        "hours_invalid",
        "engagement_required",
      ]) {
        expect(typeof j.spreadsheet?.errors?.[k], `${loc} errors.${k}`).toBe(
          "string",
        );
      }
      for (const k of [
        "title",
        "hint",
        "construction_daily",
        "transport_daily",
        "cleaning_daily",
      ]) {
        expect(typeof j.templates?.[k], `${loc} templates.${k}`).toBe("string");
      }
      for (const k of [
        "title",
        "cta",
        "disclaimer",
        "offNote",
        "skillsTitle",
        "achievementsTitle",
        "experienceTitle",
        "projectTitle",
        "needsMigration",
      ]) {
        expect(typeof j.aiSuggest?.[k], `${loc} aiSuggest.${k}`).toBe("string");
      }
      expect(typeof j.proofLoop?.strip, `${loc} proofLoop.strip`).toBe("string");
      expect(typeof j.proofLoop?.cvLink, `${loc} proofLoop.cvLink`).toBe("string");
    });
  }
});
