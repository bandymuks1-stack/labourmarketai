import { describe, expect, it } from "vitest";

import {
  deriveEvidenceStanding,
  type RecordLifecycleEvent,
  type ReportedEvidenceState,
} from "./evidence-state";
import { chainHash } from "./fingerprint";
import { correctRecord, correctSessionDateProvenance } from "./import-core";
import { buildCorrection, correctionFingerprint, reconstructedDatePatch } from "./record-correction";
import { committedFactFields } from "./record-fact-fields";
import { MemoryEvidenceDb } from "./testing/memory-store";

/**
 * THE CORRECTION WRITER — INSERT-only, effective-leaf, no double counting.
 * Synthetic data only (the repository is public): Person Alpha, Site One.
 */

const ORG = "0f1e7300-0000-4000-8000-000000000001";
const ACTOR = "0f1e7300-0000-4000-8000-000000000101";
const PERSON = "0f1e7300-0000-4000-8000-000000000301";
const SESSION = "0f1e7300-0000-4000-8000-000000000701";

const PROVENANCE_DERIVED =
  "Derived from ISO year 2025 + source week + source weekday; source did not contain calendar date";
const PROVENANCE_EXPLICIT = "Explicit day label/work text indicates 15 December 2025";

const ACTOR_MEMBERSHIP = {
  profileId: ACTOR,
  memberships: [{ organizationId: ORG, organizationName: "Fixture Timesheets FX", role: "owner" }],
};

function seed(db: MemoryEvidenceDb, over: Record<string, unknown> = {}, provenance = PROVENANCE_DERIVED) {
  const id = db.nextId();
  const row = {
    id,
    organization_id: ORG,
    organization_person_id: PERSON,
    activity_kind: "work",
    outcome_kind: null,
    context_label: "Site One",
    work_object_id: null,
    activity_date: "2025-10-24",
    period_start: null,
    period_end: null,
    hours: 9,
    original_text: "roof tiles",
    original_language: "en",
    evidence_state: "ORGANIZATION_REPORTED",
    supplied_by_organization_id: ORG,
    supplier_role: "employer",
    supplied_by_profile_id: ACTOR,
    imported_by_profile_id: ACTOR,
    imported_at: "2026-09-17T10:00:00.000Z",
    session_id: SESSION,
    import_row_id: null,
    source_kind: "xlsx",
    source_filename: "part.xlsx",
    source_reference: null,
    source_fact: {
      Person: "Person Alpha",
      Date: "45954",
      Hours: "9",
      "Work performed": "roof tiles",
      "Object / recognized objects": "Site One",
      "Date provenance": provenance,
    },
    derived: { calendarWeek: { value: 43, method: "iso_week_of_explicit_date", confidence: 1 } },
    confidence: null,
    record_fingerprint: `fp-${id}-original-record`,
    hash_prev: null,
    hash_self: `hash-${id}`,
    correction_of: null,
    created_at: db.now(),
    ...over,
  };
  db.tables.records.push(row);
  return row;
}

function attest(db: MemoryEvidenceDb, recordId: string, at?: string) {
  db.tables.recordEvents.push({
    id: db.nextId(),
    organization_id: ORG,
    record_id: recordId,
    event_type: "attested",
    actor_role: "employer",
    actor_organization_id: ORG,
    actor_profile_id: ACTOR,
    note: "confirmed and paid",
    replacement_record_id: null,
    created_at: at ?? db.now(),
  });
}

const eventsOf = (db: MemoryEvidenceDb, recordId: string): RecordLifecycleEvent[] =>
  db.tables.recordEvents
    .filter((e) => e.record_id === recordId)
    .map((e) => ({
      eventType: e.event_type as RecordLifecycleEvent["eventType"],
      actorRole: e.actor_role as string | null,
      actorProfileId: e.actor_profile_id as string | null,
      createdAt: e.created_at as string,
    }));
const standingOf = (db: MemoryEvidenceDb, rec: Record<string, unknown>) =>
  deriveEvidenceStanding(rec.evidence_state as ReportedEvidenceState, eventsOf(db, rec.id as string));
/** EFFECTIVE reading of a set of records: only the leaves that are not withdrawn. */
const effective = (db: MemoryEvidenceDb) =>
  db.tables.records.filter((r) => {
    const s = standingOf(db, r);
    return !s.superseded && !s.withdrawn;
  });
