import type { EvidenceStore } from "../../evidence-store";
import { fingerprintPayload } from "../../fingerprint";
import {
  attestSessionRecords,
  buildPreview,
  commitImport,
  createImportSession,
  defaultSupplierRole,
  stageImportSource,
  submitRows,
  type StageSourceResult,
} from "../../import-core";
import { detectHeaderLanguage } from "../../parse-tabular";
import { readEvidenceSourceFile, type SourceFileRead } from "../../read-source-file";
import { MemoryEvidenceDb, type MemoryActor } from "../../testing/memory-store";
import { MEMBERSHIPS, ORG, PROFILE, ROSTER } from "./actors";
import {
  S1,
  S1_COPY_FILENAME,
  S2,
  S3,
  S4_AGENT_ROW,
  S4_FINGERPRINT_PAYLOAD,
  S5,
  bytesOf,
  type FixtureFile,
} from "./sources";

/**
 * FIXTURE v3 §3 — THE SCRIPT, run on the SHIPPED orchestration over the
 * in-memory store. Every step calls the same core functions a transport
 * calls; the only thing this file adds is what a transport adds — reading a
 * file, deriving the session's capacity and language, choosing the actor.
 *
 * PR-2 runs the steps PR-2 can run. The steps that need later PRs (customer
 * and project resolution, week/month periods, ordered-work decisions,
 * preservation) are the acceptance test's `it.todo`s, named with their PR.
 */

export type ActorKey = keyof typeof MEMBERSHIPS;

export function actor(key: ActorKey): MemoryActor {
  return { profileId: PROFILE[key].id, memberships: MEMBERSHIPS[key] };
}

/** A fresh store holding the §1 seed: the FX roster. */
export function seedFixtureDb(): MemoryEvidenceDb {
  const db = new MemoryEvidenceDb();
  for (const p of Object.values(ROSTER)) {
    db.addPerson({ ...p, organization_id: ORG.FX.id });
  }
  return db;
}

export type UploadOutcome =
  | { readonly kind: "staged"; readonly result: StageSourceResult; readonly read: Extract<SourceFileRead, { kind: "ok" }> }
  | { readonly kind: "unreadable"; readonly read: Exclude<SourceFileRead, { kind: "ok" }> }
  | { readonly kind: "failed"; readonly failure: string };

/**
 * One human upload, the way the web intake performs it: the shipped reader,
 * the shipped default capacity, the shipped staging.
 */
export async function upload(
  store: EvidenceStore,
  file: FixtureFile,
  opts: { readonly capabilities: readonly string[]; readonly filename?: string; readonly batchSize?: number },
): Promise<UploadOutcome> {
  const filename = opts.filename ?? file.filename;
  const read = await readEvidenceSourceFile(filename, bytesOf(file));
  if (read.kind !== "ok") return { kind: "unreadable", read };
  const res = await stageImportSource(store, {
    session: {
      sourceKind: "csv",
      supplierRole: defaultSupplierRole(opts.capabilities),
      sourceLanguage: detectHeaderLanguage(read.headers) ?? "en",
      sourceFilename: filename,
      sourceFingerprint: read.fingerprint,
      sourceBytesSha256: read.bytesSha256,
      actorKind: "human",
    },
    rows: read.rows,
    positions: read.positions,
    notStaged: read.notStaged,
    batchSize: opts.batchSize,
  });
  if (res.kind !== "ok") return { kind: "failed", failure: res.kind };
  return { kind: "staged", result: res, read };
}

/** Preview, then commit with the default plan — what the commit form does
 *  once the human confirms. */
export async function previewAndCommit(store: EvidenceStore, sessionId: string) {
  const preview = await buildPreview(store, sessionId);
  if (preview.kind !== "ok") throw new Error(`preview ${preview.kind}`);
  const commit = await commitImport(store, sessionId);
  if (commit.kind !== "ok") throw new Error(`commit ${commit.kind}`);
  return { preview: preview.preview, commit };
}

/** The S4 agent path: explicit fingerprint, explicit start index. */
export async function agentS4(store: EvidenceStore) {
  const session = await createImportSession(store, {
    sourceKind: "agent",
    supplierRole: "employer",
    sourceLanguage: "en",
    sourceFingerprint: fingerprintPayload(S4_FINGERPRINT_PAYLOAD.label, S4_FINGERPRINT_PAYLOAD.payload),
    actorKind: "agent",
    agentLabel: "fixture agent",
  });
  if (session.kind !== "ok") throw new Error(`s4 session ${session.kind}`);
  const submitted = await submitRows(store, session.session.id, [S4_AGENT_ROW], { startIndex: 0 });
  if (submitted.kind !== "ok") throw new Error(`s4 submit ${submitted.kind}`);
  return { sessionId: session.session.id, submitted };
}

