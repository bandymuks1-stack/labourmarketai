import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));

import { MemoryEvidenceDb } from "@/lib/organization-evidence/testing/memory-store";
import { attestRecord } from "@/lib/organization-evidence/import-core";

import type { CapabilityCaller } from "./contract";
import { EVIDENCE_IMPORT_CAPABILITIES } from "./evidence-import-capabilities";

// SYNTHETIC ids only.
const ORG = "0a000000-0000-4000-8000-000000000001";
const ME = "0c000000-0000-4000-8000-000000000003";
const OTHER = "0c000000-0000-4000-8000-000000000004";
const REC = "0d000000-0000-4000-8000-000000000005";
const REC2 = "0d000000-0000-4000-8000-000000000006";
const SESSION = "0e000000-0000-4000-8000-000000000007";
const PERSON = "0f000000-0000-4000-8000-000000000008";

const actor = (profileId: string) => ({
  profileId,
  memberships: [{ organizationId: ORG, organizationName: "Org A", role: "owner" }],
  activeOrganizationId: ORG,
});

function seed() {
  const db = new MemoryEvidenceDb();
  db.tables.sessions.push({ id: SESSION, organization_id: ORG, supplier_role: "employer" });
  for (const [id, person] of [
    [REC, PERSON],
    [REC2, null],
  ] as const) {
    db.tables.records.push({
      id,
      organization_id: ORG,
      session_id: SESSION,
      supplier_role: "employer",
      evidence_state: "ORGANIZATION_REPORTED",
      organization_person_id: person,
    });
  }
  return db;
}

/** The memory store IS the data plane; it also carries `userId`, so it serves
 *  as the capability caller the same way the real transport's caller does. */
const callerFor = (db: MemoryEvidenceDb, profileId = ME) => db.as(actor(profileId)) as unknown as CapabilityCaller;
const cap = (id: string) => EVIDENCE_IMPORT_CAPABILITIES.find((c) => c.id === id)!;
const tokenOf = (r: { ok: boolean; data?: unknown }) =>
  r.ok ? ((r.data as { confirmationToken?: string }).confirmationToken ?? "") : "";
const codeOf = (r: { ok: boolean; code?: string }) => (r.ok ? "ok" : r.code);

