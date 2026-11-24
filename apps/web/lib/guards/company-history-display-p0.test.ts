import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildBusinessHistory, type BusinessHistoryRecord, type HistoryPeriodStatement } from "@/lib/organization-evidence/business-history";
import { businessHistoryHeader } from "@/lib/organization-evidence/business-history-header";
import { buildCompanyWorkHistory, topWorkDescriptions } from "@/lib/organization-evidence/company-work-history";
import { hoursCountedOnce } from "@/lib/organization-evidence/hours-counted-once";
import { isImportPlaceholderText, workDescription } from "@/lib/organization-evidence/import-placeholder-text";
import type { EvidenceRecordView } from "@/lib/organization-evidence/import-core";

/**
 * OWNER P0 2026-11-24 — "the historical-data display is nonsense". Five
 * defects of /dashboard/company/history, each pinned at its true cause.
 * Synthetic data only; no display change alters a stored record.
 */
const ROOT = join(__dirname, "../../../..");
const SRC = (p: string) => readFileSync(join(ROOT, "apps/web", p), "utf8");
const OVERVIEW = SRC("components/app/organization/business-history-overview.tsx");
const HISTORY = SRC("components/app/organization/company-work-history.tsx");
const PROJECT_HISTORY = SRC("components/app/project-historical-work.tsx");
const LOCALES = ["en", "lt", "pl", "de", "ru", "lv", "et", "sv", "no", "da", "nl"] as const;

function statement(over: Partial<HistoryPeriodStatement> & Pick<HistoryPeriodStatement, "id">): HistoryPeriodStatement {
  return {
    periodLabel: over.id,
    legalEntityLabel: null,
    sourceLabels: [],
    periodStart: null,
    periodEnd: null,
    continuity: "continuous_business_history",
    legalEntityRelation: "not_asserted",
    basis: "owner_statement",
    basisReference: "internal reference that must never render",
    statement: "Internal English narrative that must never render.",
    createdAt: "2026-09-30T00:00:00Z",
    ...over,
  };
}

function rec(over: Partial<BusinessHistoryRecord> & Pick<BusinessHistoryRecord, "id">): BusinessHistoryRecord {
  return {
    personId: "p1",
    workObjectId: null,
    projectId: null,
    activityDate: "2025-03-03",
    periodStart: null,
    periodEnd: null,
    hours: 8,
    sourceLabel: null,
    ...over,
  };
}