const sumHours = (rows: readonly Record<string, unknown>[]) => rows.reduce((a, r) => a + Number(r.hours ?? 0), 0);

const DATE_PATCH = {
  workDate: {
    value: "2025-10-24",
    method: "iso_week_weekday_reconstruction",
    confidence: 0.8,
    note: PROVENANCE_DERIVED,
  },
};

describe("buildCorrection (pure)", () => {
  const original = { ...seed(new MemoryEvidenceDb(), {}) };
  const ctx = { actorProfileId: ACTOR, atIso: "2026-09-30T12:00:00.000Z" };

  it("copies the record whole, merges the derivation, points at the original and chains the hash from it", () => {
    const built = buildCorrection(original, { recordId: original.id as string, reason: "date was reconstructed", derivedPatch: DATE_PATCH }, ctx);
    if (!built.ok) throw new Error(built.problems.join());
    expect(built.row.correction_of).toBe(original.id);
    expect(built.row.original_text).toBe("roof tiles");
    expect(built.row.hours).toBe(9);
    expect(built.row.activity_date).toBe("2025-10-24");
    expect(built.row.source_fact).toEqual(original.source_fact);
    expect(built.row.derived).toEqual({ ...original.derived, ...DATE_PATCH });
    expect(built.row.hash_prev).toBe(original.hash_self);
    expect(built.row.hash_self).toBe(chainHash(original.hash_self as string, built.fingerprint, ctx.atIso));
    expect(built.row.record_fingerprint).toBe(built.fingerprint);
    expect(built.fingerprint).toBe(correctionFingerprint(original.id as string, { derivedPatch: DATE_PATCH }));
    expect(built.changed).toEqual({ derived: ["workDate"], columns: [] });
  });

  it("refuses an empty correction, a no-op and a record left undated", () => {
    expect(buildCorrection(original, { recordId: original.id as string, reason: "nothing" }, ctx).ok).toBe(false);
    expect(
      buildCorrection(original, { recordId: original.id as string, reason: "same again", derivedPatch: { calendarWeek: original.derived.calendarWeek } }, ctx).ok,
    ).toBe(false);
    expect(
      buildCorrection(original, { recordId: original.id as string, reason: "drop the date", overrides: { activityDate: null } }, ctx).ok,
    ).toBe(false);
  });

  it("never changes the person, the work text or the source line — the input has no way to say so", () => {
    const strict = buildCorrection(
      original,
      { recordId: original.id as string, reason: "smuggle", overrides: { originalText: "x" } } as never,
      ctx,
    );
    // the schema is strict; the builder itself only ever copies these columns
    expect(strict.ok).toBe(true);
    if (strict.ok) expect(strict.row.original_text).toBe("roof tiles");
  });
});

describe("reconstructedDatePatch reads the record's OWN source line", () => {
  const rec = (provenance: string, over: Record<string, unknown> = {}) => ({
    activityDate: "2025-10-24",
    sourceFact: { "Date provenance": provenance, Date: "45954" },
    derived: {},
    ...over,
  });
  it("classifies a declared reconstruction, leaves an explicit date a fact, and is idempotent", () => {
    expect(reconstructedDatePatch(rec(PROVENANCE_DERIVED))?.workDate).toMatchObject({ value: "2025-10-24", method: "iso_week_weekday_reconstruction", confidence: 0.8 });
    expect(reconstructedDatePatch(rec(PROVENANCE_EXPLICIT))).toBeNull();
    expect(reconstructedDatePatch(rec(PROVENANCE_DERIVED, { derived: { workDate: { method: "x" } } }))).toBeNull();
    expect(reconstructedDatePatch(rec(PROVENANCE_DERIVED, { activityDate: null }))).toBeNull();
    expect(reconstructedDatePatch({ activityDate: "2025-10-24", sourceFact: { Date: "1" }, derived: {} })).toBeNull();
  });
});