describe("evidence.record.attest is a draft -> confirm pair", () => {
  it("the old direct-write id is gone and the pair is typed draft / confirm", () => {
    expect(EVIDENCE_IMPORT_CAPABILITIES.find((c) => c.id === "evidence.record.attest")).toBeUndefined();
    expect(cap("evidence.record.attest_draft").kind).toBe("draft");
    expect(cap("evidence.record.attest_draft").annotations.readOnlyHint).toBe(true);
    expect(cap("evidence.record.attest_confirm").kind).toBe("confirm");
  });

  it("the draft writes nothing, previews honestly and mints a token", async () => {
    const db = seed();
    const r = await cap("evidence.record.attest_draft").run(callerFor(db), { recordId: REC });
    expect(r.ok).toBe(true);
    expect(db.tables.recordEvents).toHaveLength(0);
    const data = (r as unknown as { data: { preview: { independentlyVerified: boolean; attestingAs: string } } }).data;
    expect(data.preview.independentlyVerified).toBe(false);
    expect(data.preview.attestingAs).toBe("employer");
    expect(tokenOf(r).length).toBeGreaterThan(10);
  });

  it("a wrong role is refused at the draft, before any token exists", async () => {
    const db = seed();
    const r = await cap("evidence.record.attest_draft").run(callerFor(db), { recordId: REC, actorRole: "client" });
    expect(codeOf(r)).toBe("invalid");
  });

  it("confirm appends exactly one attested event, never claims independent verification, and a replay is stale_state", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.record.attest_draft").run(c, { recordId: REC, note: "checked" }));
    const done = await cap("evidence.record.attest_confirm").run(c, {
      recordId: REC,
      note: "checked",
      confirmationToken: token,
    });
    expect(done.ok).toBe(true);
    expect((done as unknown as { data: { independentlyVerified: boolean } }).data.independentlyVerified).toBe(false);
    expect(db.tables.recordEvents.filter((e) => e.event_type === "attested")).toHaveLength(1);

    const replay = await cap("evidence.record.attest_confirm").run(c, {
      recordId: REC,
      note: "checked",
      confirmationToken: token,
    });
    expect(codeOf(replay)).toBe("confirmation_rejected");
    expect((replay as { message: string }).message).toContain("stale_state");
    expect(db.tables.recordEvents.filter((e) => e.event_type === "attested")).toHaveLength(1);
  });

  it("a second draft by the same actor is refused by name (double attest)", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.record.attest_draft").run(c, { recordId: REC }));
    await cap("evidence.record.attest_confirm").run(c, { recordId: REC, confirmationToken: token });
    const again = await cap("evidence.record.attest_draft").run(c, { recordId: REC });
    expect(codeOf(again)).toBe("already_attested");
  });

  it("the core itself refuses a second attested event from the same actor", async () => {
    const db = seed();
    const store = db.as(actor(ME));
    expect(await attestRecord(store, { recordId: REC })).toMatchObject({ kind: "ok" });
    expect(await attestRecord(store, { recordId: REC })).toMatchObject({ kind: "invalid" });
    expect(db.tables.recordEvents.filter((e) => e.event_type === "attested")).toHaveLength(1);
    // a different actor is a different standing - still allowed
    expect(await attestRecord(db.as(actor(OTHER)), { recordId: REC })).toMatchObject({ kind: "ok" });
  });

  it("input_mismatch: the token is bound to the exact drafted input", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.record.attest_draft").run(c, { recordId: REC, note: "a" }));
    const r = await cap("evidence.record.attest_confirm").run(c, { recordId: REC, note: "b", confirmationToken: token });
    expect(codeOf(r)).toBe("confirmation_rejected");
    expect((r as { message: string }).message).toContain("input_mismatch");
    expect(db.tables.recordEvents).toHaveLength(0);
  });

  it("user_mismatch: another user cannot spend the token", async () => {
    const db = seed();
    const token = tokenOf(await cap("evidence.record.attest_draft").run(callerFor(db), { recordId: REC }));
    const r = await cap("evidence.record.attest_confirm").run(callerFor(db, OTHER), {
      recordId: REC,
      confirmationToken: token,
    });
    expect((r as { message: string }).message).toContain("user_mismatch");
    expect(db.tables.recordEvents).toHaveLength(0);
  });

  it("an expired token is refused", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.record.attest_draft").run(c, { recordId: REC }));
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      const r = await cap("evidence.record.attest_confirm").run(c, { recordId: REC, confirmationToken: token });
      expect((r as { message: string }).message).toContain("expired");
    } finally {
      vi.useRealTimers();
    }
    expect(db.tables.recordEvents).toHaveLength(0);
  });

  it("another actor attesting between draft and confirm voids the token", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.record.attest_draft").run(c, { recordId: REC }));
    await attestRecord(db.as(actor(OTHER)), { recordId: REC });
    const r = await cap("evidence.record.attest_confirm").run(c, { recordId: REC, confirmationToken: token });
    expect((r as { message: string }).message).toContain("stale_state");
  });
});