describe("1. internal notes never render", () => {
  it("the overview renders no statement reference and no statement narrative", () => {
    expect(OVERVIEW).not.toMatch(/basisReference/);
    expect(OVERVIEW).not.toMatch(/\{p\.statement\}|\.statement\s*\?\s*\(/);
    expect(OVERVIEW).not.toMatch(/<blockquote/);
  });
  it("what a period rests on is one localized label", () => {
    expect(OVERVIEW).toMatch(/t\(`basis\.\$\{b\}`\)/);
  });
});

describe("2. no importer English in the UI", () => {
  it("the three importer placeholders are recognised; real descriptions are kept", () => {
    expect(isImportPlaceholderText("Historical work recorded in source timesheet.")).toBe(true);
    expect(isImportPlaceholderText("  historical work recorded in   source timesheet. ")).toBe(true);
    expect(isImportPlaceholderText("Historical weekly work recorded in 2026 worker-hours source.")).toBe(true);
    expect(isImportPlaceholderText("Work recorded in source timesheet; description unavailable in annual summary.")).toBe(true);
    expect(workDescription("Plytelių klijavimas vonioje")).toBe("Plytelių klijavimas vonioje");
    expect(workDescription("Tiling, as recorded in source timesheet.")).toBe("Tiling, as recorded in source timesheet.");
    expect(workDescription("Historical work recorded in source timesheet.")).toBeNull();
  });
  it("'what was done' never lists a placeholder (no '… ×4')", () => {
    const r = (text: string) => ({ text }) as Pick<EvidenceRecordView, "text">;
    const top = topWorkDescriptions([
      r("Historical work recorded in source timesheet."),
      r("Historical work recorded in source timesheet."),
      r("Glaistymas"),
    ]);
    expect(top).toEqual([{ text: "Glaistymas", records: 1 }]);
  });
  it("every surface that prints a record description reads it through workDescription", () => {
    for (const src of [HISTORY, PROJECT_HISTORY]) {
      expect(src).toMatch(/workDescription\(/);
      expect(src).toMatch(/descriptionNotInSource/);
    }
    expect(HISTORY).not.toMatch(/\{latest\.text\}/);
  });
  it("the new labels exist in every locale (no raw key, no English fallback)", () => {
    for (const l of LOCALES) {
      const m = JSON.parse(SRC(`messages/${l}.json`)).companyWorkHistory;
      expect(m.descriptionNotInSource, l).toBeTruthy();
      expect(m.business?.structure, l).toMatch(/\{names\}/);
      expect(typeof m.business?.structureLater, l).toBe("string");
      expect(m.business?.structureForClient, l).toMatch(/\{names\}[\s\S]*\{client\}/);
      expect(m.business?.title, `${l}: business block present`).toBeTruthy();
      if (l !== "en") expect(m.descriptionNotInSource, l).not.toBe("No work description in the source");
    }
  });
});

describe("3. one total, every hour once, one meaning per figure", () => {
  it("a period sum over days already recorded for the same person is listed, not added", () => {
    const records = [
      rec({ id: "d1", activityDate: "2025-03-03", hours: 8 }),
      rec({ id: "d2", activityDate: "2025-03-04", hours: 8 }),
      rec({ id: "pm", activityDate: null, periodStart: "2025-03-01", periodEnd: "2025-03-31", hours: 16 }),
      rec({ id: "pj", activityDate: null, periodStart: "2025-01-01", periodEnd: "2025-01-31", hours: 160 }),
      rec({ id: "o", personId: "p2", activityDate: null, periodStart: "2025-03-01", periodEnd: "2025-03-31", hours: 40 }),
    ];
    expect(hoursCountedOnce(records)).toEqual({ hours: 216, overlapping: { records: 1, hours: 16 } });
    const b = buildBusinessHistory(records, []);
    expect(b.totals.hours).toBe(216);
    expect(b.totals.records).toBe(5);
    expect(b.overlapping).toEqual({ records: 1, hours: 16 });
    expect(b.years.reduce((n, y) => n + y.hours, 0)).toBe(216);
  });

  it("'places' in the overview is the place list's grouping (object, else stated label)", () => {
    const b = buildBusinessHistory(
      [
        rec({ id: "a", placeKey: "l:Vilnius, Žirmūnų 1" }),
        rec({ id: "b", placeKey: "l:Kaunas" }),
        rec({ id: "c", placeKey: "o:obj-1", workObjectId: "obj-1" }),
        rec({ id: "d", placeKey: "none" }),
      ],
      [],
    );
    expect(b.totals.places).toBe(3);
  });

  it("a corrected original never counts beside its correction in the place list", () => {
    const base = {
      personId: "p1",
      personName: "Synthetic",
      workObjectId: "obj-1",
      contextLabel: null,
      activityDate: "2025-03-03",
      periodStart: null,
      periodEnd: null,
      text: "x",
      withdrawn: false,
    };
    const h = buildCompanyWorkHistory(
      [
        { ...base, id: "orig", hours: 8, superseded: true },
        { ...base, id: "fix", hours: 6, superseded: false },
      ] as unknown as EvidenceRecordView[],
      [],
    );
    expect(h.totalRecords).toBe(1);
    expect(h.dayHours).toBe(6);
  });

  it("the page carries one set of totals: no second stat row, no period aside, no record-linked project count", () => {
    expect(HISTORY).not.toMatch(/label=\{t\("stats\.places"\)\}/);
    expect(HISTORY).not.toMatch(/data-testid="company-work-history-period"/);
    expect(HISTORY).not.toMatch(/forClient\.periodHours/);
    expect(OVERVIEW).not.toMatch(/\["projects", /);
  });
});

describe("4. an organization with no period statement shows its own history", () => {
  it("no split header, no 'not placed', no invitation to state a period", () => {
    const b = buildBusinessHistory([rec({ id: "x" })], []);
    expect(businessHistoryHeader(b, { legalName: "Example UAB", displayName: "Example", ownStatementIds: [] }).split).toBe(false);
    expect(OVERVIEW).not.toMatch(/t\("noPeriods"\)/);
    expect(OVERVIEW).toMatch(/business\.periods\.length > 0 \?/);
  });
});

describe("5. one short statement of the structure, never a legal line per card", () => {
  const VIVAT_A = statement({ id: "v1", periodLabel: "Vivat Rex", legalEntityLabel: "Vivat Rex" });
  const VIVAT_B = statement({
    id: "v2",
    periodLabel: "Vivat Rex contract",
    legalEntityLabel: "Vivat Rex",
    basis: "contract",
    periodStart: "2022-01-17",
    periodEnd: "2026-02-22",
  });
  const LATER = statement({
    id: "l1",
    periodLabel: "Later Entity",
    legalEntityLabel: "Later Entity Sp. z o.o.",
    periodStart: "2026-02-23",
    periodEnd: "2026-03-29",
  });

  it("two statements about the same legal entity are one period, its bounds and bases folded", () => {
    const b = buildBusinessHistory(
      [rec({ id: "r1", activityDate: "2024-05-01" }), rec({ id: "r2", activityDate: "2026-03-01" })],
      [VIVAT_A, VIVAT_B, LATER],
    );
    expect(b.periods).toHaveLength(2);
    expect(b.periods[0]).toMatchObject({
      statementIds: ["v1", "v2"],
      bases: ["owner_statement", "contract"],
      statement: { periodStart: "2022-01-17", periodEnd: "2026-02-22" },
      totals: { records: 1 },
    });
    expect(b.periods[1]!.totals.records).toBe(1);
  });

  it("a folded period is never own by one id while another folded statement is earlier (R2 P3-a)", () => {
    const own = statement({ id: "o1", legalEntityLabel: "Vivat Rex", periodStart: "2026-01-01", periodEnd: "2026-12-31" });
    const b = buildBusinessHistory([rec({ id: "r", activityDate: "2024-05-01" })], [VIVAT_B, own]);
    expect(b.periods).toHaveLength(1);
    const h = businessHistoryHeader(b, { legalName: "Holder UAB", displayName: "Holder", ownStatementIds: ["o1"] });
    expect(h.rows[0]!.ownership).toBe("earlier");
    expect(h.split).toBe(true);
    const same = statement({ id: "s1", legalEntityLabel: "Vivat Rex", legalEntityRelation: "same_entity" });
    expect(buildBusinessHistory([], [VIVAT_B, same]).periods).toHaveLength(2);
  });

  it("the subcontractor → client line comes from the records' own client party, only when there is one", () => {
    expect(OVERVIEW).toMatch(/clients\.length === 1 && clients\[0\]!\.name\s*\?\s*t\("structureForClient"/);
    expect(HISTORY).toMatch(/clients=\{load\.clients\}/);
  });

  it("the overview prints the relation once at most, and never per card or per header row", () => {
    expect(OVERVIEW).not.toMatch(/continuityNotSuccession/);
    expect((OVERVIEW.match(/t\(`relation\./g) ?? []).length).toBe(1);
    expect(OVERVIEW).not.toMatch(/business-history-header-not-asserted/);
    expect(OVERVIEW).toMatch(/\.filter\(\(x\) => x !== "not_asserted"\)/);
  });
});
