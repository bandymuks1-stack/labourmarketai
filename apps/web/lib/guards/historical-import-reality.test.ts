import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { segmentsOf, resolvePlace, toSegment, allocateHours } from "@/lib/organization-evidence/work-context";
import { classifyTimeSemantics, countsAsDailyHours } from "@/lib/organization-evidence/time-semantics";

/**
 * HISTORICAL REALITY → LIVING COMPANY MODEL — the contract of the
 * 2026-09-16 slices (#1748 and the post-#1748 correction), pinned so it
 * cannot regress quietly. Behavioural rules are proven in the module tests;
 * this guard pins the STRUCTURAL ones: what is written, what is read, what
 * the first screen is, and what was NOT changed.
 */

const dir = path.resolve(__dirname, "../..");
/** Line endings normalised: a Windows checkout is CRLF, CI is LF, the anchors are one. */
const read = (p: string) => readFileSync(path.join(dir, p), "utf8").replace(/\r\n/g, "\n");

const core = read("lib/organization-evidence/import-core.ts");
const section = read("components/app/evidence-import-section.tsx");
const reconstruction = read("components/app/evidence-import-reconstruction.tsx");
const projections = read("lib/organization-evidence/import-projections.ts");
const workerRead = read("lib/organization-evidence/worker-evidence-read.ts");
const intelligenceRead = read("lib/journal/work-intelligence-read.ts");

