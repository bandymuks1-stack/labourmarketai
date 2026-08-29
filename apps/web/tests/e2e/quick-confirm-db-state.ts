import { randomUUID, createHash } from "node:crypto";

import { db, dbOk } from "./market-map-db-state";
import { FIXTURE_PROFILES, fixtureWorkerId } from "./fixture-ids";

/**
 * LOCAL-stack state for the cross-actor quick-confirm spec.
 *
 * Reuses `market-map-db-state`'s loopback-guarded `db()` / `dbOk()` rather
 * than opening a second service-role path — one guarded door, not two. That
 * file is named for the spec that first needed it; the helpers themselves are
 * generic, and duplicating them would mean duplicating the refusal that keeps
 * a service key off any non-local target.
 *
 * ## Why this file exists at all
 *
 * The confirm flow is DESTRUCTIVE to fixture state in two ways, and a spec
 * that ignores either one poisons every later run:
 *
 *   1. A confirmed entry leaves the reviewable queue permanently.
 *   2. Confirming flips `worker_skills.verified` to true, and the worker's CV
 *      then files those skills under "manager confirmed" instead of
 *      "self-declared" — for good.
 *
 * So the mutating tests never touch the 18 fixture entries. They seed their
 * own, marked, dated today, and remove them; and the whole spec snapshots the
 * worker's verified flags up front and restores them at the end. The existing
 * reviewable entries are used only where reading them changes nothing.
 */

/** Everything this spec creates carries this marker in `original_text`, so
 *  cleanup can be exact rather than "anything that looks recent". */
export const MARKER_PREFIX = "[[e2e-quick-confirm";

/** A fresh marker per run — parallel or interrupted runs never delete each
 *  other's rows, and a leaked row is traceable to the run that made it. */
export function newRunMarker(): string {
  return `${MARKER_PREFIX}-${randomUUID().slice(0, 8)}]]`;
}

export const WORKER_PROFILE = FIXTURE_PROFILES.worker;

/** The worker's active, review-enabled engagement. Resolved rather than
 *  hardcoded: the fixture id is stable but the INVARIANT that matters is
 *  "review is enabled here", and resolving asserts it. */
export async function reviewEnabledEngagementId(workerProfileId = WORKER_PROFILE): Promise<string> {
  const res = await dbOk(
    "GET",
    `engagement_contexts?profile_id=eq.${workerProfileId}` +
      "&journal_review_enabled=is.true&status=eq.active&select=id&limit=1",
  );
  const rows = (await res.json()) as Array<{ id: string }>;
  if (rows.length === 0) {
    throw new Error(
      `No active journal_review_enabled engagement for profile ${workerProfileId}. ` +
        "Run `pnpm db:fixtures:local` — without it there is nothing for a manager to review.",
    );
  }
  return rows[0].id;
}

/**
 * Create `count` entries dated NOW (so they fall in the UTC day the batch
 * surface calls "today") for the fixture worker. Returns their ids.
 *
 * `hash_self` is NOT NULL and is the entry's own content hash in the chain;
 * computing it here the way the fixtures do keeps the seeded rows shaped like
 * real ones instead of like test debris.
 */
export async function seedTodayEntries(
  count: number,
  marker: string,
): Promise<string[]> {
  const workerId = await fixtureWorkerId(WORKER_PROFILE);
  const engagementContextId = await reviewEnabledEngagementId();
  const rows = Array.from({ length: count }, (_, i) => {
    const text = `${marker} Klojau plyteles, ${6 + i} valandos.`;
    return {
      worker_id: workerId,
      engagement_context_id: engagementContextId,
      entry_type_slug: "freeform",
      original_text: text,
      original_language: "lt",
      hash_self: createHash("sha256").update(text).digest("hex"),
    };
  });
  const res = await dbOk("POST", "journal_entries?select=id", rows);
  const created = (await res.json()) as Array<{ id: string }>;
  if (created.length !== count) {
    throw new Error(`seeded ${created.length} entries, expected ${count}`);
  }
  return created.map((r) => r.id);
}

