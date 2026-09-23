import {
  hasOrganizationCapability,
  isGovernanceRole,
} from "@/lib/company/role-capabilities";

import type {
  EvidenceStore,
  SessionRecordWithEvents,
  StagedColumn,
  StagedRowFilter,
  StoreError,
  StoreResult,
  StoreRow,
} from "../evidence-store";
import type { EvidenceOrgContext } from "../evidence-org-context";

/**
 * THE IN-MEMORY EVIDENCE STORE — TEST-ONLY (historical timesheet import
 * design v3, PR-2; fixture v3 Layer P).
 *
 * The SHIPPED orchestration in `import-core.ts` runs on this adapter exactly
 * as it runs on `supabaseEvidenceStore`: no database, no Docker, no mock of
 * any function the orchestration calls. It is a small model of the tables,
 * and it keeps the guarantees the orchestration relies on:
 *
 *   · every unique key the schema declares, with ON CONFLICT ignore where
 *     the production write ignores it;
 *   · no UPDATE and no DELETE on records or record events — the port has no
 *     such method, so no code path can even ask;
 *   · a COMMITTED staging row is immutable (design §8 P3u): every attempt to
 *     write one is refused AND counted in `committedWriteAttempts`, so a
 *     test can prove the orchestration never tries;
 *   · a monotonic clock, so latest-wins derivations never tie.
 *
 * A guard (`lib/guards/evidence-store-port.test.ts`) keeps this module out
 * of every production import.
 */

export interface MemoryMembership {
  readonly organizationId: string;
  readonly organizationName: string;
  /** The membership relationship (`owner`, `manager`, `external_manager`…). */
  readonly role: string;
}

export interface MemoryActor {
  readonly profileId: string;
  readonly memberships: readonly MemoryMembership[];
  /** The active workspace pointer; absent = no pointer. */
  readonly activeOrganizationId?: string | null;
}

interface Tables {
  sessions: StoreRow[];
  importEvents: StoreRow[];
  staged: StoreRow[];
  people: StoreRow[];
  objects: StoreRow[];
  records: StoreRow[];
  recordEvents: StoreRow[];
  signals: StoreRow[];
}

/** One recorded write to a staging row — for proving WHICH write committed it. */
export interface StagedWrite {
  readonly id: string;
  readonly kind: "update" | "commit";
  readonly patch: StoreRow;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function ok<T>(data: T): StoreResult<T> {
  return { data, error: null };
}
function err<T>(error: StoreError): StoreResult<T> {
  return { data: null, error };
}

export class MemoryEvidenceDb {
  tables: Tables = {
    sessions: [],
    importEvents: [],
    staged: [],
    people: [],
    objects: [],
    records: [],
    recordEvents: [],
    signals: [],
  };
  /** Writes the design forbids that the orchestration nevertheless tried. */
  committedWriteAttempts = 0;
  /** Every staging write, in order. */
  stagedWrites: StagedWrite[] = [];
  /** Fault injection: the Nth `insertStagedRows` call (1-based) fails. */
  failStagedInsertOnCall: number | null = null;
  private stagedInsertCalls = 0;
  private tick = 0;
  private seq = 0;

  constructor(private readonly idPrefix = "0f1e7300-0000-4000-8000-9") {}

  /** A fresh RFC-4122 v4-shaped id in this store's range. */
  nextId(): string {
    this.seq += 1;
    return `${this.idPrefix}${this.seq.toString(16).padStart(11, "0")}`;
  }

  /** Monotonic ISO timestamps: no two writes share one. */
  now(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 8, 23, 12, 0, 0) + this.tick).toISOString();
  }

  /** A deep copy of the whole state — for cases that must start from one end state. */
  snapshot(): MemoryEvidenceDb {
    const copy = new MemoryEvidenceDb(this.idPrefix);
    copy.tables = clone(this.tables);
    copy.tick = this.tick;
    copy.seq = this.seq;
    return copy;
  }

  addPerson(row: {
    readonly id?: string;
    readonly organization_id: string;
    readonly display_name: string;
    readonly normalized_name: string;
    readonly external_ref?: string | null;
    readonly linked_profile_id?: string | null;
  }): string {
    const id = row.id ?? this.nextId();
    this.tables.people.push({
      external_ref: null,
      linked_profile_id: null,
      link_state: row.linked_profile_id ? "linked" : "unlinked",
      ...row,
      id,
    });
    return id;
  }

  /** The store as one authenticated human sees it. */
  as(actor: MemoryActor): EvidenceStore {
    return memoryStore(this, actor);
  }

  // ── internals shared with the store ──────────────────────────────────────

  countStagedInsert(): boolean {
    this.stagedInsertCalls += 1;
    return this.failStagedInsertOnCall !== null && this.stagedInsertCalls === this.failStagedInsertOnCall;
  }
}