describe("a multi-site source never becomes a composite object", () => {
  it("the cell is split before anything is matched or created", () => {
    expect(segmentsOf("Hoofdgracht 3; Kantoor").map((s) => s.label)).toEqual(["Hoofdgracht 3", "Kantoor"]);
    // The plan and the commit read canonical SEGMENTS, never the cell.
    expect(core).toMatch(/for \(const seg of placeSegments\(r\.contexts\)\) \{\s*if \(seg\.state !== "new" \|\| !seg\.name\) continue;/);
    expect(core).toMatch(/contexts\.segments\.map\(async \(seg\): Promise<WorkContextSegment>/);
    expect(core).not.toMatch(/p_name: tidy\(label\)/);
  });
  it("an activity or a note is never resolved to a place", () => {
    expect(resolvePlace(toSegment("Administraciniai/koordinavimo darbai"), [{ id: "x", name: "Administraciniai/koordinavimo darbai" }]).kind).toBe("new");
    expect(toSegment("2 uur - garantie").kind).toBe("note");
  });
});

describe("source stays immutable; derived stays distinguishable", () => {
  it("the staged reading lives under derived.workContexts with a method, and the source cell is written verbatim", () => {
    expect(core).toMatch(/nextDerived\.workContexts = contexts/);
    expect(core).toMatch(/context_label: \(r\.context_label as string \| null\) \?\? null/);
    expect(core).not.toMatch(/context_label: null,/);
  });
  it("a human choice is a method, carried over re-resolution — for places and for time semantics alike", () => {
    expect(core).toMatch(/const HUMAN_CHOICE = "human_choice"/);
    expect(core).toMatch(/if \(p\.method === HUMAN_CHOICE\) priorByKey\.set\(p\.key, p\)/);
    expect(core).toMatch(/readTimeSemantics\(priorDerived\) \?\?\s*classifyTimeSemantics\(/);
  });
  it("an alias decision keeps the source spelling on the segment and only changes the canonical name", () => {
    const label = core.slice(core.indexOf("export async function resolveContextLabel"), core.indexOf("export interface TimeSemanticsDecision"));
    expect(label).toMatch(/if \(d\.kind === "alias"\) \{\s*return \{ \.\.\.seg, state: "new", workObjectId: null, name: d\.name,/);
  });
  it("a total is never divided by guess", () => {
    expect(allocateHours("A werk. B werk.", [{ name: "A", spellings: [] }, { name: "B", spellings: [] }], 9)).toEqual({
      method: "unknown_split",
      hours: [null, null],
      consistent: null,
    });
    expect(projections).not.toMatch(/hours\s*\/\s*places/);
  });
});

describe("no permanent write before commit; projections are read-only", () => {
  it("the projections module has no client, no rpc, no insert", () => {
    expect(projections).not.toMatch(/from\(|\.rpc\(|\.insert\(|\.upsert\(|\.update\(|createClient/);
  });
  it("the reconstruction renders projections and forms only, and says nothing is written", () => {
    const workspace = read("components/app/historical/historical-workspace.tsx");
    for (const src of [reconstruction, workspace]) expect(src).not.toMatch(/from\(|\.rpc\(|\.insert\(|\.upsert\(|createClient/);
    expect(workspace).toMatch(/nothingWrittenShort/);
  });
  it("label-level and time-semantics decisions write staging rows only", () => {
    const label = core.slice(core.indexOf("export async function resolveContextLabel"), core.indexOf("export interface TimeSemanticsDecision"));
    const time = core.slice(core.indexOf("export async function resolveTimeSemantics"), core.indexOf("// ── commit"));
    for (const fn of [label, time]) {
      expect(fn).toMatch(/from\("evidence_import_rows"\)/);
      expect(fn).not.toMatch(/organization_evidence_records|work_objects|organization_people|\.rpc\(/);
    }
  });
});

describe("a figure a day cannot hold is a QUESTION about meaning, never a day's duration", () => {
  it("readiness holds the row until a human classifies it; the figure itself is never rewritten", () => {
    expect(core).toMatch(/const settled = contextState !== "ambiguous" && dup\.state !== "duplicate" && !timeOpen;/);
    expect(core).toMatch(/"time_semantics_open"/);
    expect(core).not.toMatch(/hours: Math\.min\(/);
    expect(core).not.toMatch(/human_acknowledged_as_stated/);
  });
  it("the classification comes from words, never from the numbers", () => {
    // The doc comment NAMES the two figures to forbid them; the code never carries them.
    const semanticsCode = read("lib/organization-evidence/time-semantics.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(semanticsCode).not.toMatch(/\b(800|165)\b/);
    expect(classifyTimeSemantics({ hours: 800, hasSingleDate: true, workText: "werk", contextLabel: null })?.value).toBe("unknown");
    expect(classifyTimeSemantics({ hours: 800, hasSingleDate: true, workText: "16 month", contextLabel: null })?.value).toBe("period_aggregate");
    expect(classifyTimeSemantics({ hours: 800, hasSingleDate: true, workText: "16 month", contextLabel: null })?.periodStart).toBeNull();
  });
  it("the commit writes a period aggregate as a period record when the period is known, else as a dated fact with UNKNOWN duration; the source figure stays in fact + derived", () => {
    const commit = core.slice(core.indexOf("export async function commitImport"), core.indexOf("// ── the rollback path"));
    expect(commit).toMatch(/const period = ts && ts\.value === "period_aggregate" && ts\.periodStart \? ts : null;/);
    expect(commit).toMatch(/activity_date: period \? null : /);
    expect(commit).toMatch(/period_start: period \? period\.periodStart : /);
    expect(commit).toMatch(/hours: period \? period\.sourceHours : daily && !legacyExceeds \? \(r\.hours \?\? null\) : null,/);
    expect(commit).toMatch(/source_fact: r\.source_fact \?\? \{\},/);
    expect(commit).toMatch(/derived,/);
  });
  it("the ledger reader lets only DAILY hours through", () => {
    expect(workerRead).toMatch(/if \(!countsAsDailyHours\(ts\)\) continue;/);
    expect(workerRead).toMatch(/HOURS_EXCEED_DAY_METHOD\) continue;/);
    expect(countsAsDailyHours({ value: "period_aggregate", method: "human_choice", confidence: 1, sourceHours: 800, remote: true, periodStart: null, periodEnd: null })).toBe(false);
  });
});

describe("the first screen is the reconstruction workspace, not the row sheet", () => {
  it("the section renders the workspace, hands it the commit control, and keeps the raw rows behind disclosure after it", () => {
    const rendered = section.slice(section.indexOf("const commitNode = ("));
    expect(rendered.indexOf("{planBlock}")).toBeLessThan(rendered.indexOf("<EvidenceCommitForm"));
    expect(rendered.indexOf("<EvidenceImportReconstruction")).toBeGreaterThan(-1);
    expect(rendered).toMatch(/commit=\{commitNode\}/);
    expect(rendered.indexOf("<EvidenceImportReconstruction")).toBeLessThan(rendered.indexOf('data-testid="evidence-preview-rows-disclosure"'));
    expect(reconstruction).toMatch(/<HistoricalWorkspace/);
    // the rejected document: eight stacked sections in a fixed order
    for (const id of ["evidence-people", "evidence-places", "evidence-calendar", "evidence-company", "evidence-impact"]) {
      expect(reconstruction, id).not.toContain(`data-testid="${id}"`);
    }
  });
  it("the raw rows are behind progressive disclosure, reachable from the workspace's SOURCE control", () => {
    expect(section).toMatch(/<details data-testid="evidence-preview-rows-disclosure" id="evidence-source-rows"/);
    expect(section).not.toMatch(/data-testid="evidence-preview-counts"/);
    expect(read("components/app/historical/historical-workspace.tsx")).toMatch(/data-testid="evidence-source-link"/);
  });
  it("no score, rating, rank or tier of a person exists in the projection or its views", () => {
    for (const f of ["components/app/historical-player-card.tsx", "components/app/historical-field-board.tsx", "components/app/historical/historical-workspace.tsx", "components/app/historical/historical-overview.tsx", "components/app/historical/historical-calendar.tsx", "components/app/historical/historical-objects.tsx", "components/app/historical/historical-attention.tsx", "lib/organization-evidence/import-visual.ts"]) {
      expect(read(f), f).not.toMatch(/\b(score|rating|rank|tier|level)\b\s*[:=]/i);
    }
    expect(projections).not.toMatch(/\b(score|rating|rank|tier|level)\b\s*[:=]/i);
  });
  it("the company view lists what the source does not say — as UNKNOWN tokens", () => {
    expect(projections).toMatch(/"client", "project", "work_package", "wage", "output", "team",/);
    expect(read("components/app/historical/historical-overview.tsx")).toMatch(/data-testid="evidence-company-unknown"/);
  });
});

describe("evidence reaches the ONE work model — through the linked roster row only", () => {
  it("the reader is composed into readOrganizationRecords, never a second model", () => {
    expect(intelligenceRead).toMatch(/readEvidenceRecordsForWorker\(supabase, workerId\)/);
    expect(existsSync(path.join(dir, "lib/journal/work-intelligence-evidence.ts"))).toBe(false);
  });
  it("only linked people, only live records, only plausible dated hours", () => {
    expect(workerRead).toMatch(/\.eq\("linked_worker_id", workerId\)\s*\.eq\("link_state", "linked"\)/);
    expect(workerRead).toMatch(/if \(standing\.withdrawn\) continue;/);
    expect(workerRead).toMatch(/\.not\("activity_date", "is", null\)/);
  });
  it("the read is bounded and degrades honestly", () => {
    expect(workerRead).toMatch(/\.limit\(READ_LIMIT\)/);
    expect(workerRead).toMatch(/return \{ kind: "needs-migration" \}/);
    expect(workerRead).toMatch(/return \{ kind: "error" \}/);
  });
});

describe("what these slices did NOT do", () => {
  it("no migration, no RLS, no authority change", () => {
    const migrations = readdirSync(path.join(dir, "../../supabase/migrations"));
    expect(migrations.some((m) => m.startsWith("202609") && m > "20260916" && /evidence|import|context|player|team|history/.test(m))).toBe(false);
    expect(core).not.toMatch(/security definer|create policy/i);
  });
  it("no brigade is inferred from co-presence", () => {
    expect(projections).not.toMatch(/brigade_members|team_brigades|teamId/);
    expect(core).not.toMatch(/team_brigades|brigade_members/);
  });
  it("the historical record is performed work, never a plan or a commitment", () => {
    expect(core).toMatch(/activity_kind: "work"/);
    expect(core).not.toMatch(/bookings|worker_engagements|work_commitments/);
  });
});
