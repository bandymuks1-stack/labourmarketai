import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import fixture from "@/lib/organization-evidence/__fixtures__/work-history-2025-part3.staged.json";
import {
  resolveRowContexts,
  sessionPlaces,
  type ImportPreview,
  type PreviewRow,
} from "@/lib/organization-evidence/import-core";
import { projectImport } from "@/lib/organization-evidence/import-projections";
import { classifyTimeSemantics, timeSemanticsOpen } from "@/lib/organization-evidence/time-semantics";
import { HistoricalFieldBoard } from "@/components/app/historical-field-board";

/**
 * PRODUCTION REGRESSION 2026-09-16 (build f3e090ef, digests 1624882775 /
 * 1778218967): the history door rendered the global error fallback because
 * the server component handed the CLIENT field board two formatter
 * FUNCTIONS (`formatDate`, `formatHours`). React Server Components cannot
 * serialise a function across the server→client boundary:
 *
 *   Error: Functions cannot be passed directly to Client Components …
 *     {field: ..., formatDate: function m, formatHours: ..., labels: ...}
 *
 * The local render harness used `renderToStaticMarkup`, which never crosses
 * that boundary, and no e2e test walks an authenticated staged session — so
 * CI was green while production was not. This guard reproduces the exact
 * props the page builds for the exact 158-row session shape and asserts
 * they are boundary-safe, and pins the rule statically so no future prop
 * can reintroduce it.
 */

const dir = path.resolve(__dirname, "../..");
/** Line endings normalised: a Windows checkout is CRLF, CI is LF, the anchors are one. */
const read = (p: string) => readFileSync(path.join(dir, p), "utf8").replace(/\r\n/g, "\n");

type Staged = {
  readonly row_index: number;
  readonly person_label: string;
  readonly context_label: string | null;
  readonly activity_date: string;
  readonly hours: number | null;
  readonly activity_text: string;
};

/** The projection of the real (anonymised) 158-row session, built the way
 *  `buildPreview` builds it — every row unmatched against an empty org. */
function projectionOfTheSession() {
  const staged = fixture as readonly Staged[];
  const { canonical, knownAll } = sessionPlaces(staged as unknown as Record<string, unknown>[], []);
  const rows: PreviewRow[] = staged.map((s) => {
    const contexts = resolveRowContexts({
      contextLabel: s.context_label, activityText: s.activity_text, hours: s.hours,
      prior: null, rowChosenObjectId: null, objects: [], knownAll, canonical,
    });
    const ts = classifyTimeSemantics({ hours: s.hours, hasSingleDate: true, workText: s.activity_text, contextLabel: s.context_label });
    const open = timeSemanticsOpen(ts);
    return {
      id: `row-${s.row_index}`, rowIndex: s.row_index, personLabel: s.person_label, personState: "unmatched",
      personId: null, personName: null, personConfidence: null, personCandidates: [],
      contextLabel: s.context_label, contextState: "unmatched", workObjectId: null, workObjectName: null, contextCandidates: [],
      activityDate: s.activity_date, periodStart: null, periodEnd: null, hours: s.hours, activityText: s.activity_text,
      factFields: ["personLabel", "workDate", "hours", "workText"], derived: ts ? { timeSemantics: ts } : {},
      duplicateState: "new", duplicateOfRecordId: null, ready: false, readyWithPlan: !open, contextWillCreate: false,
      contexts, timeSemantics: ts, timeSemanticsOpen: open, problem: open ? "time_semantics_open" : "person_not_on_roster",
    };
  });
  const preview: ImportPreview = {
    sessionId: "47627d4a-5bfe-43ac-aa1b-1d4269760116", organizationId: "o", persisted: false, rows,
    plan: { people: [], objects: [] },
    source: { kind: "xlsx", filename: "work_history_2025_part3.xlsx", supplierRole: "employer", language: "en" },
    counts: { total: rows.length, ready: 0, needsPerson: 0, needsContext: 0, duplicates: 0, conflicts: 0, willCreatePeople: 7, willCreateObjects: 17, weekConflicts: 4, timeSemanticsOpen: 2, siteUnknown: 6, unallocatedMultiPlace: 0, ambiguousPlaces: 0 },
  };
  return projectImport(preview);
}

/** Every path in a value that holds something RSC cannot serialise. */
function unserialisablePaths(value: unknown, at = "props"): string[] {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return [at];
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date || value instanceof Map || value instanceof Set) return [at];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => unserialisablePaths(v, `${at}.${k}`));
}

const lt = JSON.parse(read("messages/lt.json")) as { evidenceImport: { reconstruction: { field: Record<string, string>; weekShort: string } } };
const boardLabels = { ...lt.evidenceImport.reconstruction.field, week: lt.evidenceImport.reconstruction.weekShort } as never;

describe("the historical field board is a Client Component and receives only serialisable props", () => {
  it("the exact 158-row session projection crosses the server→client boundary", () => {
    const projection = projectionOfTheSession();
    expect(projection.people).toHaveLength(7);
    const props = { field: projection.field, locale: "lt", labels: boardLabels };
    expect(unserialisablePaths(props)).toEqual([]);
    // And it renders for that session in every active locale.
    for (const locale of ["lt", "en", "nl", "de", "ru"]) {
      const html = renderToStaticMarkup(createElement(HistoricalFieldBoard, { ...props, locale }));
      expect(html).toContain('data-testid="historical-field-board"');
      expect(html).toContain('data-testid="field-place"');
      expect(html).toContain('data-iso-week="43"');
    }
  });

  it("the props interface carries no function-typed prop, and the page passes none", () => {
    const board = read("components/app/historical-field-board.tsx");
    expect(board.startsWith('"use client";')).toBe(true);
    const propsBlock = board.slice(board.indexOf("export function HistoricalFieldBoard("), board.indexOf("const [week, setWeek]"));
    expect(propsBlock).not.toMatch(/\)\s*=>\s*string/);
    expect(propsBlock).toMatch(/locale: string;/);
    const page = read("components/app/evidence-import-reconstruction.tsx");
    const call = page.slice(page.indexOf("<HistoricalFieldBoard"), page.indexOf("/>", page.indexOf("<HistoricalFieldBoard")));
    expect(call).not.toMatch(/formatDate=|formatHours=|fmtDate|hours=\{hours\}/);
    expect(call).toMatch(/locale=\{locale\}/);
  });

  it("no Client Component rendered by the reconstruction receives a formatter function", () => {
    const page = read("components/app/evidence-import-reconstruction.tsx");
    const clientComponents = ["HistoricalFieldBoard", "EvidenceTimeSemanticsForm", "EvidenceLabelResolveForm"];
    for (const name of clientComponents) {
      let from = 0;
      while ((from = page.indexOf(`<${name}`, from)) !== -1) {
        const call = page.slice(from, page.indexOf("/>", from));
        // Server actions (`actions.*`) are the one function a client component may receive.
        const propNames = [...call.matchAll(/\s([a-zA-Z]+)=\{/g)].map((m) => m[1]);
        for (const p of propNames) expect(p, `${name}.${p}`).not.toMatch(/^(format|fmt)/);
        expect(call).not.toMatch(/=\{(fmtDate|fmtLong|fmtDay|hours)\}/);
        from += name.length;
      }
    }
  });
});