/** Row counts of every table the script writes — for "a replay writes nothing". */
export function tableCounts(db: MemoryEvidenceDb) {
  const t = db.tables;
  return {
    sessions: t.sessions.length,
    staged: t.staged.length,
    records: t.records.length,
    people: t.people.length,
    objects: t.objects.length,
    attested: t.recordEvents.filter((e) => e.event_type === "attested").length,
    recordEvents: t.recordEvents.length,
  };
}

export interface P0Run {
  readonly db: MemoryEvidenceDb;
  /** Counts at the end of step 7, before the §3 step 8 replays. */
  readonly beforeReplay: ReturnType<typeof tableCounts>;
  readonly s1: {
    readonly upload1: UploadOutcome;
    /** Staged `row_index`es right after the upload that died. */
    readonly stagedAfterUpload1: readonly number[];
    readonly upload2: UploadOutcome;
    readonly upload3: UploadOutcome;
    readonly sessionId: string;
    readonly committed: Awaited<ReturnType<typeof previewAndCommit>>;
  };
  readonly s2: { readonly sessionId: string; readonly committed: Awaited<ReturnType<typeof previewAndCommit>> };
  readonly s3: UploadOutcome;
  readonly s4: { readonly sessionId: string };
  readonly s5: { readonly sessionId: string; readonly ownerReupload: UploadOutcome };
}

function sessionOf(u: UploadOutcome): string {
  if (u.kind !== "staged") throw new Error(`upload not staged: ${u.kind}`);
  return u.result.session.id;
}

/** §3 steps 1–8, as far as PR-2 reaches. */
export async function runP0(): Promise<P0Run> {
  const db = seedFixtureDb();
  const oscar = db.as(actor("O_OSCAR"));
  const mike = db.as(actor("M_MIKE"));
  const fx = ORG.FX.roles;

  // 1. S1 upload #1 dies after its first batch (`MAX_ROWS_PER_SUBMIT` = 10 in
  //    the test); #2 resumes; #3 is the same bytes under another name.
  db.failStagedInsertOnCall = 2;
  const upload1 = await upload(oscar, S1, { capabilities: fx, batchSize: 10 });
  db.failStagedInsertOnCall = null;
  const stagedAfterUpload1 = db.tables.staged.map((s) => s.row_index as number);
  const upload2 = await upload(oscar, S1, { capabilities: fx, batchSize: 10 });
  const upload3 = await upload(oscar, S1, { capabilities: fx, batchSize: 10, filename: S1_COPY_FILENAME });
  const s1 = sessionOf(upload2);

  // 2. Preview, commit with the plan, attest as the session's capacity.
  const s1Committed = await previewAndCommit(oscar, s1);
  const s1Attest = await attestSessionRecords(oscar, { sessionId: s1 });
  if (s1Attest.kind !== "ok") throw new Error(`s1 attest ${s1Attest.kind}`);

  // 3. S2, a second independent file.
  const s2 = sessionOf(await upload(oscar, S2, { capabilities: fx }));
  const s2Committed = await previewAndCommit(oscar, s2);

  // 4. S3 — periods only; no date column yet (PR-5 parses weeks and months).
  const s3 = await upload(oscar, S3, { capabilities: fx });

  // 5. S4 via the agent path, committed and attested.
  const s4 = await agentS4(oscar);
  await previewAndCommit(oscar, s4.sessionId);
  const s4Attest = await attestSessionRecords(oscar, { sessionId: s4.sessionId });
  if (s4Attest.kind !== "ok") throw new Error(`s4 attest ${s4Attest.kind}`);

  // 6. M-Mike's own upload, committed and attested as `employer`.
  const s5 = sessionOf(await upload(mike, S5, { capabilities: fx }));
  await previewAndCommit(mike, s5);
  const s5Attest = await attestSessionRecords(mike, { sessionId: s5, actorRole: "employer" });
  if (s5Attest.kind !== "ok") throw new Error(`s5 attest ${s5Attest.kind}`);

  // 7. O-Oscar uploads S5's identical bytes: the session is reused.
  const ownerReupload = await upload(oscar, S5, { capabilities: fx });

  // 8. Replays (T1): S1 again, and a second commit of S1.
  const beforeReplay = tableCounts(db);
  await upload(oscar, S1, { capabilities: fx, batchSize: 10 });
  await previewAndCommit(oscar, s1);
  await attestSessionRecords(oscar, { sessionId: s1 });

  return {
    db,
    beforeReplay,
    s1: { upload1, stagedAfterUpload1, upload2, upload3, sessionId: s1, committed: s1Committed },
    s2: { sessionId: s2, committed: s2Committed },
    s3,
    s4: { sessionId: s4.sessionId },
    s5: { sessionId: s5, ownerReupload },
  };
}
