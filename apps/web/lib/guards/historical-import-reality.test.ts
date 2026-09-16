import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { segmentsOf, resolvePlace, toSegment, allocateHours } from "@/lib/organization-evidence/work-context";

/**
 * HISTORICAL REALITY → LIVING COMPANY MODEL — the contract of the
 * 2026-09-16 slice (owner command §55), pinned so it cannot regress
 * quietly. Behavioural rules are proven in the module tests; this guard
 * pins the STRUCTURAL ones: what is written, what is read, what the
 * first screen is, and what was NOT changed.
 */

const dir = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(dir, p), "utf8");

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
  it("a human choice is a method, carried over re-resolution; an acknowledgement is a method too", () => {
    expect(core).toMatch(/const HUMAN_CHOICE = "human_choice"/);
    expect(core).toMatch(/if \(p\.method === HUMAN_CHOICE\) priorByKey\.set\(p\.key, p\)/);
    expect(core).toMatch(/HOURS_ACKNOWLEDGED_METHOD = "human_acknowledged_as_stated"/);
  });
  it("an alias decision keeps the source spelling on the segment and only changes the canonical name", () => {
    const label = core.slice(core.indexOf("export async function resolveContextLabel"), core.indexOf("export async function acknowledgeRows"));
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
  it("the reconstruction renders projections and forms only", () => {
    expect(reconstruction).not.toMatch(/from\(|\.rpc\(|\.insert\(|\.upsert\(|createClient/);
    expect(reconstruction).toMatch(/nothingWritten/);
  });
  it("label-level and acknowledgement actions write staging rows only", () => {
    const label = core.slice(core.indexOf("export async function resolveContextLabel"), core.indexOf("export async function acknowledgeRows"));
    const ack = core.slice(core.indexOf("export async function acknowledgeRows"), core.indexOf("// ── commit"));
    for (const fn of [label, ack]) {
      expect(fn).toMatch(/from\("evidence_import_rows"\)/);
      expect(fn).not.toMatch(/organization_evidence_records|work_objects|organization_people|\.rpc\(/);
    }
  });
});

describe("an impossible day figure needs a human before it commits — and is never a day's duration", () => {
  it("readiness excludes it; acknowledgement admits it; the figure itself is never rewritten", () => {
    expect(core).toMatch(/const settled = contextState !== "ambiguous" && dup\.state !== "duplicate" && !impossibleHours;/);
    expect(core).toMatch(/!acknowledged;/);
    expect(core).not.toMatch(/hours: Math\.min\(/);
  });
  it("the commit writes the canonical duration as UNKNOWN and keeps the source figure in fact + derived", () => {
    const commit = core.slice(core.indexOf("export async function commitImport"), core.indexOf("// ── the rollback path"));
    expect(commit).toMatch(/hours: impossible \? null : \(r\.hours \?\? null\),/);
    expect(commit).toMatch(/source_fact: r\.source_fact \?\? \{\},/);
    expect(commit).toMatch(/not a day's duration; canonical hours unknown/);
    // And the ledger reader still refuses such a row even if hours were present.
    expect(workerRead).toMatch(/HOURS_EXCEED_DAY_METHOD\) continue;/);
  });
});

describe("the first screen is the reconstruction, not the row sheet", () => {
  it("understood → issues → people → places → calendar → company, in that order, before the plan and the commit", () => {
    const order = ["evidence-understood", "evidence-issues", "evidence-people", "evidence-places", "evidence-calendar", "evidence-company"];
    const at = order.map((id) => reconstruction.indexOf(`data-testid="${id}"`));
    for (let i = 0; i < at.length; i++) expect(at[i], order[i]).toBeGreaterThan(-1);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
    // Render order (the plan block is a const defined earlier and rendered
    // inside the commit card, after the reconstruction).
    const rendered = section.slice(section.indexOf("return shell(\n    <>\n      {actingFor}\n      {/* THE SOURCE"));
    expect(rendered.indexOf("<EvidenceImportReconstruction")).toBeGreaterThan(-1);
    expect(rendered.indexOf("<EvidenceImportReconstruction")).toBeLessThan(rendered.indexOf("{planBlock}"));
    expect(rendered.indexOf("{planBlock}")).toBeLessThan(rendered.indexOf("<EvidenceCommitForm"));
  });
  it("the raw rows are behind progressive disclosure, after the commit control", () => {
    expect(section).toMatch(/<details data-testid="evidence-preview-rows-disclosure">/);
    expect(section.indexOf('data-testid="evidence-preview-rows-disclosure"')).toBeGreaterThan(section.indexOf("<EvidenceCommitForm"));
    // The eight-tile statistic wall is gone.
    expect(section).not.toMatch(/data-testid="evidence-preview-counts"/);
  });
  it("no score, rating, rank or tier of a person exists in the projection or its view", () => {
    for (const src of [projections, reconstruction]) {
      expect(src).not.toMatch(/\b(score|rating|rank|tier|level)\b\s*[:=]/i);
    }
  });
  it("the company view lists what the source does not say", () => {
    expect(projections).toMatch(/unknown: \["client", "project", "work_package", "wage", "output", "team"\]/);
    expect(reconstruction).toMatch(/data-testid="evidence-company-unknown"/);
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
    expect(workerRead).toMatch(/HOURS_EXCEED_DAY_METHOD\) continue;/);
    expect(workerRead).toMatch(/\.not\("activity_date", "is", null\)/);
  });
  it("the read is bounded and degrades honestly", () => {
    expect(workerRead).toMatch(/\.limit\(READ_LIMIT\)/);
    expect(workerRead).toMatch(/return \{ kind: "needs-migration" \}/);
    expect(workerRead).toMatch(/return \{ kind: "error" \}/);
  });
});

describe("what this slice did NOT do", () => {
  it("no migration, no RLS, no authority change", () => {
    const migrations = readdirSync(path.join(dir, "../../supabase/migrations"));
    expect(migrations.some((m) => m.startsWith("202609") && m > "20260916" && /evidence|import|context/.test(m))).toBe(false);
    expect(core).not.toMatch(/security definer|create policy/i);
  });
  it("no brigade is inferred from co-presence", () => {
    expect(projections).not.toMatch(/brigade|team_id|teamId/);
    expect(core).not.toMatch(/team_brigades|brigade_members/);
  });
  it("the historical record is performed work, never a plan or a commitment", () => {
    expect(core).toMatch(/activity_kind: "work"/);
    expect(core).not.toMatch(/bookings|worker_engagements|work_commitments/);
  });
});
