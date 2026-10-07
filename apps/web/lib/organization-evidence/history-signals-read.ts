import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveEvidenceStanding,
  type RecordLifecycleEvent,
  type ReportedEvidenceState,
} from "./evidence-state";

/**
 * HISTORY SIGNALS FOR MATCHING - what an organization's imported history
 * says, per worker and per canonical skill, as a labelled SIGNAL.
 *
 * `organization_evidence_competency_signals` reached the person's own profile
 * and nothing that ranks or filters people. This is the ONE batched reader the
 * matching layer composes (match-subject.ts), under the CALLER's RLS session -
 * never a service role. Whatever the database lets the caller see is what
 * comes back: a worker's own session sees their own history, an employer's
 * session sees the history their own organization supplied, and nothing else.
 *
 * WHAT THE SIGNAL IS AND IS NOT
 *  - "history mentions skill X in N records", provenance `organization_provided`.
 *    It is evidence that work was DESCRIBED that way (SEP-3: evidence is not
 *    verification), by an organization, not by the worker. It is never a
 *    verified skill and it never writes `worker_skills`.
 *  - ONLY workers linked to a roster row (`link_state = 'linked'`). A name is
 *    never an identity; an unlinked person's history does not reach anyone.
 *  - ONLY live records: a withdrawn import counts nowhere.
 *  - A worker with no history is ABSENT from the map. Absent means "nothing
 *    known", never zero (SEP-7) - consumers must not score the difference.
 *  - A read that fails, or a table that is not installed, is `unavailable`,
 *    never an empty map: "we could not look" is not "there is nothing".
 *
 * Bounded: chunked reads (workers -> roster rows -> live records -> signals).
 */

const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const WORKER_CHUNK = 100;
const PERSON_CHUNK = 50;
const RECORD_CHUNK = 100;
const RECORD_READ_LIMIT = 5000;
/** The signals writer caps at 4 per record, so one chunk of 100 records can
 *  never exceed 400 rows: this limit cannot silently truncate. */
const SIGNAL_READ_LIMIT = 500;

export type HistorySignalProvenance = "organization_provided";

export interface WorkerHistorySkillSignal {
  /** Canonical skill slug. */
  readonly slug: string;
  /** Distinct live records of the worker's history that name the skill. */
  readonly records: number;
  readonly provenance: HistorySignalProvenance;
}