describe("correctRecord — FACT -> DERIVED, insert-only", () => {
  it("writes ONE replacement, leaves the original byte-identical, and appends the corrected event", async () => {
    const db = new MemoryEvidenceDb();
    const a = seed(db);
    const snapshot = JSON.stringify(a);
    const res = await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "date reconstructed from week + weekday", derivedPatch: DATE_PATCH });
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;

    expect(JSON.stringify(db.tables.records.find((r) => r.id === a.id))).toBe(snapshot);
    expect(db.tables.records).toHaveLength(2);
    const b = db.tables.records.find((r) => r.id === res.recordId)!;
    expect(b.correction_of).toBe(a.id);
    expect(b.imported_by_profile_id).toBe(ACTOR);

    const ev = db.tables.recordEvents.filter((e) => e.event_type === "corrected");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ record_id: a.id, replacement_record_id: b.id, actor_profile_id: ACTOR, note: "date reconstructed from week + weekday" });
    expect(ev[0].actor_role).toBeNull();

    // FACT -> DERIVED as the reader sees it
    const factsOf = (r: Record<string, unknown>) =>
      committedFactFields({
        sourceFact: r.source_fact as Record<string, unknown>,
        activityDate: r.activity_date as string | null,
        periodStart: null,
        periodEnd: null,
        hours: r.hours as number,
        text: r.original_text as string,
        contextLabel: r.context_label as string | null,
        derived: r.derived as Record<string, unknown>,
      });
    expect(factsOf(a)).toContain("workDate");
    expect(factsOf(b)).not.toContain("workDate");
    expect(factsOf(b)).toEqual(expect.arrayContaining(["personLabel", "hours", "workText"]));
  });

  it("an effective reading counts the work ONCE (no aggregate double counting)", async () => {
    const db = new MemoryEvidenceDb();
    const a = seed(db);
    seed(db, { activity_date: "2025-10-25", hours: 7, record_fingerprint: "fp-other-day-000000" });
    expect(sumHours(effective(db))).toBe(16);
    await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "reclassify the date", derivedPatch: DATE_PATCH });
    expect(db.tables.records).toHaveLength(3);
    expect(sumHours(effective(db))).toBe(16);
    expect(effective(db)).toHaveLength(2);
  });
});

describe("correctRecord — chains A -> B -> C", () => {
  it("only the current record of a chain can be corrected; the leaf is the only one that counts", async () => {
    const db = new MemoryEvidenceDb();
    const store = db.as(ACTOR_MEMBERSHIP);
    const a = seed(db);
    const ab = await correctRecord(store, { recordId: a.id as string, reason: "first", derivedPatch: DATE_PATCH });
    if (ab.kind !== "ok") throw new Error("A->B");
    const bc = await correctRecord(store, {
      recordId: ab.recordId,
      reason: "second",
      derivedPatch: { calendarWeek: { value: 43, method: "source_week", confidence: 1 } },
    });
    if (bc.kind !== "ok") throw new Error("B->C");

    expect(db.tables.records).toHaveLength(3);
    const c = db.tables.records.find((r) => r.id === bc.recordId)!;
    expect(c.correction_of).toBe(ab.recordId);
    expect(c.hash_prev).toBe(db.tables.records.find((r) => r.id === ab.recordId)!.hash_self);
    expect(effective(db).map((r) => r.id)).toEqual([bc.recordId]);

    // a superseded record cannot be corrected again, and the refusal names the leaf
    const again = await correctRecord(store, { recordId: a.id as string, reason: "branch", derivedPatch: { note: { value: "x", method: "manual", confidence: 1 } } });
    expect(again.kind).toBe("invalid");
    if (again.kind === "invalid") expect(again.problems.join()).toContain(bc.recordId);
    expect(db.tables.records).toHaveLength(3);
  });
});

describe("correctRecord — idempotency", () => {
  it("the same correction twice writes nothing new", async () => {
    const db = new MemoryEvidenceDb();
    const store = db.as(ACTOR_MEMBERSHIP);
    const a = seed(db);
    const first = await correctRecord(store, { recordId: a.id as string, reason: "once", derivedPatch: DATE_PATCH });
    const second = await correctRecord(store, { recordId: a.id as string, reason: "once", derivedPatch: DATE_PATCH });
    expect(first.kind === "ok" && !first.idempotent).toBe(true);
    expect(second.kind === "ok" && second.idempotent).toBe(true);
    if (first.kind === "ok" && second.kind === "ok") expect(second.recordId).toBe(first.recordId);
    expect(db.tables.records).toHaveLength(2);
    expect(db.tables.recordEvents.filter((e) => e.event_type === "corrected")).toHaveLength(1);
  });

  it("completes the audit event when a previous attempt stopped after the record was written", async () => {
    const db = new MemoryEvidenceDb();
    const store = db.as(ACTOR_MEMBERSHIP);
    const a = seed(db);
    const built = buildCorrection(a, { recordId: a.id as string, reason: "crash", derivedPatch: DATE_PATCH }, { actorProfileId: ACTOR, atIso: "2026-09-30T12:00:00.000Z" });
    if (!built.ok) throw new Error("build");
    await store.insertRecords([built.row]);
    expect(db.tables.recordEvents).toHaveLength(0);

    const res = await correctRecord(store, { recordId: a.id as string, reason: "crash", derivedPatch: DATE_PATCH });
    expect(res.kind === "ok" && res.idempotent && res.eventId !== null).toBe(true);
    expect(db.tables.records).toHaveLength(2);
    expect(db.tables.recordEvents.filter((e) => e.event_type === "corrected")).toHaveLength(1);
  });
});

