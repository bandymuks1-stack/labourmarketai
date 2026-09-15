import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  EXPORTED_RELATIONS,
  WITHHELD_RELATIONS,
  type PersonKey,
} from "@/lib/privacy/personal-relations";

/**
 * Privacy self-service v1 — the user's OWN data as one JSON object
 * (GDPR access/portability, gdpr-readiness-v1 §2 "export PR").
 *
 * Every read below is an ordinary RLS-scoped query as the signed-in user —
 * no service role, no policy widening, no admin path. The bundle contains
 * ONLY data the user already owns and can already see in-product.
 *
 * WHAT CHANGED (PER-12, 2026-09-14). This exported SIX relations while
 * production holds 60 tables keyed to a person, and the bundle's own
 * `excluded` list named four things — so a reader was entitled to conclude
 * that everything else WAS included, and about thirty relations were neither
 * exported nor named. The bundle asserted something false about itself, to
 * the one audience least able to check it. The relation set now lives in
 * `lib/privacy/personal-relations.ts`, where every table keyed to a person is
 * exported, or withheld WITH A REASON that travels in the bundle, or declared
 * not-a-product-relation — and a guard fails on any relation that is none of
 * the three.
 *
 * A FAILED READ IS NOT AN EMPTY ONE (SEP-7). Every read is checked, and
 * anything that could not be read is named in `unavailable` — inside the
 * bundle, beside `withheld`, in the same words the person can act on. The
 * export still returns what it could reach: a transient failure must not deny
 * someone their own data, but it must never be reported to them as absence.
 *
 * The sharpest case is `workers`: if that read fails, `workerIds` is empty and
 * EVERY worker-keyed relation would silently look empty — so that failure is
 * named for all of them at once rather than presenting a person with no work
 * history at all.
 *
 * WHAT AN EMPTY RELATION MEANS. These are RLS-scoped reads, and PostgREST
 * answers a row the policy hides by omitting it, not by erroring. So an empty
 * relation means "nothing the policy lets you read", which for your OWN rows
 * is the same as "nothing" — but the bundle says so rather than leaving the
 * reader to assume it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type RelationError = { code?: string; message?: string } | null;

/** PostgREST codes for "this relation/column is not on this database":
 *  the table is missing (42P01), a column is (42703), or the schema cache
 *  has no such relation (PGRST205/PGRST202). */
const ABSENT_RELATION_CODES = new Set(["42P01", "42703", "PGRST205", "PGRST202"]);

function isRelationAbsent(error: RelationError): boolean {
  return Boolean(error?.code && ABSENT_RELATION_CODES.has(error.code));
}

export interface PrivacyExportBundle {
  format: "labourmarket.ai-personal-data-export";
  version: 2;
  generatedAt: string;
  userId: string;
  /**
   * Relations that hold rows keyed to you and are deliberately NOT in this
   * bundle, each with the reason. Handing them over would hand over someone
   * else as well; ask us and we will answer through a route that can redact.
   */
  withheld: readonly { table: string; reason: string }[];
  /** Stated so an empty relation is never read as proof of absence. */
  readonly note: string;
  /**
   * Parts that could NOT be read while building this bundle. EMPTY means the
   * export is complete; a non-empty list means the corresponding key in `data`
   * is missing content that exists, and is NOT evidence of absence.
   */
  unavailable: readonly string[];
  data: Record<string, unknown>;
}

export type PrivacyExportResult =
  | { kind: "ok"; bundle: PrivacyExportBundle }
  | { kind: "not-authed" };

const EMPTY_MEANS_NOTE =
  "Every relation here was read as you, under the same permissions you have in " +
  "the product. An empty list means nothing was found for you in that relation. " +
  "Anything that could not be read at all is listed under `unavailable`, and is " +
  "not evidence that it is empty. File CONTENTS are never in this bundle — " +
  "documents and photos appear as metadata only.";

/** Read every registered relation for one key, in parallel, keeping each
 *  read's outcome separate so one failure never speaks for another. */
async function readRelations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  key: PersonKey,
  ids: readonly string[],
): Promise<{ data: Record<string, unknown>; unavailable: string[] }> {
  const relations = EXPORTED_RELATIONS.filter((r) => r.key === key);
  const data: Record<string, unknown> = {};
  const unavailable: string[] = [];
  if (ids.length === 0) {
    for (const r of relations) data[r.table] = [];
    return { data, unavailable };
  }
  const results = await Promise.all(
    relations.map((r) =>
      db
        .from(r.table)
        .select("*")
        .in(r.key, ids)
        .then((res: { data: unknown[] | null; error: RelationError }) => res)
        .catch(() => ({ data: null, error: { message: "unreadable" } })),
    ),
  );
  results.forEach((res, i) => {
    const table = relations[i].table;
    data[table] = res.error ? [] : (res.data ?? []);
    // A RELATION THIS DATABASE DOES NOT HAVE IS EMPTY, NOT UNREAD. Some
    // registered relations ship in migrations that are not applied yet; the
    // person has no rows in a table that does not exist, so `[]` is the true
    // answer and naming it "unavailable" would invent a doubt. Every OTHER
    // error is a read that should have worked and did not — that is the case
    // `unavailable` exists for.
    if (res.error && !isRelationAbsent(res.error)) unavailable.push(table);
  });
  return { data, unavailable };
}

export async function buildPrivacyExport(): Promise<PrivacyExportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const db = asAny(supabase);

  // Every failure is recorded by the SAME key it belongs to in `data`, so a
  // reader never has to guess which part of the bundle is thin.
  const unavailable: string[] = [];

  const [profileRes, workersRes] = await Promise.all([
    db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    db.from("workers").select("*").eq("profile_id", user.id),
  ]);
  if (profileRes.error) unavailable.push("profiles");
  if (workersRes.error) unavailable.push("workers");

  const profile = profileRes.error ? null : (profileRes.data ?? null);
  const workers = workersRes.error ? [] : (workersRes.data ?? []);
  const workerIds: string[] = (workers as { id: string }[]).map((w) => w.id);

  const byProfile = await readRelations(db, "profile_id", [user.id]);
  unavailable.push(...byProfile.unavailable);
  // Relations where the person is the SUBJECT of another party's act.
  const bySubject = await readRelations(db, "subject_profile_id", [user.id]);
  unavailable.push(...bySubject.unavailable);

  let byWorker: { data: Record<string, unknown>; unavailable: string[] };
  if (workersRes.error) {
    // The `workers` read failed, so worker-keyed relations were never even
    // attempted. Naming every one of them is the difference between "we could
    // not read your work history" and "you have none".
    byWorker = {
      data: Object.fromEntries(
        EXPORTED_RELATIONS.filter((r) => r.key === "worker_id").map((r) => [
          r.table,
          [],
        ]),
      ),
      unavailable: EXPORTED_RELATIONS.filter((r) => r.key === "worker_id").map(
        (r) => r.table,
      ),
    };
  } else {
    byWorker = await readRelations(db, "worker_id", workerIds);
  }
  unavailable.push(...byWorker.unavailable);

  return {
    kind: "ok",
    bundle: {
      format: "labourmarket.ai-personal-data-export",
      version: 2,
      generatedAt: new Date().toISOString(),
      userId: user.id,
      withheld: WITHHELD_RELATIONS.map((w) => ({
        table: w.table,
        reason: w.reason,
      })),
      note: EMPTY_MEANS_NOTE,
      unavailable,
      data: {
        profiles: profile,
        workers,
        ...byProfile.data,
        ...bySubject.data,
        ...byWorker.data,
      },
    },
  };
}