/**
 * Guarantee the worker has DECLARED, unconfirmed skills — the subject of the
 * whole loop.
 *
 * `worker_skills` is not fixture-defined: rows appear when the journal
 * flywheel recognises skills from entries. On a freshly reset stack there are
 * ZERO, so a confirm would confirm nothing and every assertion about verified
 * skills would pass vacuously. The spec therefore pins what it assumes,
 * exactly as `market-map-db-state` does, instead of depending on whatever an
 * earlier session happened to leave behind.
 *
 * Returns the skill ids that are now declared-and-unverified.
 */
export async function ensureDeclaredSkills(count = 3): Promise<string[]> {
  const workerId = await fixtureWorkerId(WORKER_PROFILE);
  const existing = (await workerSkillFlags()).filter((s) => !s.verified);
  if (existing.length >= count) return existing.slice(0, count).map((s) => s.skill_id);

  const res = await dbOk("GET", `skills?select=id&limit=${count}`);
  const skills = (await res.json()) as Array<{ id: string }>;
  if (skills.length === 0) {
    throw new Error("no skills in the catalogue — run `pnpm db:fixtures:local`");
  }
  await dbOk(
    "POST",
    "worker_skills?on_conflict=worker_id,skill_id",
    skills.map((sk) => ({
      worker_id: workerId,
      skill_id: sk.id,
      verified: false,
      source: "self_declared",
    })),
    "resolution=merge-duplicates,return=minimal",
  );
  return skills.map((sk) => sk.id);
}

/** Remove the declared skills this run created. */
export async function removeDeclaredSkills(skillIds: string[]): Promise<void> {
  if (skillIds.length === 0) return;
  const workerId = await fixtureWorkerId(WORKER_PROFILE);
  await db(
    "DELETE",
    `worker_skills?worker_id=eq.${workerId}&skill_id=in.(${skillIds.join(",")})`,
  );
}

/** Confirmation rows written for an entry — the manager's decision, as the
 *  database recorded it. */
export async function confirmationsFor(
  entryId: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await dbOk(
    "GET",
    `journal_entry_confirmations?entry_id=eq.${entryId}&select=*`,
  );
  return (await res.json()) as Array<Record<string, unknown>>;
}

export type WorkerSkillFlag = {
  skill_id: string;
  verified: boolean;
  /** Confirming rewrites `source` to `manager_confirmed` as well as
   *  flipping `verified`, and the CV tier rule reads BOTH. Restoring only
   *  the flag left the fixture in the "inconsistent row" state the tier
   *  logic deliberately under-states — so the next run could never see a
   *  confirmed tier, for a reason nothing in the product explains. */
  source: string | null;
};

/** Every declared skill for the fixture worker, with its verified flag. */
export async function workerSkillFlags(): Promise<WorkerSkillFlag[]> {
  const workerId = await fixtureWorkerId(WORKER_PROFILE);
  const res = await dbOk(
    "GET",
    `worker_skills?worker_id=eq.${workerId}&select=skill_id,verified,source`,
  );
  return (await res.json()) as WorkerSkillFlag[];
}

/**
 * Put the worker's verified flags back exactly as they were. Called in
 * afterAll: without it, one confirm run permanently reclassifies the fixture
 * worker's skills and the NEXT run's "self-declared" assertions fail for a
 * reason that has nothing to do with the code under test.
 */
export async function restoreWorkerSkillFlags(snapshot: WorkerSkillFlag[]): Promise<void> {
  const workerId = await fixtureWorkerId(WORKER_PROFILE);
  // Row by row, because `verified` AND `source` must go back together: a row
  // left as `manager_confirmed` + `verified: false` is the exact inconsistency
  // the CV tier rule under-states as evidence, and it would silently break the
  // next run's confirmed-tier assertion.
  for (const s of snapshot) {
    await dbOk(
      "PATCH",
      `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${s.skill_id}`,
      { verified: s.verified, source: s.source },
    );
  }
}

/**
 * Remove everything this run created. Confirmations first — they reference the
 * entries — then the entries themselves.
 *
 * Cleanup deliberately uses `db` rather than `dbOk`: a failure here must not
 * mask the test result that has already been decided, and leftover rows are
 * traceable by their marker.
 */
export async function removeSeeded(marker: string, entryIds: string[]): Promise<void> {
  if (entryIds.length > 0) {
    await db("DELETE", `journal_entry_confirmations?entry_id=in.(${entryIds.join(",")})`);
  }
  await db("DELETE", `journal_entries?original_text=like.*${encodeURIComponent(marker)}*`);
}
