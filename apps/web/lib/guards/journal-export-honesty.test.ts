import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  JOURNAL_CSV_HEADER,
  buildJournalCsv,
  journalCsvFilename,
} from "@/lib/journal/journal-export";

/**
 * Journal CSV export guard (quality-train PR I).
 *
 * The third real export on the documents surface. Pins: the builder is
 * pure and never invents rows, skills are exported as LINKED evidence
 * (never "verified"), the route reads only the caller's own data, and the
 * format-status line stays honest (CSV joins PDF as available; Excel/Word
 * stay "preparing" — stated, never clickable).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("CSV builder is pure and honest", () => {
  it("no entries → header-only CSV, never fake rows", () => {
    expect(buildJournalCsv([])).toBe(JOURNAL_CSV_HEADER.join(",") + "\r\n");
  });

  it("escapes quotes/commas/newlines and joins skills with |", () => {
    const csv = buildJournalCsv([
      {
        createdAt: "2026-07-06T10:00:00Z",
        entryType: "text_first",
        language: "lt",
        text: 'Dažiau sienas, "antras" sluoksnis,\nvonia',
        linkedSkillSlugs: ["dazymo_darbai", "glaistymas"],
      },
    ]);
    expect(csv).toContain('"Dažiau sienas, ""antras"" sluoksnis,\nvonia"');
    expect(csv).toContain("dazymo_darbai|glaistymas");
  });

  it("the skills column is named as evidence links, never verification", () => {
    expect(JOURNAL_CSV_HEADER).toContain("linked_skills");
    expect(JOURNAL_CSV_HEADER.join(",")).not.toMatch(/verified/);
  });

  it("filename is filesystem-safe and day-stamped", () => {
    expect(journalCsvFilename("2026-07-06")).toBe("work-journal-2026-07-06.csv");
  });
});

describe("the export route reads ONLY the caller's own journal", () => {
  const route = read("app/[locale]/dashboard/journal/export/route.ts");

  it("worker resolved from the signed-in profile; entries scoped to it", () => {
    expect(route).toMatch(/eq\("profile_id", user\.id\)/);
    expect(route).toMatch(/eq\("worker_id", worker\.id\)/);
    expect(route).not.toMatch(/service_role|SERVICE_ROLE/);
  });

  it("unauthenticated/non-worker get honest errors, never an empty fake file", () => {
    expect(route).toMatch(/not_authenticated[\s\S]*401/);
    expect(route).toMatch(/no_worker[\s\S]*403/);
  });

  it("serves an attachment and never caches", () => {
    expect(route).toMatch(/Content-Disposition.*attachment/);
    expect(route).toMatch(/no-store/);
    expect(route).toMatch(/force-dynamic/);
  });
});

describe("the documents surface stays honest about formats", () => {
  it("the journal export card is a real download anchor", () => {
    const page = read("app/[locale]/dashboard/documents/page.tsx");
    expect(page).toMatch(/documents-report-\$\{e\.key\}/);
    expect(page).toMatch(/journal\/export/);
    expect(page).toMatch(/download: true/);
  });

  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: journal export copy exists; Excel/Word stay 'preparing'`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        documents: { reports: Record<string, string> };
      };
      const r = msgs.documents.reports;
      expect(r.journal?.trim().length, `${loc}: reports.journal`).toBeGreaterThan(0);
      expect(r.journalNote?.trim().length, `${loc}: reports.journalNote`).toBeGreaterThan(0);
      expect(r.formatStatus).toMatch(/CSV/);
      // The unavailable formats remain stated, not offered.
      expect(r.formatStatus).toMatch(/Excel \/ Word/);
    });
  }
});
