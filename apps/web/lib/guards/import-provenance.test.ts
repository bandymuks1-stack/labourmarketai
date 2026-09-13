import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD: imports converge WITH PROVENANCE (owner requirement 16, #1724).
 *
 * An imported timesheet, an imported hours document, a CV section a person
 * confirmed — each reaches the readers as a record that NAMES ITS SOURCE, and
 * an organization's import is the ORGANIZATION's record, never merged into
 * the person's own journal figures. This guard pins the write paths that
 * exist today and the read path that carries the provenance to the surfaces:
 *
 *   1. every write to `work_hour_allocations` sets `source` — the timesheet
 *      importer with `ALLOCATION_SOURCE_IMPORT`, the quick entry with
 *      `ALLOCATION_SOURCE_MANUAL`;
 *   2. no module writes BOTH `work_hour_allocations` and
 *      `journal_entry_metrics` — an import never becomes a journal figure;
 *   3. every `journal_entry_metrics` insert names a source from the
 *      existing enum (worker_input | ai_extracted | manager_corrected) and
 *      nothing else; the document-import draft additionally carries the
 *      source document's id as its own metric row;
 *   4. the organization-evidence importer writes its source kind, filename
 *      and reference on every record and reads them back;
 *   5. the ONE allocation read keeps `source`, the ONE reader hands it to the
 *      model, the model separates imported hours, and the section says
 *      "imported from a document" in every active locale;
 *   6. CV-section imports write no hours anywhere — they are the person's
 *      own confirmed statements, stored as such (a certificate is a
 *      `declared_certificate`, never a verified document).
 *
 * NEGATIVE CONTROL (run 2026-09-13, recorded in the lane receipt): with the
 * `source: ALLOCATION_SOURCE_IMPORT` line removed from the timesheet
 * importer's payload, "the timesheet importer writes source" and "no other
 * module writes the table without a named source" fail (2 of 28); restored,
 * the suite is green.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

const METRIC_SOURCE_ENUM = ["worker_input", "ai_extracted", "manager_corrected"] as const;
/** `worker_skills.source` — the other provenance column the skill pipeline
 *  writes in the same modules (lib/evidence/evidence-tier.ts). */
const WORKER_SKILL_SOURCE_ENUM = ["self_declared", "manager_confirmed", "work_journal"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(APP, dir))) {
    const rel = `${dir}/${name}`;
    const abs = join(APP, rel);
    if (statSync(abs).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(rel, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

const SOURCE_FILES = [...walk("lib"), ...walk("app"), ...walk("components")];
const writesTable = (src: string, table: string): boolean =>
  new RegExp(`\\.from\\("${table}"\\)[\\s\\S]{0,400}?\\.(insert|upsert)\\(`).test(src);

const importer = read("lib/timesheet-import/import-confirm-actions.ts");
const quickEntry = read("lib/work-hours/allocations-actions.ts");
const allocationsModel = read("lib/work-hours/allocations-model.ts");
const allocationsRead = read("lib/work-hours/allocations.ts");
const reader = read("lib/journal/work-intelligence-read.ts");
const model = read("lib/journal/work-intelligence.ts");
const section = read("components/app/journal-work-intelligence.tsx");
const writeCore = read("lib/journal/journal-write-core.ts");
const documentDraft = read("lib/journal/document-journal-draft-model.ts");
const evidenceImport = read("lib/organization-evidence/import-core.ts");
const cvImport = read("lib/profile/cv-section-import-actions.ts");

describe("1 · every write to work_hour_allocations names its source", () => {
  it("the source words are constants, not free strings", () => {
    expect(allocationsModel).toContain('export const ALLOCATION_SOURCE_MANUAL = "manual";');
    expect(allocationsModel).toContain('export const ALLOCATION_SOURCE_IMPORT = "import";');
  });
  it("the timesheet importer writes `source: ALLOCATION_SOURCE_IMPORT` on every row of its one atomic insert", () => {
    expect(importer).toMatch(/const payload = rows\.map\(\(row, index\) => \(\{[\s\S]*?source: ALLOCATION_SOURCE_IMPORT,[\s\S]*?\}\)\);/);
    expect(importer).toMatch(/\.from\("work_hour_allocations"\)\s*\.insert\(payload\)/);
  });
  it("1b · the quick entry writes `source: ALLOCATION_SOURCE_MANUAL`", () => {
    expect(quickEntry).toMatch(/\.insert\(\{[\s\S]*?source: ALLOCATION_SOURCE_MANUAL,[\s\S]*?\}\)/);
  });
  it("no other module writes the table without a named source", () => {
    const writers = SOURCE_FILES.filter((f) => writesTable(read(f), "work_hour_allocations"));
    expect(writers.length).toBeGreaterThanOrEqual(2);
    for (const f of writers) {
      expect(read(f), `${f} writes work_hour_allocations without naming ALLOCATION_SOURCE_*`).toMatch(
        /source: ALLOCATION_SOURCE_(IMPORT|MANUAL)/,
      );
    }
  });
});

describe("2 · an organization's import is never merged into the person's journal figures", () => {
  it("no module writes both work_hour_allocations and journal_entry_metrics", () => {
    const both = SOURCE_FILES.filter(
      (f) => writesTable(read(f), "work_hour_allocations") && writesTable(read(f), "journal_entry_metrics"),
    );
    expect(both).toEqual([]);
  });
  it("the timesheet importer touches no journal table", () => {
    expect(importer).not.toMatch(/journal_entries|journal_entry_metrics|journal_entry_skills/);
  });
  it("the model keeps the ledger apart — never inside a period total or a skill", () => {
    expect(model).toContain("NEVER added to `periods` / `totalHours`");
    expect(model).toContain("readonly organizationRecords: readonly OrganizationRecordTotals[] | null;");
  });
});

describe("3 · every journal_entry_metrics write names a source from the existing enum", () => {
  const writers = SOURCE_FILES.filter((f) => writesTable(read(f), "journal_entry_metrics"));
  it("the write scan found the known writers", () => {
    expect(writers).toEqual(
      expect.arrayContaining([
        "lib/journal/skill-pipeline.ts",
        "lib/journal/skill-pipeline-actions.ts",
        "lib/journal/work-time-plausibility-actions.ts",
      ]),
    );
  });
  for (const f of writers) {
    it(`${f}: every \`source:\` literal is worker_input | ai_extracted | manager_corrected (or a worker_skills provenance), and each metrics insert names one`, () => {
      const src = read(f);
      // The same modules also write `worker_skills.source` (self_declared /
      // manager_confirmed / work_journal) — a different column with its own
      // closed vocabulary. Anything outside BOTH sets is an invented source.
      const literals = [...src.matchAll(/\bsource:\s*"([a-z_]+)"/g)].map((m) => m[1]!);
      expect(literals.length, `${f} sets no source literal`).toBeGreaterThan(0);
      for (const lit of literals) {
        expect(
          [...METRIC_SOURCE_ENUM, ...WORKER_SKILL_SOURCE_ENUM] as readonly string[],
          `${f}: source "${lit}" is not in any existing enum`,
        ).toContain(lit);
      }
      // Inside the window of each metrics insert, only the metrics enum.
      for (const m of src.matchAll(/\.from\("journal_entry_metrics"\)[\s\S]{0,60}?\.insert\(/g)) {
        const window = src.slice(m.index!, m.index! + 900);
        for (const lit of [...window.matchAll(/\bsource:\s*"([a-z_]+)"/g)].map((x) => x[1]!)) {
          expect(METRIC_SOURCE_ENUM as readonly string[], `${f}: metrics row source "${lit}"`).toContain(lit);
        }
      }
    });
  }
  it("the RPC write core types every metric row's source to the enum and defaults nothing silently", () => {
    expect(writeCore).toMatch(/source: "worker_input" \| "ai_extracted";/);
    expect(writeCore).not.toMatch(/source:\s*(null|undefined)/);
  });
  it("a document import becomes journal rows that name the document AND carry `ai_extracted`", () => {
    expect(documentDraft).toContain('export const SOURCE_DOCUMENT_METRIC_SLUG = "source_document_file";');
    expect(documentDraft).toMatch(/metric_slug: SOURCE_DOCUMENT_METRIC_SLUG,[\s\S]{0,120}?source: "ai_extracted"/);
    expect(documentDraft).not.toMatch(/source: "worker_input"/);
    // the reader counts those entries as document-backed, by that slug
    expect(model).toContain('import { SOURCE_DOCUMENT_METRIC_SLUG } from "@/lib/journal/document-journal-draft-model";');
    expect(model).toContain("readonly fromDocument: number;");
  });
});

describe("4 · the organization-evidence importer names its source on every record and reads it back", () => {
  it("records carry source_kind, source_filename and source_reference from the import session", () => {
    expect(evidenceImport).toMatch(/source_kind: session\.sourceKind,\s*source_filename: session\.sourceFilename,\s*source_reference: session\.sourceReference,/);
  });
  it("the read-back selects the provenance columns", () => {
    expect(evidenceImport).toMatch(/source_kind, source_filename, imported_at, imported_by_profile_id/);
  });
  it("it writes no journal figure and no allocation", () => {
    expect(evidenceImport).not.toMatch(/journal_entry_metrics|work_hour_allocations/);
  });
});

describe("5 · provenance travels from the one allocation read to the surface", () => {
  it("the allocation read selects `source` and keeps it on the row", () => {
    expect(allocationsRead).toMatch(/"hours_numeric, note, source, status, journal_entry_id/);
    expect(allocationsRead).toMatch(/source: r\.source \?\? "manual",/);
  });
  it("the ONE reader hands `source` to the model as the organization's record", () => {
    expect(reader).toMatch(/readAllocationsForWorker\(supabase, workerId\)/);
    expect(reader).toMatch(/source: r\.source,/);
  });
  it("the model separates imported hours by that source and the section names them", () => {
    expect(model).toContain("readonly importedHours: number;");
    expect(model).toMatch(/source === "import"/);
    expect(section).toContain('t("orgRecords.imported", { hours: fmtHours(orgPeriod.importedHours, locale) })');
  });
  for (const loc of ACTIVE) {
    it(`${loc}: the imported-from-document sentence exists and carries {hours}`, () => {
      const intel = JSON.parse(read(`messages/${loc}/journal.json`)) as { intelligence: { orgRecords: Record<string, string> } };
      expect(intel.intelligence.orgRecords.imported).toContain("{hours}");
    });
  }
});

describe("6 · CV-section imports are the person's own confirmed statements — no hours, no verification", () => {
  it("writes no journal figure and no allocation", () => {
    expect(cvImport).not.toMatch(/journal_entry_metrics|work_hour_allocations|journal_entries/);
  });
  it("a certificate from a CV is a declared certificate, never a verified document", () => {
    expect(cvImport).toContain('return insertAchievement("declared_certificate", input);');
    expect(cvImport).not.toMatch(/confirmed_by_manager:\s*true|verified:\s*true|\.from\("worker_documents"\)/);
  });
  it("work history goes through the self-declared RPC", () => {
    expect(cvImport).toContain('"save_self_declared_work_history_v1"');
  });
});