describe("correctRecord — attestation semantics", () => {
  it("without carryAttestation the replacement is honestly unattested; the original keeps its attestation", async () => {
    const db = new MemoryEvidenceDb();
    const a = seed(db);
    attest(db, a.id as string);
    const res = await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "reclassify", derivedPatch: DATE_PATCH });
    if (res.kind !== "ok") throw new Error("correct");
    const b = db.tables.records.find((r) => r.id === res.recordId)!;
    expect(standingOf(db, a).attestation).not.toBeNull();
    expect(standingOf(db, b).attestation).toBeNull();
    expect(res.attestationCarried).toBe(false);
  });

  it("carryAttestation re-attests the replacement as the ACTING organization, with a note naming the source", async () => {
    const db = new MemoryEvidenceDb();
    const a = seed(db);
    attest(db, a.id as string);
    const res = await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "reclassify", derivedPatch: DATE_PATCH, carryAttestation: true });
    if (res.kind !== "ok") throw new Error("correct");
    expect(res.attestationCarried).toBe(true);
    const b = db.tables.records.find((r) => r.id === res.recordId)!;
    const ev = db.tables.recordEvents.find((e) => e.record_id === b.id && e.event_type === "attested")!;
    expect(ev).toMatchObject({ actor_role: "employer", actor_organization_id: ORG, actor_profile_id: ACTOR });
    expect(String(ev.note)).toContain(a.id as string);
    expect(standingOf(db, b).attestation?.role).toBe("employer");
  });

  it("refuses to carry an attestation across changed CONTENT, or when none stands", async () => {
    const db = new MemoryEvidenceDb();
    const store = db.as(ACTOR_MEMBERSHIP);
    const a = seed(db);
    const none = await correctRecord(store, { recordId: a.id as string, reason: "reason", derivedPatch: DATE_PATCH, carryAttestation: true });
    expect(none.kind === "invalid" && none.problems.join()).toContain("no standing attestation");
    attest(db, a.id as string);
    const changed = await correctRecord(store, { recordId: a.id as string, reason: "reason", overrides: { hours: 8 }, carryAttestation: true });
    expect(changed.kind === "invalid" && changed.problems.join()).toContain("content");
    expect(db.tables.records).toHaveLength(1);
  });

  it("a withdrawn attestation is not carried", async () => {
    const db = new MemoryEvidenceDb();
    const a = seed(db);
    attest(db, a.id as string);
    db.tables.recordEvents.push({ id: db.nextId(), organization_id: ORG, record_id: a.id, event_type: "attestation_withdrawn", actor_profile_id: ACTOR, created_at: db.now() });
    const res = await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "reason", derivedPatch: DATE_PATCH, carryAttestation: true });
    expect(res.kind).toBe("invalid");
  });
});

