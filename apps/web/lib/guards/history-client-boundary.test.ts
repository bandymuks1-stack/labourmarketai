import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

import fixture from "@/lib/organization-evidence/__fixtures__/work-history-2025-part3.staged.json";
import {
  resolveRowContexts,
  sessionPlaces,
  type ImportPreview,
  type PreviewRow,
} from "@/lib/organization-evidence/import-core";
import { projectImport, type ImportProjection } from "@/lib/organization-evidence/import-projections";
import { classifyTimeSemantics, timeSemanticsOpen } from "@/lib/organization-evidence/time-semantics";

// Minimal next-intl + navigation stubs: the REAL catalogs, no routing infra.
// The locale under render is switched through `renderLocale` below.
vi.mock("next-intl", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");
  const cwd = process.cwd();
  const catalogs: Record<string, Record<string, unknown>> = {};
  const lookup = (ns: string) => (key: string, vars?: Record<string, unknown>) => {
    const locale = (globalThis as { __renderLocale?: string }).__renderLocale ?? "lt";
    catalogs[locale] ??= JSON.parse(fs.readFileSync(path.join(cwd, `messages/${locale}.json`), "utf8"));
    let v: unknown = `${ns}.${key}`.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], catalogs[locale]);
    if (typeof v !== "string") return `${ns}.${key}`;
    if (vars) for (const [k, val] of Object.entries(vars)) v = (v as string).replace(new RegExp(`\\{${k}\\}`, "g"), String(val));
    return v as string;
  };
  return { useTranslations: (ns: string) => lookup(ns), useLocale: () => (globalThis as { __renderLocale?: string }).__renderLocale ?? "lt" };
});
vi.mock("@/lib/i18n/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  Link: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never),
}));

const { HistoricalWorkspace } = await import("@/components/app/historical/historical-workspace");

/**
 * PRODUCTION REGRESSION 2026-09-16 (build f3e090ef, digests 1624882775 /
 * 1778218967): the history door rendered the global error fallback because
 * the server component handed the CLIENT field board two formatter
 * FUNCTIONS (`formatDate`, `formatHours`). React Server Components cannot
 * serialise a function across the server→client boundary:
 *
 *   Error: Functions cannot be passed directly to Client Components …
 *
 * The local render harness used `renderToStaticMarkup`, which never crosses
 * that boundary, and no e2e test walks an authenticated staged session — so
 * CI was green while production was not.
 *
 * Since the visual-first workspace (constitution 2026-09-16) the boundary is
 * ONE component: `HistoricalWorkspace`. The server reconstruction hands it
 * the projection, the staging-only server actions, the section's commit
 * node and scalars — and nothing else. This guard reproduces the exact props
 * the page builds for the exact 158-row session shape, asserts every DATA
 * prop is boundary-safe, renders the workspace in every active locale, and
 * pins the rule statically so no future prop can reintroduce it.
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
export function projectionOfTheSession(): ImportProjection {
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

const ACTIVE = ["lt", "en", "nl", "de", "ru"] as const;

/** The workspace as the page mounts it, under the locale's real messages. */
export function renderWorkspace(projection: ImportProjection, locale: string): string {
  (globalThis as { __renderLocale?: string }).__renderLocale = locale;
  const noop = async () => ({ kind: "idle" as const });
  return renderToStaticMarkup(
    createElement(HistoricalWorkspace, {
      locale,
      sessionId: "47627d4a-5bfe-43ac-aa1b-1d4269760116",
      projection,
      workObjects: [],
      actions: { resolveLabel: noop, resolveTime: noop },
      errors: {},
      commit: createElement("div", { "data-testid": "commit-node" }),
      readyCount: projection.commit.records,
      sourceRowsId: "evidence-source-rows",
    }),
  );
}

describe("the historical workspace is the ONE client boundary and receives only serialisable data", () => {
  it("the exact 158-row session projection crosses the server→client boundary", () => {
    const projection = projectionOfTheSession();
    expect(projection.people).toHaveLength(7);
    expect(projection.company.places).toBe(17);
    // The DATA props. `actions` are server actions (serialisable references)
    // and `commit` is a React node — the two things a client component may
    // legitimately receive besides data.
    const data = { locale: "lt", sessionId: "s", projection, workObjects: [], errors: {}, readyCount: 156, sourceRowsId: "x" };
    expect(unserialisablePaths(data)).toEqual([]);
  });

  it("renders for that session in every active locale, with the modes, the state and the decision bar", () => {
    const projection = projectionOfTheSession();
    for (const locale of ACTIVE) {
      const html = renderWorkspace(projection, locale);
      expect(html, locale).toContain('data-testid="evidence-reconstruction"');
      expect(html, locale).toContain('data-testid="historical-modes"');
      expect(html, locale).toContain('data-testid="evidence-decision-bar"');
      expect(html, locale).toContain('data-testid="historical-overview"');
      // one decision blocks (the 800 / 165 question), so CONFIRM is withheld
      expect(html, locale).toMatch(/<button[^>]*disabled[^>]*data-testid="evidence-confirm-open"/);
      expect(html, locale).not.toMatch(/evidenceImport\.reconstruction\./);
    }
  });

  it("the reconstruction passes no formatter function; the workspace declares no function prop but the actions", () => {
    const page = read("components/app/evidence-import-reconstruction.tsx");
    const call = page.slice(page.indexOf("<HistoricalWorkspace"), page.indexOf("/>", page.indexOf("<HistoricalWorkspace")));
    expect(call).not.toMatch(/formatDate=|formatHours=|fmtDate|hours=\{hours\}/);
    expect(call).toMatch(/locale=\{locale\}/);
    const workspace = read("components/app/historical/historical-workspace.tsx");
    expect(workspace.startsWith('"use client";')).toBe(true);
    const props = workspace.slice(workspace.indexOf("export function HistoricalWorkspace("), workspace.indexOf("const t = useTranslations"));
    const fnProps = [...props.matchAll(/^\s+([a-zA-Z]+):[^;]*=>[^;]*;/gm)].map((m) => m[1]);
    expect(fnProps).toEqual([]);
    expect(props).toMatch(/actions: \{ readonly resolveLabel: Action; readonly resolveTime: Action \};/);
  });
});
