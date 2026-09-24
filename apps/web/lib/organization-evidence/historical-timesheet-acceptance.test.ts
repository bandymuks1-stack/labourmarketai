import { beforeAll, describe, expect, it } from "vitest";

import { EVIDENCE_IMPORT_CAPABILITIES } from "@/lib/capabilities/evidence-import-capabilities";

import {
  ORG,
  ROSTER,
} from "./__fixtures__/historical-timesheet-v3/actors";
import { PR2, TARGET } from "./__fixtures__/historical-timesheet-v3/expected";
import {
  actor,
  runP0,
  seedFixtureDb,
  tableCounts,
  upload,
  type P0Run,
  type UploadOutcome,
} from "./__fixtures__/historical-timesheet-v3/script";
import { S1, S2, bytesOf } from "./__fixtures__/historical-timesheet-v3/sources";
import {
  countsAsIndependentlyVerified,
  deriveEvidenceStanding,
  type RecordLifecycleEvent,
  type ReportedEvidenceState,
} from "./evidence-state";
import { fingerprintBytes } from "./fingerprint";
import {
  attestRecord,
  attestSessionRecords,
  buildCommitRows,
  commitImport,
  computePreview,
  createImportSession,
  defaultSupplierRole,
  reinstateImport,
  stageImportSource,
  submitRows,
  withdrawImport,
} from "./import-core";
import { SESSION_RECORD_PAGE } from "./evidence-store";
import { MemoryEvidenceDb } from "./testing/memory-store";
import { periodFromHumanInput } from "./time-semantics";
import type { SourceWorkRow } from "./source-rows";

/**
 * HISTORICAL TIMESHEET IMPORT — FIXTURE v3, LAYER P (pure, no database).
 *
 * The SHIPPED orchestration (`import-core.ts`) runs the fixture script on
 * the in-memory `EvidenceStore`. What PR-2 delivers is ASSERTED; what a
 * later PR delivers is an `it.todo` naming that PR; and where today's
 * behaviour differs from the target, the difference is PINNED so the PR
 * that fixes it has to change the pin on purpose (spec §5).
 *
 * Spec: docs/design/historical-timesheet-fixture-v3.md; design:
 * docs/design/historical-timesheet-import-v3.md §15 (PR plan).
 */

let run: P0Run;
beforeAll(async () => {
  run = await runP0();
});

const staged = (u: UploadOutcome) => {
  if (u.kind !== "staged") throw new Error(`expected a staged upload, got ${u.kind}`);
  return u.result;
};
const recordsOf = (sessionId: string) => run.db.tables.records.filter((r) => r.session_id === sessionId);
const eventsOf = (db: MemoryEvidenceDb, recordId: string): RecordLifecycleEvent[] =>
  db.tables.recordEvents
    .filter((e) => e.record_id === recordId)
    .map((e) => ({
      eventType: e.event_type as RecordLifecycleEvent["eventType"],
      actorRole: e.actor_role as string,
      actorProfileId: e.actor_profile_id as string,
      createdAt: e.created_at as string,
    }));
const standing = (db: MemoryEvidenceDb, rec: Record<string, unknown>) =>
  deriveEvidenceStanding(
    rec.evidence_state as ReportedEvidenceState,
    eventsOf(db, rec.id as string),
    (db.tables.people.find((p) => p.id === rec.organization_person_id)?.linked_profile_id as string | null) ?? null,
  );

// ── T1 ───────────────────────────────────────────────────────────────────────

