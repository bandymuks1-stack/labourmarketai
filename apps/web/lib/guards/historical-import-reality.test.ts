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
    // (segments are walked in order since 2026-09-17 — see the "creates each
    // canonical place ONCE" block below; the plan still reads SEGMENTS.)
    expect(core).toMatch(/for \(const seg of contexts\.segments\) out\.push\(await placeSegment\(seg\)\);/);
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
  it("label-level and time-semantics decisions write staging rows only — through the store port, never a committed row", () => {
    // Re-anchored for the EvidenceStore port (historical timesheet import v3,
    // PR-2): the staging read and write now go through `store.*`, whose
    // `updateStagedRow` refuses a committed row (design §8 P3u). The old
    // inline `.from("evidence_import_rows")` form is asserted ABSENT, so a
    // decision can never again write around the port.
    const label = core.slice(core.indexOf("export async function resolveContextLabel"), core.indexOf("export interface TimeSemanticsDecision"));
    const time = core.slice(core.indexOf("export async function resolveTimeSemantics"), core.indexOf("// ── commit"));
    for (const fn of [label, time]) {
      expect(fn.length).toBeGreaterThan(400);
      expect(fn).toMatch(/store\.listStagedRows\(/);
      expect(fn).toMatch(/excludeStatuses: \["committed"\]/);
      expect(fn).toMatch(/store\.updateStagedRow\(/);
      expect(fn).not.toMatch(/\.from\(|\.rpc\(|insertRecords|insertRecordEvents|createWorkObject|insertRosterPerson|commitStagedRow/);
    }
    const store = read("lib/organization-evidence/evidence-store.ts");
    const upd = store.slice(store.indexOf("async updateStagedRow("), store.indexOf("async commitStagedRow("));
    expect(upd).toMatch(/\.from\("evidence_import_rows"\)[\s\S]{0,120}\.update\(patch\)[\s\S]{0,80}\.neq\("status", "committed"\)/);
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
    // A period needs BOTH bounds (owner rule 2026-09-23) — a start alone is
    // never written as a one-day span.
    expect(commit).toMatch(/const period = ts && ts\.value === "period_aggregate" && ts\.periodStart && ts\.periodEnd \? ts : null;/);
    expect(commit).toMatch(/period_end: period \? period\.periodEnd : /);
    expect(commit).not.toMatch(/periodEnd \?\? period\.periodStart/);
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
  it("only linked people, only live records, only plausible dated hours on the DAY ledger", () => {
    expect(workerRead).toMatch(/\.eq\("linked_worker_id", workerId\)\s*\.eq\("link_state", "linked"\)/);
    expect(workerRead).toMatch(/if \(standing\.withdrawn\) continue;/);
    // 2026-09-20: the `.not("activity_date", "is", null)` filter is GONE on
    // purpose — it dropped every period record before the person's timeline
    // could see it. A period row now travels as `periodRows`; a dated row
    // still reaches the day ledger only when it counts as daily hours.
    expect(workerRead).not.toMatch(/\.not\("activity_date", "is", null\)/);
    expect(workerRead).toMatch(/if \(!countsAsDailyHours\(ts\)\) continue;/);
    expect(workerRead).toMatch(/if \(!workDate\) continue;/);
  });
  it("a period record is a figure BESIDE the day ledger — never a day, never summed (IA §2)", () => {
    expect(workerRead).toMatch(/readonly periodRows: readonly WorkerEvidencePeriodRow\[\];/);
    expect(workerRead).toMatch(/if \(periodStart && periodEnd && ISO_DAY\.test\(periodStart\) && ISO_DAY\.test\(periodEnd\)\) \{\s*\/\/[^\n]*\n\s*periodRows\.push\(/);
    // the reader hands them to the model as their own list, not as day rows
    expect(intelligenceRead).toMatch(/evidence\.periodRows\.map\(\(r\) => \(\{/);
    expect(intelligenceRead).toMatch(/return \{ records: \[\.\.\.fromAllocations, \.\.\.fromEvidence\], periodRecords \};/);
    const model = read("lib/journal/work-intelligence.ts");
    expect(model).toMatch(/readonly organizationPeriodRecords: readonly WorkIntelligenceOrganizationPeriodRecord\[\] \| null;/);
    // no period figure enters a period total or a day map
    expect(model).not.toMatch(/organizationPeriodRecords[\s\S]{0,400}hours \+=/);
    // the journal calendar places DAY records only
    const journalPage = read("app/[locale]/dashboard/journal/page.tsx");
    expect(journalPage).toMatch(/const organizationRecords = organizationLedger\?\.records \?\? null;/);
    expect(journalPage).not.toMatch(/organizationPeriodRecords[^\n]*reportedByDay/);
    // Work in Numbers lists them as lines of their own
    const tile = read("components/app/work-in-numbers/org-ledger.tsx");
    expect(tile).toContain('data-testid="wi-org-records-period"');
    expect(tile).toMatch(/t\("orgRecords\.periodRecord", \{/);
    expect(tile).not.toMatch(/orgPeriod\.hours \+|\+ p\.hours|periodRecords\.reduce/);
  });
  it("the read is bounded and degrades honestly", () => {
    expect(workerRead).toMatch(/\.limit\(READ_LIMIT\)/);
    expect(workerRead).toMatch(/return \{ kind: "needs-migration" \}/);
    expect(workerRead).toMatch(/return \{ kind: "error" \}/);
  });
});

describe("the history door lists the organization's imports (2026-09-20) — a session is reachable without its bookmark", () => {
  const door = read("app/[locale]/dashboard/company/history/page.tsx");
  const list = read("components/app/organization/evidence-import-sessions.tsx");
  it("the door mounts the list beside the import section, and the list links each session back into it", () => {
    expect(door).toMatch(/<EvidenceImportSessions locale=\{locale\} activeSessionId=\{evidenceSession \?\? null\} \/>/);
    expect(list).toMatch(/\/dashboard\/company\/history\?evidenceSession=\$\{s\.id\}#evidence-import-zone/);
    expect(list).toContain('data-testid="company-history-import"');
  });
  it("reads through the one core read, bounded, newest first, with no row contents", () => {
    expect(list).toMatch(/listImportSessions\(\{ supabase, userId: user\.id, locale \}\)/);
    const fn = core.slice(core.indexOf("export async function listImportSessions"), core.indexOf("// ── the subject's side"));
    expect(fn).toMatch(/\.select\("id, source_kind, source_filename, source_reference, created_at"\)/);
    expect(fn).toMatch(/\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(limit\)/);
    expect(fn).not.toMatch(/evidence_import_rows|organization_evidence_records|activity_text|person_label/);
    expect(core).toMatch(/export const IMPORT_SESSIONS_LIST_LIMIT = 20;/);
  });
  it("the status is derived from the append-only trail, never stored on the immutable session", () => {
    expect(fnStatus()).toMatch(/deriveImportSessionStatus\(eventsBySession\.get\(r\.id as string\) \?\? \[\]\)/);
    expect(core).not.toMatch(/from\("evidence_import_sessions"\)\s*\.update\(/);
  });
  it("a failed read is said, an empty list is an honest empty — never a blank door", () => {
    expect(list).toContain('data-testid="company-history-imports-unavailable"');
    expect(list).toContain('data-testid="company-history-imports-empty"');
  });
  function fnStatus() {
    return core.slice(core.indexOf("export async function listImportSessions"), core.indexOf("// ── the subject's side"));
  }
});

describe("the company person page composes imported history (2026-09-20)", () => {
  const page = read("app/[locale]/dashboard/people/[workerId]/page.tsx");
  const section = read("components/app/people/person-imported-history.tsx");
  it("through the ONE evidence read, via the person's LINKED roster row, with the shared primitives", () => {
    expect(page).toMatch(/<PersonImportedHistory workerId=\{worker\.id as string\} locale=\{locale\} \/>/);
    expect(section).toMatch(/\.eq\("linked_worker_id", workerId\)\s*\.eq\("link_state", "linked"\)/);
    expect(section).toMatch(/listEvidenceRecords\(\s*\{ supabase, userId: user\.id, locale \},\s*\{ organizationPersonIds: personIds, limit: READ_LIMIT \},\s*\)/);
    // the standing through the canonical chip, the period through the ONE
    // period renderer every other surface uses (2026-09-23)
    expect(section).toMatch(/import \{\s*EvidenceState,\s*type EvidenceStanding,/);
    expect(section).toMatch(/import \{ PeriodMonthlyShare \} from "@\/components\/app\/period-monthly-share";/);
    expect(section).not.toMatch(/createAdminClient|service_role|security definer/i);
  });
  it("UNKNOWN is said; a period record is read through the ONE period reading, never days", () => {
    expect(section).toContain('data-testid="person-history-unavailable"');
    expect(section).toMatch(/if \(res\.kind !== "ok"\) return unavailable;/);
    expect(section).toMatch(/readPeriodEvidence\(\{/);
    expect(section).toMatch(/<PeriodMonthlyShare[\s\S]{0,200}derived=\{rec\.derived\}/);
    expect(section).not.toMatch(/reportedByDay|workDate/);
  });
  it("an INTERPRETED period says how it came to be, at month precision, and draws no share of its own (owner rule 2026-09-23)", () => {
    // the when is read at the precision it has, with its provenance beside it
    expect(section).toMatch(/const when = recordWhen\(rec, locale\);/);
    expect(section).toContain('data-testid="person-history-period-derived"');
    // negative control: no surface-local split, no day-precise range of a chosen span
    expect(section).not.toMatch(/projectPeriodAggregateByMonth|formatUtcDateRange|\.toFixed\(2\)/);
  });
});

describe("an interpreted period renders no monthly figure — one rule, every renderer (owner rule 2026-09-23)", () => {
  const renderers = {
    "components/app/period-monthly-share.tsx": read("components/app/period-monthly-share.tsx"),
    "components/app/people/person-imported-history.tsx": read("components/app/people/person-imported-history.tsx"),
    "components/app/planning/derived-period-evidence.tsx": read("components/app/planning/derived-period-evidence.tsx"),
    "components/app/historical/historical-calendar.tsx": read("components/app/historical/historical-calendar.tsx"),
    "components/app/evidence-import-section.tsx": section,
    "components/app/organization-evidence-section.tsx": read("components/app/organization-evidence-section.tsx"),
  };
  it("no renderer splits a period itself — the projection is reached ONLY through readPeriodEvidence", () => {
    for (const [file, src] of Object.entries(renderers)) {
      expect(src, file).not.toMatch(/projectPeriodAggregateByMonth/);
    }
    const reading = read("lib/organization-evidence/period-provenance.ts");
    // the one place a projection is made, and only for a SOURCE period
    expect(reading).toMatch(/if \(provenance !== "source"\) \{[\s\S]{0,200}kind: "interpreted_period"/);
    expect(reading).toMatch(/if \(base\.rate\) return \{ \.\.\.base, kind: "source_rate"/);
  });
  it("every surface that shows a period record hands it the record's own derived", () => {
    for (const file of [
      "components/app/people/person-imported-history.tsx",
      "components/app/evidence-import-section.tsx",
      "components/app/organization-evidence-section.tsx",
    ]) {
      expect(renderers[file as keyof typeof renderers], file).toMatch(/derived=\{rec\.derived\}/);
    }
    expect(renderers["components/app/historical/historical-calendar.tsx"]).toMatch(/derived=\{derived\}/);
    // the calendar no longer calls a SET period "not established"
    expect(renderers["components/app/historical/historical-calendar.tsx"]).toMatch(/provenance === "human_choice"\s*\?\s*labels\.periodHuman/);
  });
  it("the decision reads months, refuses a start alone and never stores a one-day period", () => {
    const time = core.slice(core.indexOf("export async function resolveTimeSemantics"), core.indexOf("// ── commit"));
    expect(time).toMatch(/periodFromHumanInput\(d\.periodStart, d\.periodEnd\)/);
    expect(time).not.toMatch(/periodEnd \?\? periodStart/);
    expect(time).toMatch(/conflictsWithSource: conflicts\.length > 0,/);
    const forms = read("components/app/evidence-import-forms.tsx");
    expect(forms).toMatch(/type="month"\s+name="period_start"/);
    expect(forms).toMatch(/type="month"\s+name="period_end"/);
    expect(forms).not.toMatch(/type="date" name="period_(start|end)"/);
  });
  it("the work-model edge carries how the span came to be", () => {
    expect(workerRead).toMatch(/provenance: periodProvenance\(\{ activityDate: null, periodStart, factFields: \[\], derived \}\)/);
    expect(intelligenceRead).toMatch(/provenance: r\.provenance,/);
    const ledger = read("components/app/work-in-numbers/org-ledger.tsx");
    expect(ledger).toMatch(/p\.provenance === "source"/);
    expect(ledger).toContain('"orgRecords.periodRecordHuman"');
  });
});

describe("competency signals reach the SUBJECT as suggestions (2026-09-20) — written AND read", () => {
  const readSignals = read("lib/organization-evidence/competency-signals-read.ts");
  const action = read("lib/organization-evidence/competency-signal-actions.ts");
  const list = read("components/app/organization-history-skill-suggestions.tsx");
  const profile = read("app/[locale]/dashboard/profile/page.tsx");
  it("a bounded subject read over the records the profile already holds", () => {
    expect(readSignals).toMatch(/from\("organization_evidence_competency_signals"\)/);
    expect(readSignals).toMatch(/\.in\("record_id", chunk\)/);
    expect(readSignals).toMatch(/\.limit\(SIGNAL_READ_LIMIT\)/);
    expect(profile).toMatch(/<OrganizationHistorySkillSuggestionsSection\s+records=\{myOrgEvidence\.records\}/);
  });
  it("suggestion only: accepted by the person, self-declared, never verified, membership re-derived", () => {
    expect(action).toMatch(/source: "self_declared",/);
    expect(action).toMatch(/verified: false,/);
    expect(action).not.toMatch(/verified: true|source: "manager_confirmed"|source: "work_journal"/);
    expect(action).toMatch(/signals\.signals\.some\(\(s\) => s\.slug === slug\)/);
    // nothing auto-attaches: the only write is behind the person's tap
    expect(list).toMatch(/onClick=\{\(\) => add\(s\.slug\)\}/);
    expect(readSignals).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
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

describe("the commit plan creates each canonical place ONCE (B1 walk, 2026-09-17)", () => {
  // Production received two "Travers 19" objects 2.5 ms apart: one row's
  // segments `Travers 19; Travers` both resolved to the same canonical name,
  // and `Promise.all` let both pass the `byKey` memo before either wrote it.
  // Segments are now created in order, so the second finds the first's id.
  const block = core.slice(core.indexOf("if (plan.createObjects) {"), core.indexOf("if (!Array.isArray(segments)) return segments;"));
  it("object creation walks a row's segments sequentially, never concurrently", () => {
    expect(block).not.toContain("Promise.all(");
    expect(block).toMatch(/for \(const seg of contexts\.segments\) out\.push\(await placeSegment\(seg\)\);/);
  });
  it("the memo is consulted by canonical key BEFORE any RPC, and written after a creation", () => {
    // The RPC moved behind the EvidenceStore port (PR-2): the plan calls
    // `store.createWorkObject(`, and ONLY the port names the RPC. Both halves
    // are pinned, so neither a second inline RPC nor a port that stops
    // using the ONE object writer can slip in.
    const memoRead = block.indexOf("byKey.get(key)");
    const rpc = block.indexOf("store.createWorkObject(");
    const memoWrite = block.indexOf("byKey.set(key, objectId)");
    expect(memoRead).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(memoRead);
    expect(memoWrite).toBeGreaterThan(rpc);
    expect(core).not.toContain('rpc("create_work_object_v1"');
    const store = read("lib/organization-evidence/evidence-store.ts");
    const writer = store.slice(store.indexOf("async createWorkObject("), store.indexOf("async readRecordKeys("));
    expect(writer).toContain('rpc("create_work_object_v1"');
    // ONE call site in the port (the doc comment may name it; only the RPC call counts).
    expect(store.match(/rpc\("create_work_object_v1"/g)).toHaveLength(1);
  });
});

describe("attesting a whole session is the SAME event, per record, and nothing else (owner correction 2026-09-17)", () => {
  const fn = core.slice(core.indexOf("export async function attestSessionRecords("), core.indexOf("// ── read-back"));
  it("writes only `attested` events into the record lifecycle ledger — no record, hour or state column is touched", () => {
    // Through the EvidenceStore port (PR-2): the one write is
    // `store.insertRecordEvents(`, which the port implements as an INSERT
    // into organization_evidence_events and nothing else — and the port
    // itself declares no update or delete for records or their events, so
    // no orchestration can even ask for one.
    expect(fn).toContain("store.insertRecordEvents(");
    expect(fn).toContain('event_type: "attested"');
    expect(fn).not.toMatch(/\.from\(|insertRecords\(|commitStagedRow|updateStagedRow/);
    expect(fn).not.toMatch(/\.update\(|\.upsert\(|\.delete\(/);
    expect(fn).not.toMatch(/hours|evidence_state:/);
    const store = read("lib/organization-evidence/evidence-store.ts");
    const port = store.slice(store.indexOf("export interface EvidenceStore {"), store.indexOf("export type EvidenceCaller"));
    expect(port).toMatch(/insertRecordEvents\(/);
    expect(port).not.toMatch(/\b(update|delete|remove)Record/);
    const writer = store.slice(store.indexOf("async insertRecordEvents("));
    expect(writer).toMatch(/\.from\("organization_evidence_events"\)\.insert\(rows\)/);
  });
  it("is idempotent and never re-attests or attests a withdrawn record", () => {
    expect(fn).toMatch(/filter\(\(r\) => !r\.withdrawn && r\.attestation === null\)/);
  });
  it("borrows no session event type for it — the attestation events are the audit trail", () => {
    expect(fn).not.toContain("recordEvent(");
  });
  it("relies on the existing INSERT authority (42501 is reported as a refusal), never on a service role", () => {
    expect(fn).toContain('res.error.code === "42501"');
    expect(fn).not.toMatch(/createAdminClient|service_role/);
  });
  it("the session-level form omits record_id and is the per-record form in session mode", () => {
    const forms = read("components/app/evidence-import-forms.tsx");
    expect(forms).toContain('{recordId && <input type="hidden" name="record_id" value={recordId} />}');
    expect(forms).toContain('data-testid={recordId ? "evidence-attest-form" : "evidence-attest-session-form"}');
    const section = read("components/app/evidence-import-section.tsx");
    expect(section).toContain("action={attestSessionRecordsAction}");
    expect(section).toMatch(/records\.some\(\(r\) => !r\.attestation && !r\.withdrawn\)/);
  });
});