function matches(row: StoreRow, filter?: StagedRowFilter): boolean {
  if (filter?.status && row.status !== filter.status) return false;
  if (filter?.excludeStatuses?.includes(row.status as string)) return false;
  if (filter?.ids && !filter.ids.includes(row.id as string)) return false;
  if (filter?.problem && row.problem !== filter.problem) return false;
  return true;
}

function pick(row: StoreRow, columns: readonly StagedColumn[]): StoreRow {
  const out: StoreRow = {};
  for (const c of columns) out[c] = clone(row[c] ?? null);
  return out;
}

function memoryStore(db: MemoryEvidenceDb, actor: MemoryActor): EvidenceStore {
  const t = db.tables;
  return {
    kind: "evidence-store",
    userId: actor.profileId,

    async resolveOrganization(requested): Promise<EvidenceOrgContext> {
      const orgs = actor.memberships;
      if (orgs.length === 0) return { ok: false, reason: "no-organization" };
      const options = orgs.map((o) => ({ id: o.organizationId, name: o.organizationName }));
      const authorize = (m: MemoryMembership): EvidenceOrgContext => {
        if (!isGovernanceRole(m.role) || !hasOrganizationCapability(m.role, "import-evidence")) {
          return { ok: false, reason: "not-authorized" };
        }
        return { ok: true, organizationId: m.organizationId, organizationName: m.organizationName, role: m.role };
      };
      const wanted = requested?.trim().toLowerCase();
      if (wanted) {
        const hit = orgs.filter(
          (o) => o.organizationId.toLowerCase() === wanted || o.organizationName.trim().toLowerCase() === wanted,
        );
        return hit.length === 1 ? authorize(hit[0]) : { ok: false, reason: "not-a-member", options };
      }
      const active = orgs.find((o) => o.organizationId === actor.activeOrganizationId);
      if (active) return authorize(active);
      if (orgs.length === 1) return authorize(orgs[0]);
      return { ok: false, reason: "choice-required", options };
    },

    async findSessionByFingerprint(organizationId, fingerprint) {
      const s = t.sessions.find((x) => x.organization_id === organizationId && x.source_fingerprint === fingerprint);
      return ok(s ? clone(s) : null);
    },

    async insertSession(row) {
      if (t.sessions.some((x) => x.organization_id === row.organization_id && x.source_fingerprint === row.source_fingerprint)) {
        return err({ code: "23505", message: "evidence_import_sessions_source_once" });
      }
      const created = { ...clone(row), id: db.nextId(), created_at: db.now() };
      t.sessions.push(created);
      return ok({ id: created.id as string, created_at: created.created_at as string });
    },

    async readSession(sessionId) {
      const s = t.sessions.find((x) => x.id === sessionId);
      return ok(s ? clone(s) : null);
    },

    async insertImportEvent(row) {
      t.importEvents.push({ ...clone(row), id: db.nextId(), created_at: db.now() });
      return ok(null);
    },

    async listImportEvents(sessionId) {
      const rows = t.importEvents.filter((e) => e.session_id === sessionId).map(clone);
      return ok(rows.reverse().slice(0, 200));
    },

    async insertStagedRows(rows) {
      if (db.countStagedInsert()) return err({ code: "08006", message: "fault injected: connection lost" });
      const written: { id: string }[] = [];
      for (const r of rows) {
        const taken = t.staged.some((x) => x.session_id === r.session_id && x.row_index === r.row_index);
        if (taken) continue; // ON CONFLICT (session_id, row_index) DO NOTHING
        const row: StoreRow = {
          status: "pending",
          person_state: "unmatched",
          context_state: "absent",
          duplicate_state: "new",
          duplicate_of_record_id: null,
          organization_person_id: null,
          work_object_id: null,
          person_match_confidence: null,
          person_match_method: null,
          problem: null,
          ...clone(r),
          id: db.nextId(),
          created_at: db.now(),
        };
        t.staged.push(row);
        written.push({ id: row.id as string });
      }
      return ok(written);
    },

    async countStagedRows(sessionId, filter) {
      return ok(t.staged.filter((x) => x.session_id === sessionId && matches(x, filter)).length);
    },

    async listStagedRows(sessionId, columns, filter) {
      const rows = t.staged
        .filter((x) => x.session_id === sessionId && matches(x, filter))
        .sort((a, b) => (a.row_index as number) - (b.row_index as number))
        .map((x) => pick(x, columns));
      return ok(rows);
    },

    async updateStagedRow(id, patch) {
      const row = t.staged.find((x) => x.id === id);
      if (!row) return ok(0);
      if (row.status === "committed") {
        db.committedWriteAttempts += 1;
        return ok(0);
      }
      Object.assign(row, clone(patch));
      db.stagedWrites.push({ id, kind: "update", patch: clone(patch) });
      return ok(1);
    },

    async commitStagedRow(id, finalState) {
      const row = t.staged.find((x) => x.id === id);
      if (!row) return ok(0);
      if (row.status === "committed") {
        db.committedWriteAttempts += 1;
        return ok(0);
      }
      if (row.status !== "ready") return ok(0);
      const patch = { ...clone(finalState), status: "committed" };
      Object.assign(row, patch);
      db.stagedWrites.push({ id, kind: "commit", patch });
      return ok(1);
    },

    async readRoster(organizationId) {
      return ok(t.people.filter((p) => p.organization_id === organizationId).map(clone));
    },

    async insertRosterPerson(row) {
      const id = db.nextId();
      t.people.push({ ...clone(row), id, linked_profile_id: null });
      return ok({ id });
    },

    async readWorkObjects(organizationId) {
      return ok(t.objects.filter((o) => o.organization_id === organizationId).map(clone));
    },

    async createWorkObject(args) {
      const name = (args.p_name ?? "").trim();
      if (name === "") return ok("invalid");
      if (t.objects.filter((o) => o.organization_id === args.p_organization_id).length >= 500) return ok("limit_reached");
      t.objects.push({
        id: db.nextId(),
        organization_id: args.p_organization_id,
        name,
        status: "active",
        project_id: args.p_project_id,
        country: args.p_country,
        region: args.p_region,
        city: args.p_city,
        address_line: args.p_address_line,
        created_by: actor.profileId,
      });
      return ok("created");
    },

    async readRecordKeys(organizationId) {
      return ok(t.records.filter((r) => r.organization_id === organizationId).map(clone));
    },

    async insertRecords(rows) {
      const written: { id: string; import_row_id: string }[] = [];
      for (const r of rows) {
        const taken = t.records.some(
          (x) => x.organization_id === r.organization_id && x.record_fingerprint === r.record_fingerprint,
        );
        if (taken) continue; // ON CONFLICT (organization_id, record_fingerprint) DO NOTHING
        const id = db.nextId();
        t.records.push({ ...clone(r), id, created_at: db.now() });
        written.push({ id, import_row_id: r.import_row_id as string });
      }
      return ok(written);
    },

    async insertCompetencySignals(rows) {
      for (const r of rows) {
        if (t.signals.some((x) => x.record_id === r.record_id && x.term === r.term)) continue;
        t.signals.push({ ...clone(r), id: db.nextId() });
      }
      return ok(null);
    },

    async readRecord(recordId) {
      const r = t.records.find((x) => x.id === recordId);
      return ok(r ? clone(r) : null);
    },

    async listSessionRecords(sessionId, page) {
      const rows: SessionRecordWithEvents[] = t.records
        .filter((r) => r.session_id === sessionId)
        .sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1))
        .slice(page.offset, page.offset + page.limit)
        .map((r) => ({
          id: r.id as string,
          organization_id: r.organization_id as string,
          supplier_role: r.supplier_role as string,
          evidence_state: r.evidence_state as string,
          subject_profile_id:
            (t.people.find((p) => p.id === r.organization_person_id)?.linked_profile_id as string | null) ?? null,
          events: t.recordEvents
            .filter((e) => e.record_id === r.id)
            .map((e) => ({
              event_type: e.event_type as string,
              actor_role: (e.actor_role as string | null) ?? null,
              actor_profile_id: (e.actor_profile_id as string | null) ?? null,
              created_at: (e.created_at as string | null) ?? null,
            })),
        }));
      return ok(rows);
    },

    async insertRecordEvents(rows) {
      const written: { id: string }[] = [];
      for (const r of rows) {
        const id = db.nextId();
        t.recordEvents.push({ ...clone(r), id, created_at: db.now() });
        written.push({ id });
      }
      return ok(written);
    },
  };
}