describe("evidence.import.withdraw is a draft -> confirm pair", () => {
  it("the old direct-write id is gone and the pair is typed draft / confirm", () => {
    expect(EVIDENCE_IMPORT_CAPABILITIES.find((c) => c.id === "evidence.import.withdraw")).toBeUndefined();
    expect(cap("evidence.import.withdraw_draft").kind).toBe("draft");
    expect(cap("evidence.import.withdraw_draft").annotations.readOnlyHint).toBe(true);
    expect(cap("evidence.import.withdraw_confirm").kind).toBe("confirm");
  });

  it("the draft previews the records and people affected and writes nothing", async () => {
    const db = seed();
    const r = await cap("evidence.import.withdraw_draft").run(callerFor(db), { sessionId: SESSION });
    expect(r.ok).toBe(true);
    const data = (r as unknown as { data: { preview: { recordsToWithdraw: number; peopleAffected: number } } }).data;
    expect(data.preview).toMatchObject({ recordsToWithdraw: 2, peopleAffected: 1 });
    expect(tokenOf(r).length).toBeGreaterThan(10);
    expect(db.tables.recordEvents).toHaveLength(0);
    expect(db.tables.importEvents).toHaveLength(0);
  });

  it("confirm withdraws every record once; the replay is stale_state and writes nothing more", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.import.withdraw_draft").run(c, { sessionId: SESSION, note: "wrong file" }));
    const done = await cap("evidence.import.withdraw_confirm").run(c, {
      sessionId: SESSION,
      note: "wrong file",
      confirmationToken: token,
    });
    expect(done).toMatchObject({ ok: true, data: { withdrawn: 2, deleted: 0, alreadyWithdrawn: false } });
    expect(db.tables.recordEvents.filter((e) => e.event_type === "withdrawn")).toHaveLength(2);
    expect(db.tables.records).toHaveLength(2);

    const replay = await cap("evidence.import.withdraw_confirm").run(c, {
      sessionId: SESSION,
      note: "wrong file",
      confirmationToken: token,
    });
    expect((replay as { message: string }).message).toContain("stale_state");
    expect(db.tables.recordEvents.filter((e) => e.event_type === "withdrawn")).toHaveLength(2);
  });

  it("with nothing pending the draft says so and issues no token", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.import.withdraw_draft").run(c, { sessionId: SESSION }));
    await cap("evidence.import.withdraw_confirm").run(c, { sessionId: SESSION, confirmationToken: token });
    const again = await cap("evidence.import.withdraw_draft").run(c, { sessionId: SESSION });
    expect(again).toMatchObject({ ok: true, data: { alreadyWithdrawn: true } });
    expect(tokenOf(again)).toBe("");
  });

  it("input_mismatch, user_mismatch and a record that moved since the draft are each refused", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.import.withdraw_draft").run(c, { sessionId: SESSION, note: "a" }));
    const mismatch = await cap("evidence.import.withdraw_confirm").run(c, {
      sessionId: SESSION,
      note: "b",
      confirmationToken: token,
    });
    expect((mismatch as { message: string }).message).toContain("input_mismatch");
    const wrongUser = await cap("evidence.import.withdraw_confirm").run(callerFor(db, OTHER), {
      sessionId: SESSION,
      note: "a",
      confirmationToken: token,
    });
    expect((wrongUser as { message: string }).message).toContain("user_mismatch");

    // one record gets withdrawn outside this flow -> the pending set changed
    db.tables.recordEvents.push({ id: "x1", record_id: REC, event_type: "withdrawn", created_at: db.now() });
    const moved = await cap("evidence.import.withdraw_confirm").run(c, {
      sessionId: SESSION,
      note: "a",
      confirmationToken: token,
    });
    expect((moved as { message: string }).message).toContain("stale_state");
    expect(db.tables.recordEvents).toHaveLength(1);
  });

  it("an expired token is refused", async () => {
    const db = seed();
    const c = callerFor(db);
    const token = tokenOf(await cap("evidence.import.withdraw_draft").run(c, { sessionId: SESSION }));
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      const r = await cap("evidence.import.withdraw_confirm").run(c, { sessionId: SESSION, confirmationToken: token });
      expect((r as { message: string }).message).toContain("expired");
    } finally {
      vi.useRealTimers();
    }
    expect(db.tables.recordEvents).toHaveLength(0);
  });
});