export type HistorySignalsRead =
  | {
      readonly kind: "ok";
      /** worker id -> signals, most-evidenced first. Workers with no history
       *  are absent: unknown, not zero. */
      readonly byWorker: ReadonlyMap<string, readonly WorkerHistorySkillSignal[]>;
    }
  | { readonly kind: "unavailable"; readonly reason: "not_installed" | "read_failed" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

const UNAVAILABLE_FAILED: HistorySignalsRead = { kind: "unavailable", reason: "read_failed" };
const UNAVAILABLE_MISSING: HistorySignalsRead = { kind: "unavailable", reason: "not_installed" };

function chunks<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function readSignalsForWorkers(
  supabase: SupabaseClient,
  workerIds: readonly string[],
): Promise<HistorySignalsRead> {
  const ids = [...new Set(workerIds.filter((w) => typeof w === "string" && w !== ""))];
  if (ids.length === 0) return { kind: "ok", byWorker: new Map() };

  // 1) LINKED roster rows only.
  const workerByPerson = new Map<string, string>();
  for (const chunk of chunks(ids, WORKER_CHUNK)) {
    const res = await db(supabase)
      .from("organization_people")
      .select("id, linked_worker_id")
      .in("linked_worker_id", chunk)
      .eq("link_state", "linked")
      // Same meaning of "linked" as the CV read (worker-evidence-read): only a
      // link the PERSON confirmed makes history theirs.
      .eq("link_method", "worker_confirmed");
    if (res.error) {
      if (MISSING_OBJECT_CODES.has(res.error.code ?? "")) return UNAVAILABLE_MISSING;
      console.error("[history-signals] roster-link read failed:", res.error.code);
      return UNAVAILABLE_FAILED;
    }
    for (const p of (res.data ?? []) as { id: string; linked_worker_id: string | null }[]) {
      if (p.linked_worker_id) workerByPerson.set(p.id, p.linked_worker_id);
    }
  }
  if (workerByPerson.size === 0) return { kind: "ok", byWorker: new Map() };

  // 2) LIVE records of those people (a withdrawn import counts nowhere).
  const workerByRecord = new Map<string, string>();
  for (const chunk of chunks([...workerByPerson.keys()], PERSON_CHUNK)) {
    const res = await db(supabase)
      .from("organization_evidence_records")
      .select(
        "id, organization_person_id, evidence_state, organization_people(linked_profile_id), organization_evidence_events!organization_evidence_events_record_fk(event_type, actor_role, actor_profile_id, created_at)",
      )
      .in("organization_person_id", chunk)
      .limit(RECORD_READ_LIMIT);
    if (res.error) {
      if (MISSING_OBJECT_CODES.has(res.error.code ?? "")) return UNAVAILABLE_MISSING;
      console.error("[history-signals] records read failed:", res.error.code);
      return UNAVAILABLE_FAILED;
    }
    for (const r of (res.data ?? []) as Record<string, unknown>[]) {
      const worker = workerByPerson.get(r.organization_person_id as string);
      if (!worker) continue;
      const events = ((r.organization_evidence_events as Record<string, unknown>[] | null) ?? []).map(
        (e): RecordLifecycleEvent => ({
          eventType: e.event_type as RecordLifecycleEvent["eventType"],
          actorRole: (e.actor_role as string | null) ?? null,
          actorProfileId: (e.actor_profile_id as string | null) ?? null,
          createdAt: (e.created_at as string | null) ?? null,
        }),
      );
      const person = r.organization_people as { linked_profile_id?: string | null } | null;
      const standing = deriveEvidenceStanding(
        r.evidence_state as ReportedEvidenceState,
        events,
        person?.linked_profile_id ?? null,
      );
      if (standing.withdrawn) continue;
      workerByRecord.set(r.id as string, worker);
    }
  }
  if (workerByRecord.size === 0) return { kind: "ok", byWorker: new Map() };

  // 3) Signals that name a canonical skill, counted as DISTINCT records.
  const recordsBy = new Map<string, Map<string, Set<string>>>(); // worker -> slug -> records
  for (const chunk of chunks([...workerByRecord.keys()], RECORD_CHUNK)) {
    const res = await db(supabase)
      .from("organization_evidence_competency_signals")
      .select("record_id, skill_slug")
      .in("record_id", chunk)
      .not("skill_slug", "is", null)
      .limit(SIGNAL_READ_LIMIT);
    if (res.error) {
      if (MISSING_OBJECT_CODES.has(res.error.code ?? "")) return UNAVAILABLE_MISSING;
      console.error("[history-signals] signals read failed:", res.error.code);
      return UNAVAILABLE_FAILED;
    }
    for (const s of (res.data ?? []) as { record_id: string; skill_slug: string | null }[]) {
      const slug = (s.skill_slug ?? "").trim();
      const worker = workerByRecord.get(s.record_id);
      if (!slug || !worker) continue;
      const bySlug = recordsBy.get(worker) ?? new Map<string, Set<string>>();
      const set = bySlug.get(slug) ?? new Set<string>();
      set.add(s.record_id);
      bySlug.set(slug, set);
      recordsBy.set(worker, bySlug);
    }
  }

  const byWorker = new Map<string, readonly WorkerHistorySkillSignal[]>();
  for (const [worker, bySlug] of recordsBy) {
    byWorker.set(
      worker,
      [...bySlug.entries()]
        .map(([slug, set]) => ({
          slug,
          records: set.size,
          provenance: "organization_provided" as const,
        }))
        .sort((a, b) => b.records - a.records || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)),
    );
  }
  return { kind: "ok", byWorker };
}