describe("correctRecord — withdrawal semantics", () => {
  it("a withdrawn record is reinstated first, never corrected around", async () => {
    const db = new MemoryEvidenceDb();
    const a = seed(db);
    db.tables.recordEvents.push({ id: db.nextId(), organization_id: ORG, record_id: a.id, event_type: "withdrawn", actor_profile_id: ACTOR, created_at: db.now() });
    const res = await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "reason", derivedPatch: DATE_PATCH });
    expect(res.kind === "invalid" && res.problems.join()).toContain("withdrawn");
    db.tables.recordEvents.push({ id: db.nextId(), organization_id: ORG, record_id: a.id, event_type: "reinstated", actor_profile_id: ACTOR, created_at: db.now() });
    expect((await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "reason", derivedPatch: DATE_PATCH })).kind).toBe("ok");
  });

  it("withdrawing the leaf hides the chain; reinstating it brings the leaf back, never the superseded original", async () => {
    const db = new MemoryEvidenceDb();
    const a = seed(db);
    const res = await correctRecord(db.as(ACTOR_MEMBERSHIP), { recordId: a.id as string, reason: "reason", derivedPatch: DATE_PATCH });
    if (res.kind !== "ok") throw new Error("correct");
    const b = db.tables.records.find((r) => r.id === res.recordId)!;
    db.tables.recordEvents.push({ id: db.nextId(), organization_id: ORG, record_id: b.id, event_type: "withdrawn", actor_profile_id: ACTOR, created_at: db.now() });
    expect(effective(db)).toHaveLength(0);
    db.tables.recordEvents.push({ id: db.nextId(), organization_id: ORG, record_id: b.id, event_type: "reinstated", actor_profile_id: ACTOR, created_at: db.now() });
    expect(effective(db).map((r) => r.id)).toEqual([b.id]);
  });

  it("a correction can never be masked by a dispute: superseded stays true while the state shows the dispute", () => {
    const base: ReportedEvidenceState = "ORGANIZATION_REPORTED";
    const s = deriveEvidenceStanding(base, [
      { eventType: "disputed", createdAt: "2026-09-30T10:00:00Z", actorProfileId: "p" },
      { eventType: "corrected", createdAt: "2026-09-30T11:00:00Z", actorProfileId: "p" },
    ]);
    expect(s.state).toBe("DISPUTED");
    expect(s.superseded).toBe(true);
    expect(deriveEvidenceStanding(base, []).superseded).toBe(false);
  });
});

describe("correctSessionDateProvenance — the session batch", () => {
  function sessionDb() {
    const db = new MemoryEvidenceDb();
    db.tables.sessions.push({
      id: SESSION,
      organization_id: ORG,
      supplied_by_organization_id: ORG,
      source_kind: "xlsx",
      source_language: "en",
      source_filename: "part.xlsx",
      source_reference: null,
      supplier_role: "employer",
    });
    const derivedA = seed(db);
    const derivedB = seed(db, { activity_date: "2025-10-27", record_fingerprint: "fp-b-000000000000" });
    const explicit = seed(db, { activity_date: "2025-12-15", record_fingerprint: "fp-c-000000000000" }, PROVENANCE_EXPLICIT);
    for (const r of [derivedA, derivedB, explicit]) attest(db, r.id as string);
    return { db, derivedA, derivedB, explicit };
  }

  it("a dry run counts and writes nothing; apply corrects only the reconstructed dates; a repeat corrects nothing", async () => {
    const { db, explicit } = sessionDb();
    const store = db.as(ACTOR_MEMBERSHIP);

    const dry = await correctSessionDateProvenance(store, { sessionId: SESSION, reason: "dates were reconstructed" });
    expect(dry).toMatchObject({ kind: "ok", examined: 3, candidates: 2, corrected: 0, applied: false });
    expect(db.tables.records).toHaveLength(3);

    const done = await correctSessionDateProvenance(store, { sessionId: SESSION, reason: "dates were reconstructed", carryAttestation: true, apply: true });
    expect(done).toMatchObject({ kind: "ok", candidates: 2, corrected: 2, failed: [], applied: true });
    expect(db.tables.records).toHaveLength(5);
    expect(db.tables.records.find((r) => r.id === explicit.id)).toBeDefined();
    // the explicit-date record was NOT reclassified
    expect(db.tables.records.filter((r) => r.correction_of === explicit.id)).toHaveLength(0);
    // hours conserved, every replacement carried the attestation
    expect(sumHours(effective(db))).toBe(27);
    const leaves = effective(db).filter((r) => r.correction_of !== null);
    expect(leaves).toHaveLength(2);
    for (const l of leaves) expect(standingOf(db, l).attestation).not.toBeNull();

    const repeat = await correctSessionDateProvenance(store, { sessionId: SESSION, reason: "dates were reconstructed", carryAttestation: true, apply: true });
    expect(repeat).toMatchObject({ kind: "ok", candidates: 0, corrected: 0, alreadyClassified: 2 });
    expect(db.tables.records).toHaveLength(5);
  });
});