describe("T1 same file twice: no duplicates", () => {
  it("[PR-2] upload #1 dies after its first batch; exactly positions 0–9 are staged", () => {
    expect(run.s1.upload1.kind).toBe("failed");
    expect([...run.s1.stagedAfterUpload1].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(run.s1.stagedAfterUpload1).toHaveLength(PR2.T1.upload1Staged);
  });

  it("[PR-2] upload #2 resolves the SAME session and resumes: the missing positions staged, the 10 ignored", () => {
    const u2 = staged(run.s1.upload2);
    expect(u2.session.reused).toBe(true);
    expect(u2.staged).toBe(PR2.T1.upload2Staged);
    expect(u2.alreadyStaged).toBe(PR2.T1.upload2Ignored);
    expect(u2.totalInSession).toBe(PR2.T1.stagedTotal);
  });

  it("[PR-2] upload #3 — the same bytes under another name — reuses the session and stages nothing", () => {
    const u3 = staged(run.s1.upload3);
    expect(u3.session.id).toBe(run.s1.sessionId);
    expect(u3.session.reused).toBe(true);
    expect(u3.staged).toBe(PR2.T1.upload3Staged);
  });

  it("[PR-2] row_index IS the source position: unique, in 0..36, gaps only where no row was made", () => {
    const indexes = run.db.tables.staged
      .filter((s) => s.session_id === run.s1.sessionId)
      .map((s) => s.row_index as number)
      .sort((a, b) => a - b);
    expect(indexes).toHaveLength(PR2.T1.stagedTotal);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(indexes.every((i) => i >= 0 && i <= 36)).toBe(true);
    const missing = Array.from({ length: 37 }, (_, i) => i).filter((i) => !indexes.includes(i));
    expect(missing).toEqual(PR2.T1.notStagedPositions);
    // The undated row (#30) is never staged and never given today's date.
    expect(indexes).not.toContain(29);
  });

  it("[PR-2] the lines no row was made from are recorded on the trail and counted in the preview", () => {
    const u2 = staged(run.s1.upload2);
    expect(u2.notStaged).toBe(PR2.T1.notStagedPositions.length);
    expect(run.s1.committed.preview.source.notStagedSourceRows).toBe(PR2.T1.notStagedPositions.length);
    const trail = run.db.tables.importEvents.filter(
      (e) => e.session_id === run.s1.sessionId && (e.payload as { stage?: string }).stage === "source_rows_not_staged",
    );
    expect(trail.length).toBeGreaterThan(0);
    expect((trail[0].payload as { rows: { position: number }[] }).rows.map((r) => r.position)).toEqual(
      PR2.T1.notStagedPositions,
    );
  });

  it("[PR-2] intake computes sha256(bytes) for the CSV and records it on the session's created event", () => {
    const created = run.db.tables.importEvents.find(
      (e) => e.session_id === run.s1.sessionId && e.event_type === "created",
    );
    expect((created?.payload as { sourceBytesSha256?: string }).sourceBytesSha256).toBe(fingerprintBytes(bytesOf(S1)));
  });

  it("[PR-2] step-8 replays write no session, staged row, record, person, object or attestation", () => {
    expect(tableCounts(run.db)).toEqual(run.beforeReplay);
    expect(run.beforeReplay.sessions).toBe(PR2.T1.sessions);
  });

  it("[PR-2] two DIFFERENT files with the SAME name never join one session", async () => {
    const db = seedFixtureDb();
    const oscar = db.as(actor("O_OSCAR"));
    const a = staged(await upload(oscar, S1, { capabilities: ORG.FX.roles }));
    const altered = { ...S1, text: S1.text.replace("2023-03-06;;8", "2023-03-06;;7") };
    const b = staged(await upload(oscar, altered, { capabilities: ORG.FX.roles }));
    expect(b.session.id).not.toBe(a.session.id);
    expect(b.session.reused).toBe(false);
  });

  it.todo("[PR-5] 26 staged on upload #2 and 36 in total: the week totals parse as periods; only position 29 stays out");
  it.todo("[PR-5] evidence_import_sessions = 5 once S3's month and week periods parse");
  it.todo("[PR-6] org_import_source documents = 4: classified, active, external_ref sha256:<hex>, one text/csv file each");
});

// ── T2 ───────────────────────────────────────────────────────────────────────

describe("T2 records, staging statuses and the chain", () => {
  it("[PR-2] S1 commits every settled row; the ambiguous partial name stays in review", () => {
    expect(recordsOf(run.s1.sessionId)).toHaveLength(PR2.S1.records);
    const s1Rows = run.db.tables.staged.filter((s) => s.session_id === run.s1.sessionId);
    expect(s1Rows.filter((s) => s.status === "needs_review")).toHaveLength(PR2.S1.needsReview);
    expect(recordsOf(run.s2.sessionId)).toHaveLength(PR2.S2.records);
    expect(recordsOf(run.s4.sessionId)).toHaveLength(PR2.S4.records);
    expect(recordsOf(run.s5.sessionId)).toHaveLength(PR2.S5.records);
    expect(run.db.tables.records).toHaveLength(PR2.totalRecords);
  });

  it("[PR-2] every record has a person, a date, its session, its staging row and its source line as written", () => {
    for (const r of run.db.tables.records) {
      expect(r.organization_person_id).toBeTruthy();
      expect(r.activity_date ?? r.period_start).toBeTruthy();
      expect(r.session_id).toBeTruthy();
      expect(r.source_fact).toBeTruthy();
    }
    // Every record from a file names the staging row it came from, and that
    // row sits at the record's source position.
    for (const r of recordsOf(run.s1.sessionId)) {
      const row = run.db.tables.staged.find((s) => s.id === r.import_row_id);
      expect(row?.session_id).toBe(run.s1.sessionId);
    }
  });

  it("[PR-2] every committed staging row's final state was written by the ONE write that set `committed`", () => {
    expect(run.db.committedWriteAttempts).toBe(0);
    const committed = run.db.tables.staged.filter((s) => s.status === "committed");
    expect(committed.length).toBeGreaterThan(0);
    for (const row of committed) {
      const writes = run.db.stagedWrites.filter((w) => w.id === row.id);
      const commits = writes.filter((w) => w.kind === "commit");
      expect(commits).toHaveLength(1);
      expect(writes[writes.length - 1].kind).toBe("commit");
      const record = run.db.tables.records.find((r) => r.import_row_id === row.id);
      expect(record, `record for staging row ${String(row.id)}`).toBeTruthy();
      expect(commits[0].patch.organization_person_id).toBe(record?.organization_person_id);
      expect(commits[0].patch.work_object_id).toBe(record?.work_object_id);
      expect(commits[0].patch.record_fingerprint).toBe(record?.record_fingerprint);
    }
  });

  it.todo("[PR-5] S1 32 / S2 0 / S3 5 / S4 1 / S5 1 = 39 records; project_id on 38 (NULL only on the row-36 record)");
  it.todo("[PR-5] records carry source_row_index and row_origin (parsed_file / agent_rows)");
});

// ── T3 / T4 ──────────────────────────────────────────────────────────────────

describe("T3 customer-ordered work without an order document", () => {
  it.todo("[PR-5] 3 historical projects (PR1, PR3, PR2) and 3 keyed customer rows are created");
  it.todo("[PR-4] project_ordered_work has no order-detail or money column (information_schema count 0; 42703 on order_reference)");
  it.todo("[PR-6] 6 ordered-work steps exist with evidence_basis organization_timesheet");
  it.todo("[PR-7] every step's view model carries ORDER_DETAILS_NOT_ON_RECORD verbatim; views print 'Order details: not on record'");
});

describe("T4 additional ordered work: separate and later", () => {
  it.todo("[PR-6] ST1–ST6 with the §4 kinds, scope keys, first-evidenced windows, precision and review states");
  it.todo("[PR-6] rule traces in detection; S4 and S5 records are continuations; membership as §4");
});

// ── T5 ───────────────────────────────────────────────────────────────────────

describe("T5 supported facts → VERIFIED HISTORICAL WORK", () => {
  it("[PR-2] the owner's attestation of his own day stays SELF_ATTESTED; nothing counts as independently verified", () => {
    const ownerRecord = recordsOf(run.s1.sessionId).find((r) => r.organization_person_id === ROSTER.PO.id);
    expect(ownerRecord).toBeTruthy();
    expect(standing(run.db, ownerRecord as Record<string, unknown>).state).toBe("SELF_ATTESTED");
    for (const r of run.db.tables.records) {
      expect(countsAsIndependentlyVerified(standing(run.db, r).state)).toBe(false);
    }
  });

  it.todo("[PR-6] HISTORICAL_WORK_VERIFIED on 37 records (36 before step 7), basis organization_timesheet, with sourceDocumentSha256 and sourceRowIndex");
  it.todo("[PR-6] facts: row 23 and the S3 October interior record verified WITHOUT hours; row 36 without customer; step membership never a fact");
});

// ── T6 / T7 / T8 ─────────────────────────────────────────────────────────────

describe("T6 totals are never distributed", () => {
  it.todo("[PR-7] PR1 243 h in exact days + 1 day unknown; PR2 444 h in periods; month buckets hold whole windows only");
  it.todo("[PR-5] the W10/W11 total rows contribute 0 h anywhere (subtotals are not records)");
});

describe("T7 address variants → one object", () => {
  it("[pin → PR-5] objects created by the import carry no address, no city and no project today", () => {
    expect(run.db.tables.objects.length).toBeGreaterThan(0);
    for (const o of run.db.tables.objects) {
      expect(o.address_line).toBeNull();
      expect(o.city).toBeNull();
      expect(o.project_id).toBeNull();
    }
  });
  it.todo("[PR-5] O1 / O1b / O2 / O4 with address-split:v1; a different house number is never merged; 4 objects in FX");
});

describe("T8 customers", () => {
  it("[pin → PR-5] no customer, project or party is written by the import today", () => {
    for (const r of run.db.tables.records) {
      expect("project_id" in r).toBe(false);
    }
  });
  it.todo("[PR-5] C1 / C3 / C2 keys; row 35 ambiguous_customer; row 36 customer_not_identified; 38 label-only parties");
});

// ── T9 ───────────────────────────────────────────────────────────────────────

describe("T9 the ambiguous worker is not merged", () => {
  it("[PR-2] 'P. Delta' is ambiguous between PD1 and PD2, is not committed, and creates no roster person", () => {
    const row = run.s1.committed.preview.rows.find((r) => r.rowIndex === 28);
    expect(row?.personLabel).toBe("P. Delta");
    expect(row?.personState).toBe("ambiguous");
    expect(row?.personCandidates.map((c) => c.id).sort()).toEqual([ROSTER.PD1.id, ROSTER.PD2.id].sort());
    expect(row?.readyWithPlan).toBe(false);
    const recordPeople = new Set(recordsOf(run.s1.sessionId).map((r) => r.organization_person_id));
    expect(recordPeople.has(ROSTER.PD1.id)).toBe(false);
    expect(recordPeople.has(ROSTER.PD2.id)).toBe(false);
    expect(run.db.tables.people.some((p) => p.display_name === "P. Delta")).toBe(false);
  });

  it("[PR-2] a partial name with ONE fitting person is still a question in a historical session", () => {
    const staged = [
      {
        id: "0f1e7300-0000-4000-8000-a00000000001",
        row_index: 0,
        person_label: "P. Charlie",
        context_label: null,
        activity_date: "2023-03-08",
        period_start: null,
        period_end: null,
        hours: 8,
        activity_text: "Scaffolding",
        source_fact: { Worker: "P. Charlie" },
        fact_fields: ["personLabel", "workDate", "hours", "workText"],
        derived: {},
        organization_person_id: null,
        work_object_id: null,
        person_state: "unmatched",
        context_state: "absent",
        record_fingerprint: "x".repeat(64),
        status: "pending",
        problem: null,
      },
    ];
    const { preview } = computePreview({
      sessionId: "0f1e7300-0000-4000-8000-a00000000002",
      session: { organizationId: ORG.FX.id, sourceKind: "csv", sourceFilename: "f.csv", supplierRole: "employer", sourceLanguage: "en" },
      staged,
      roster: [{ id: "0f1e7300-0000-4000-8000-a00000000003", displayName: "Person Charlie", normalizedName: "charlie person", externalRef: null }],
      objects: [],
      existing: [],
      notStagedSourceRows: null,
      now: "2026-09-23T12:00:00.000Z",
    });
    expect(preview.rows[0].personState).toBe("ambiguous");
    expect(preview.rows[0].personCandidates).toHaveLength(1);
    expect(preview.rows[0].ready || preview.rows[0].readyWithPlan).toBe(false);
  });

  it("[PR-2] the employee number the source states reaches the person ladder, and travels onto a person the plan creates", () => {
    const alpha = run.s1.committed.preview.rows.filter((r) => r.personLabel === "Person Alpha");
    expect(alpha.length).toBeGreaterThan(0);
    // external_ref outranks the name: confidence 1, not the name's 0.95.
    expect(alpha.every((r) => r.externalRef === "EMP-001" && r.personId === ROSTER.PA.id && r.personConfidence === 1)).toBe(true);
    const bravo = run.s1.committed.preview.plan.people.find((p) => p.label === "Person Bravo");
    expect(bravo?.externalRef).toBe("EMP-002");
    expect(run.s1.committed.preview.plan.people).toHaveLength(PR2.S1.createdPeople);
    expect(run.db.tables.people.find((p) => p.display_name === "Person Bravo")?.external_ref).toBe("EMP-002");
    expect(run.s1.committed.commit.createdPeople).toBe(PR2.S1.createdPeople);
  });

  it.todo("[PR-5] the ambiguous-person question is asked ONCE for the label, grouped, blocking only its rows");
});

// ── T10 ──────────────────────────────────────────────────────────────────────

describe("T10 conflicting, missing and unreadable values", () => {
  it("[PR-2] an unreadable hours cell ('?') is UNKNOWN on the record — never 0", () => {
    const row23 = recordsOf(run.s1.sessionId).find(
      (r) => r.activity_date === "2023-04-06" && r.original_text === "Window sills",
    );
    expect(row23).toBeTruthy();
    expect(row23?.hours).toBeNull();
  });

  it("[PR-2] S2's identical row is a duplicate of the S1 record and is not committed", () => {
    const rows = run.s2.committed.preview.rows;
    expect(rows.find((r) => r.rowIndex === 1)?.duplicateState).toBe("duplicate");
  });

  it("[pin → PR-5] S2's conflicting figure (9 h against 8 h) is flagged — and today still commits as a second record", () => {
    const rows = run.s2.committed.preview.rows;
    expect(rows.find((r) => r.rowIndex === 0)?.duplicateState).toBe("conflict");
    expect(recordsOf(run.s2.sessionId)).toHaveLength(PR2.S2.records);
  });

  it.todo("[PR-5] the conflict blocks its row until `keep_existing` / correct; S2 commits 0 records");
  it.todo("[PR-5] unreadable_source_value / missing_source_value notices; source_subtotal_mismatch on row 32");
});

// ── T11 ──────────────────────────────────────────────────────────────────────

describe("T11 roll back only that batch", () => {
  it("[PR-2] withdraw: one event per live record, THEN the checked session event, each naming the supplying organization", async () => {
    const db = run.db.snapshot();
    const oscar = db.as(actor("O_OSCAR"));
    const before = db.tables.recordEvents.length;
    const res = await withdrawImport(oscar, run.s1.sessionId, "fixture R1");
    expect(res).toMatchObject({ kind: "ok", affected: PR2.S1.records, outcome: "withdrawn" });
    const written = db.tables.recordEvents.slice(before);
    expect(written).toHaveLength(PR2.S1.records);
    expect(written.every((e) => e.event_type === "withdrawn" && e.actor_organization_id === ORG.FX.id)).toBe(true);
    const sessionEvents = db.tables.importEvents.filter(
      (e) => e.session_id === run.s1.sessionId && e.event_type === "rolled_back",
    );
    expect(sessionEvents).toHaveLength(1);
    for (const r of db.tables.records.filter((x) => x.session_id === run.s1.sessionId)) {
      expect(standing(db, r).withdrawn).toBe(true);
    }
    // Other batches are untouched.
    for (const r of db.tables.records.filter((x) => x.session_id !== run.s1.sessionId)) {
      expect(standing(db, r).withdrawn).toBe(false);
    }
  });

  it("[PR-2] a second withdrawal answers `already_withdrawn` and writes NOTHING", async () => {
    const db = run.db.snapshot();
    const oscar = db.as(actor("O_OSCAR"));
    await withdrawImport(oscar, run.s1.sessionId);
    const events = db.tables.recordEvents.length;
    const trail = db.tables.importEvents.length;
    const again = await withdrawImport(oscar, run.s1.sessionId);
    expect(again).toMatchObject({ kind: "ok", affected: 0, outcome: TARGET.T11.R2.outcome });
    expect(db.tables.recordEvents.length).toBe(events);
    expect(db.tables.importEvents.length).toBe(trail);
  });

  it("[PR-2] reinstate restores every record and appends the session event; the attestation stands again", async () => {
    const db = run.db.snapshot();
    const oscar = db.as(actor("O_OSCAR"));
    await withdrawImport(oscar, run.s1.sessionId);
    const res = await reinstateImport(oscar, run.s1.sessionId);
    expect(res).toMatchObject({ kind: "ok", affected: PR2.S1.records, outcome: "reinstated" });
    for (const r of db.tables.records.filter((x) => x.session_id === run.s1.sessionId)) {
      const s = standing(db, r);
      expect(s.withdrawn).toBe(false);
      expect(s.attestation).not.toBeNull();
    }
    const again = await reinstateImport(oscar, run.s1.sessionId);
    expect(again).toMatchObject({ affected: 0, outcome: "already_reinstated" });
  });

  it("[PR-2] a session that committed nothing is withdrawn too: 0 record events + 1 session event (zero-record safe)", async () => {
    const db = seedFixtureDb();
    const oscar = db.as(actor("O_OSCAR"));
    const s2 = staged(await upload(oscar, S2, { capabilities: ORG.FX.roles }));
    const res = await withdrawImport(oscar, s2.session.id);
    expect(res).toMatchObject({ kind: "ok", affected: TARGET.T11.R4.recordEvents, outcome: "withdrawn" });
    expect(db.tables.importEvents.filter((e) => e.event_type === "rolled_back")).toHaveLength(TARGET.T11.R4.sessionEvents);
    const again = await withdrawImport(oscar, s2.session.id);
    expect(again).toMatchObject({ affected: 0, outcome: "already_withdrawn" });
  });

  it("[PR-2] a rollback updates and deletes nothing — every write is an append", async () => {
    const db = run.db.snapshot();
    const oscar = db.as(actor("O_OSCAR"));
    const records = JSON.stringify(db.tables.records);
    const writes = db.stagedWrites.length;
    await withdrawImport(oscar, run.s1.sessionId);
    await reinstateImport(oscar, run.s1.sessionId);
    expect(JSON.stringify(db.tables.records)).toBe(records);
    expect(db.stagedWrites.length).toBe(writes);
  });

  it.todo("[PR-5] R1–R5 on S3 / S2 / S5 with the §4 record, verified and visibility counts");
  it.todo("[PR-7] withdrawn batches hide their projects, customers, steps and objects from history ('from withdrawn batch S')");
});

// ── T12 / T13 / T14 ──────────────────────────────────────────────────────────

describe("T12 every displayed fact traces to its source row", () => {
  it.todo("[PR-6] re-parsing the preserved bytes yields, at source_row_index, each verified record's source_fact");
  it.todo("[PR-7] every rendered fact carries {sessionId, sourceFilename, sourceSha256, sourceRowIndex, cells}");
});

describe("T13 views", () => {
  it.todo("[PR-7] PR1 / PR2 project histories, P-Alpha's own history, the Living CV comparison, the manager's view");
});

describe("T14 authorization contracts (Layer D)", () => {
  // PR-3 delivered the Layer D script as docs/design/historical-timesheet-m1-dryrun.sql:
  // ONE rolled-back DO block that applies M1, discovers real actors by structure,
  // seeds only what production lacks, and runs A1–A17, A19, A21–A26, A30 and
  // +1–+8 per actor with a read-through of every touched table. It runs against
  // production by the LEAD (never by automation); vitest has no database, so
  // the static half is pinned by lib/guards/historical-timesheet-m1-migration.test.ts.
  it.todo("[PR-3 → lead run] the dry run answers DRYRUN_RESULT ok:true, failed:0 against production (A18/A20 arrive with M2, A27–A29 and the source_preserved positive control with M3)");
});

// ── T15 ──────────────────────────────────────────────────────────────────────

describe("T15 supplier role and precision pins", () => {
  it("[PR-2] an organization holding employer + workforce_provider speaks as `employer` (N1)", () => {
    expect(defaultSupplierRole(ORG.FX.roles)).toBe("employer");
    const session = run.db.tables.sessions.find((s) => s.id === run.s1.sessionId);
    expect(session?.supplier_role).toBe("employer");
    for (const r of run.db.tables.records) expect(r.supplier_role).toBe("employer");
  });

  it("[PR-2] an organization that declared nothing speaks as `other`; each other capability keeps its role", () => {
    expect(defaultSupplierRole(ORG.FN.roles)).toBe("other");
    expect(defaultSupplierRole(["workforce_provider"])).toBe("agency");
    expect(defaultSupplierRole(["recruitment_partner"])).toBe("agency");
    expect(defaultSupplierRole(["training_provider"])).toBe("training_provider");
    expect(defaultSupplierRole(["project_operator", "workforce_provider"])).toBe("employer");
  });

  it("[lane E] a start date without an end is refused on a time-semantics decision", () => {
    expect(periodFromHumanInput("2024-05", null).ok).toBe(false);
    expect(periodFromHumanInput("2024-05-01", null).ok).toBe(false);
  });

  it.todo("[PR-5] '2023-W10' → 2023-03-06..2023-03-12 exact; '2024-05' → 2024-05-01..2024-05-31 at month precision");
});

// ── T16 / T17 / T18 ──────────────────────────────────────────────────────────

describe("T16 order independence", () => {
  it.todo("[PR-5] S3 before S1 yields exactly the T2–T13 and T17 end state");
});

describe("T17 historical projects never reach live planning", () => {
  it.todo("[PR-5] every live projection returns PL only; by-id reads render History mode; G-HIST-1 with a planted negative control");
});

describe("T18 preservation re-parse gate", () => {
  it.todo("[PR-6] the S1 re-parse marks all committed S1 records; S5's owner re-upload marks its one committed record");
  it.todo("[PR-6] X1 / X1b fabricated rows get no source_preserved and are listed as source_row_mismatch");
});

// ── PR-2 contracts beyond the numbered targets ──────────────────────────────

describe("PR-2 attestation: in the record's own capacity, never capped", () => {
  it("[PR-2] a role that is not the record's supplier role is refused BY NAME, and nothing is written", async () => {
    const db = run.db.snapshot();
    const oscar = db.as(actor("O_OSCAR"));
    const record = db.tables.records.find((r) => r.session_id === run.s2.sessionId);
    const before = db.tables.recordEvents.length;
    const res = await attestRecord(oscar, { recordId: record?.id as string, actorRole: "client" });
    expect(res.kind).toBe("invalid");
    const sessionRes = await attestSessionRecords(oscar, { sessionId: run.s2.sessionId, actorRole: "agency" });
    expect(sessionRes.kind).toBe("invalid");
    expect(db.tables.recordEvents.length).toBe(before);
  });

  it("[PR-2] an attestation names the supplying organization and the record's own role", () => {
    const attested = run.db.tables.recordEvents.filter((e) => e.event_type === "attested");
    expect(attested).toHaveLength(PR2.attested);
    for (const e of attested) {
      expect(e.actor_organization_id).toBe(ORG.FX.id);
      expect(e.actor_role).toBe("employer");
    }
  });

  it("[PR-2] a session larger than one page is attested in full — the old 1,000-record ceiling is gone", async () => {
    const db = new MemoryEvidenceDb();
    const oscar = db.as(actor("O_OSCAR"));
    const count = 2 * SESSION_RECORD_PAGE + 50;
    const day = (i: number) => new Date(Date.UTC(2022, 0, 1) + (i % 360) * 86_400_000).toISOString().slice(0, 10);
    const rows: SourceWorkRow[] = Array.from({ length: count }, (_, i) => ({
      personLabel: "Person Alpha",
      workDate: day(i),
      hours: 8,
      workText: `Facade work ${Math.floor(i / 360)}`,
      raw: { Worker: "Person Alpha", Date: day(i), Hours: 8, "Work performed": `Facade work ${Math.floor(i / 360)}` },
      factFields: ["personLabel", "workDate", "hours", "workText"],
      derived: {},
    }));
    const stagedRes = await stageImportSource(oscar, {
      session: {
        sourceKind: "csv",
        supplierRole: "employer",
        sourceLanguage: "en",
        sourceFilename: "fixture-large.csv",
        sourceFingerprint: "f".repeat(64),
        actorKind: "human",
      },
      rows,
      positions: rows.map((_, i) => i),
    });
    expect(stagedRes.kind).toBe("ok");
    const sessionId = stagedRes.kind === "ok" ? stagedRes.session.id : "";
    const commit = await commitImport(oscar, sessionId);
    expect(commit).toMatchObject({ kind: "ok", written: count });
    const res = await attestSessionRecords(oscar, { sessionId });
    expect(res).toMatchObject({ kind: "ok", attested: count, skipped: 0 });
    const repeat = await attestSessionRecords(oscar, { sessionId });
    expect(repeat).toMatchObject({ kind: "ok", attested: 0, skipped: count });
  });
});

describe("PR-2 the agent path: explicit fingerprint, explicit start index", () => {
  const byId = new Map(EVIDENCE_IMPORT_CAPABILITIES.map((c) => [c.id, c]));

  it("[PR-2] create_session refuses a call with no fingerprint; submit_rows refuses a batch with no startIndex", () => {
    const create = byId.get("evidence.import.create_session");
    const base = { sourceKind: "agent", supplierRole: "employer", sourceLanguage: "en", sourceFilename: "same-name.csv" };
    expect(create?.inputSchema.safeParse(base).success).toBe(false);
    expect(create?.inputSchema.safeParse({ ...base, sourceFingerprint: "a".repeat(64) }).success).toBe(true);
    const submit = byId.get("evidence.import.submit_rows");
    const row = { personLabel: "Person Alpha", workDate: "2023-06-01", workText: "Facade work", raw: {} };
    const sessionId = "0f1e7300-0000-4000-8000-a00000000009";
    expect(submit?.inputSchema.safeParse({ sessionId, rows: [row] }).success).toBe(false);
    expect(submit?.inputSchema.safeParse({ sessionId, startIndex: 0, rows: [row] }).success).toBe(true);
  });

  it("[PR-2] the same name with two fingerprints is two sessions; the same fingerprint is one", async () => {
    const db = seedFixtureDb();
    const oscar = db.as(actor("O_OSCAR"));
    const open = (fp: string) =>
      createImportSession(oscar, {
        sourceKind: "agent",
        supplierRole: "employer",
        sourceLanguage: "en",
        sourceFilename: "same-name.csv",
        sourceFingerprint: fp,
        actorKind: "agent",
      });
    const a = await open("a".repeat(64));
    const b = await open("b".repeat(64));
    const a2 = await open("a".repeat(64));
    expect(a.kind === "ok" && b.kind === "ok" && a.session.id !== b.session.id).toBe(true);
    expect(a2.kind === "ok" && a.kind === "ok" && a2.session.id === a.session.id && a2.session.reused).toBe(true);
  });

  it("[PR-2] a batch re-submitted at the same startIndex stages nothing twice", async () => {
    const db = run.db.snapshot();
    const oscar = db.as(actor("O_OSCAR"));
    const [row] = db.tables.staged.filter((s) => s.session_id === run.s4.sessionId);
    const again = await submitRows(oscar, run.s4.sessionId, [
      {
        personLabel: row.person_label,
        workDate: row.activity_date,
        hours: 8,
        workText: row.activity_text,
        raw: row.source_fact,
        factFields: row.fact_fields,
      },
    ], { startIndex: 0 });
    expect(again).toMatchObject({ kind: "ok", inserted: 0, skipped: 1, totalInSession: 1 });
  });

  it("[PR-2] a source position is never duplicated within a batch, nor outside the session bound", async () => {
    const db = seedFixtureDb();
    const oscar = db.as(actor("O_OSCAR"));
    const session = await createImportSession(oscar, {
      sourceKind: "agent",
      supplierRole: "employer",
      sourceLanguage: "en",
      sourceFingerprint: "c".repeat(64),
    });
    const id = session.kind === "ok" ? session.session.id : "";
    const row = { personLabel: "Person Alpha", workDate: "2023-06-01", workText: "Facade work", raw: {} };
    expect((await submitRows(oscar, id, [row, row], { rowIndexes: [3, 3] })).kind).toBe("invalid");
    expect((await submitRows(oscar, id, [row], { startIndex: 20_000 })).kind).toBe("too-many-rows");
  });
});

describe("PR-2 the seams are pure and the shell only persists what they decide", () => {
  it("[PR-2] buildCommitRows chains each record to the one before it and returns each row's final state", () => {
    const ready = [0, 1].map((i) => ({
      id: `0f1e7300-0000-4000-8000-b0000000000${i}`,
      organization_person_id: ROSTER.PA.id,
      work_object_id: null,
      context_label: null,
      activity_date: `2023-03-0${6 + i}`,
      period_start: null,
      period_end: null,
      hours: 8,
      activity_text: "Facade work",
      source_fact: { Worker: "Person Alpha" },
      derived: {},
      record_fingerprint: `${i}`.repeat(64),
      person_match_confidence: 1,
    }));
    const input = {
      sessionId: "0f1e7300-0000-4000-8000-b00000000009",
      session: {
        organizationId: ORG.FX.id,
        sourceKind: "csv",
        sourceLanguage: "en",
        sourceFilename: "f.csv",
        sourceReference: null,
        supplierRole: "employer",
      },
      ready,
      importedAt: "2026-09-23T12:00:00.000Z",
      userId: "0f1e7300-0000-4000-8000-b0000000000a",
      evidenceState: "ORGANIZATION_REPORTED" as const,
    };
    const out = buildCommitRows(input);
    expect(out.records).toHaveLength(2);
    expect(out.records[0].hash_prev).toBeNull();
    expect(out.records[1].hash_prev).toBe(out.records[0].hash_self);
    expect(out.finalState.map((f) => f.state.record_fingerprint)).toEqual(ready.map((r) => r.record_fingerprint));
    // Deterministic: the same input builds the same rows.
    expect(JSON.stringify(buildCommitRows(input).records)).toBe(JSON.stringify(out.records));
  });

  it("[pin → PR-3] an external manager can still open an import session in the app layer (M1 P2 refuses it in the database)", async () => {
    const db = seedFixtureDb();
    const eve = db.as(actor("E_EVE"));
    const res = await createImportSession(eve, {
      sourceKind: "csv",
      supplierRole: "employer",
      sourceLanguage: "en",
      sourceFingerprint: "e".repeat(64),
    });
    expect(res.kind).toBe("ok");
  });
});
