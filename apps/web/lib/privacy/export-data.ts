import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  EXPORTED_RELATIONS,
  WITHHELD_RELATIONS,
  type ExportedRelation,
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
 * CHAINED CHILDREN (PER-12, 2026-10-03). Event / metric / signal tables that
 * carry only a parent id are read LAST, from the ids of the parent relations
 * already delivered (`key: "parent_row"`), in id chunks with paging so neither
 * the URL length nor PostgREST's row cap can silently truncate a person's
 * history. Per-relation redaction (`redactActors`, `omitColumns`) keeps other
 * people's ids and free-form state out of the bundle. A relation whose select
 * policy does not admit the subject carries an `rlsNote` into
 * `relationNotes`, so an empty list is never read as proof of absence.
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
  /**
   * 3 (PER-12): adds `relationNotes`, `redactions` and the `storage_manifest`
   * key under `data`, and chained child relations. Version 2 readers lose
   * nothing: every v2 key is still present, unchanged.
   */
  version: 3;
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
  /**
   * Relations whose list may be empty although rows about you exist, because
   * the policy that guards them does not admit you (or admits you only partly).
   */
  relationNotes: Readonly<Record<string, string>>;
  /** Columns blanked in a relation because they named someone else. */
  redactions: Readonly<Record<string, readonly string[]>>;
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
  "documents and photos appear as metadata only, plus a `storage_manifest` of " +
  "time-limited links to the files themselves. Columns that named another " +
  "person are blanked and listed under `redactions`; relations your own " +
  "permissions may not fully reveal are explained under `relationNotes`.";

type Row = Record<string, unknown>;

/** Ids per `in (...)` request, and rows per page: keeps the URL short and
 *  stays under PostgREST's default 1000-row cap. */
const ID_CHUNK = 100;
const PAGE_SIZE = 1000;
/** Signed links in `storage_manifest` live this long. */
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

/** Blank other people's ids / free-form state, per the relation's register
 *  entry. A subject's own id is kept: it is their data. */
export function redactRows(
  rows: readonly Row[],
  rel: Pick<ExportedRelation, "redactActors" | "omitColumns">,
  subjectProfileId: string,
): Row[] {
  const actors = rel.redactActors ?? [];
  const omit = rel.omitColumns ?? [];
  if (actors.length === 0 && omit.length === 0) return rows as Row[];
  return rows.map((row) => {
    const out: Row = { ...row };
    for (const c of actors) {
      if (c in out && out[c] !== subjectProfileId) out[c] = null;
    }
    for (const c of omit) {
      if (c in out) out[c] = null;
    }
    return out;
  });
}

async function readOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  rel: ExportedRelation,
  ids: readonly string[],
  chunked: boolean,
): Promise<{ data: Row[] | null; error: RelationError }> {
  const column = rel.column ?? rel.key;
  try {
    if (rel.rpc) {
      // Subject derived from auth.uid() inside the function; no ids sent.
      const res = await db.rpc(rel.rpc);
      return { data: res.data ?? null, error: res.error ?? null };
    }
    if (!chunked) {
      const res = await db.from(rel.table).select("*").in(column, ids);
      return { data: res.data ?? null, error: res.error ?? null };
    }
    const rows: Row[] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK);
      for (let from = 0; ; from += PAGE_SIZE) {
        const res = await db
          .from(rel.table)
          .select("*")
          .in(column, chunk)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (res.error) return { data: null, error: res.error };
        const page: Row[] = res.data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
    }
    return { data: rows, error: null };
  } catch {
    return { data: null, error: { message: "unreadable" } };
  }
}

/** Read every registered relation for one key, in parallel, keeping each
 *  read's outcome separate so one failure never speaks for another. */
async function readRelations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  key: PersonKey,
  ids: readonly string[],
  subjectProfileId: string,
): Promise<{ data: Record<string, unknown>; unavailable: string[] }> {
  const relations = EXPORTED_RELATIONS.filter((r) => r.key === key);
  const data: Record<string, unknown> = {};
  const unavailable: string[] = [];
  if (ids.length === 0) {
    for (const r of relations) data[r.as ?? r.table] = [];
    return { data, unavailable };
  }
  const results = await Promise.all(
    // The column that carries the key on THIS table (`recipient_profile_id`,
    // `user_id`, `subject_profile_id`, ...) defaults to the key's own name.
    relations.map((r) => readOne(db, r, ids, false)),
  );
  results.forEach((res, i) => {
    const table = relations[i].as ?? relations[i].table;
    data[table] = res.error ? [] : redactRows(res.data ?? [], relations[i], subjectProfileId);
    // A RELATION THIS DATABASE DOES NOT HAVE IS EMPTY, NOT UNREAD. Some
    // registered relations ship in migrations that are not applied yet; the
    // person has no rows in a table that does not exist, so `[]` is the true
    // answer and naming it "unavailable" would invent a doubt. Every OTHER
    // error is a read that should have worked and did not: that is the case
    // `unavailable` exists for.
    // An RPC-backed relation whose FUNCTION is missing is NOT "no rows": the
    // table exists and may hold rows about the person, so it is unavailable.
    if (res.error && (relations[i].rpc || !isRelationAbsent(res.error))) unavailable.push(table);
  });
  return { data, unavailable };
}

/** CHAINED CHILDREN: read last, from the ids of already-delivered parents. */
async function readChildRelations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  delivered: Record<string, unknown>,
  parentUnavailable: ReadonlySet<string>,
  subjectProfileId: string,
): Promise<{ data: Record<string, unknown>; unavailable: string[] }> {
  const relations = EXPORTED_RELATIONS.filter((r) => r.key === "parent_row");
  const data: Record<string, unknown> = {};
  const unavailable: string[] = [];
  await Promise.all(
    relations.map(async (r) => {
      const name = r.as ?? r.table;
      const parent = r.parent ?? "";
      if (parentUnavailable.has(parent)) {
        data[name] = [];
        unavailable.push(name);
        return;
      }
      const parentRows = delivered[parent];
      const ids: string[] = Array.isArray(parentRows)
        ? (parentRows as { id?: unknown }[])
            .map((x) => x.id)
            .filter((id): id is string => typeof id === "string")
        : [];
      if (ids.length === 0) {
        data[name] = [];
        return;
      }
      const res = await readOne(db, r, ids, true);
      data[name] = res.error ? [] : redactRows(res.data ?? [], r, subjectProfileId);
      if (res.error && !isRelationAbsent(res.error)) unavailable.push(name);
    }),
  );
  return { data, unavailable };
}

type ManifestEntry = {
  bucket: string;
  path: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  signedUrl: string | null;
  expiresInSeconds: number;
};

/**
 * Binary person data lives in private storage buckets. The bundle carries the
 * metadata rows (journal_entry_photos), and this manifest adds a time-limited
 * signed link per file, minted AS THE SIGNED-IN USER: the bucket's own
 * owner-scoped storage policy decides, so another person's file can never be
 * signed here. A path the policy refuses gets `signedUrl: null`, not a lie.
 */
async function buildStorageManifest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  photos: readonly Row[],
  avatarPath: string | null,
): Promise<{ entries: ManifestEntry[]; failed: boolean }> {
  const wanted: { bucket: string; row: Row | null; path: string }[] = [];
  for (const p of photos) {
    if (typeof p.storage_path === "string" && p.upload_status === "uploaded") {
      wanted.push({ bucket: "journal-entry-photos", row: p, path: p.storage_path });
    }
  }
  if (avatarPath) wanted.push({ bucket: "profile-avatars", row: null, path: avatarPath });
  if (wanted.length === 0) return { entries: [], failed: false };

  const entries: ManifestEntry[] = [];
  let failed = false;
  for (const bucket of ["journal-entry-photos", "profile-avatars"]) {
    const group = wanted.filter((w) => w.bucket === bucket);
    if (group.length === 0) continue;
    let urls = new Map<string, string>();
    try {
      const res = await db.storage
        .from(bucket)
        .createSignedUrls(
          group.map((g) => g.path),
          SIGNED_URL_TTL_SECONDS,
        );
      if (res.error) throw res.error;
      urls = new Map(
        (res.data ?? [])
          .filter((d: { path?: string; signedUrl?: string }) => d.path && d.signedUrl)
          .map((d: { path: string; signedUrl: string }) => [d.path, d.signedUrl]),
      );
    } catch {
      failed = true;
    }
    for (const g of group) {
      entries.push({
        bucket,
        path: g.path,
        fileName: typeof g.row?.file_name === "string" ? g.row.file_name : null,
        mimeType: typeof g.row?.mime_type === "string" ? g.row.mime_type : null,
        sizeBytes: typeof g.row?.file_size_bytes === "number" ? g.row.file_size_bytes : null,
        signedUrl: urls.get(g.path) ?? null,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      });
    }
  }
  return { entries, failed };
}

/** A stage whose parent read failed: every dependent relation is named
 *  unavailable, and reported empty, never silently absent. */
function failedStage(key: PersonKey): {
  data: Record<string, unknown>;
  unavailable: string[];
} {
  const relations = EXPORTED_RELATIONS.filter((r) => r.key === key);
  return {
    data: Object.fromEntries(relations.map((r) => [r.as ?? r.table, []])),
    unavailable: relations.map((r) => r.as ?? r.table),
  };
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

  const byProfile = await readRelations(db, "profile_id", [user.id], user.id);
  unavailable.push(...byProfile.unavailable);

  let byWorker: { data: Record<string, unknown>; unavailable: string[] };
  if (workersRes.error) {
    // The `workers` read failed, so worker-keyed relations were never even
    // attempted. Naming every one of them is the difference between "we could
    // not read your work history" and "you have none".
    byWorker = {
      data: Object.fromEntries(
        EXPORTED_RELATIONS.filter((r) => r.key === "worker_id").map((r) => [
          r.as ?? r.table,
          [],
        ]),
      ),
      unavailable: EXPORTED_RELATIONS.filter((r) => r.key === "worker_id").map(
        (r) => r.as ?? r.table,
      ),
    };
  } else {
    byWorker = await readRelations(db, "worker_id", workerIds, user.id);
  }
  unavailable.push(...byWorker.unavailable);

  // CHAINED KEYS. What an organization recorded about the person hangs off
  // the `organization_people` row it linked to them, and the events off the
  // record. Each stage reads only from what the previous stage returned as
  // the person — if the roster read failed, the dependent relations are named
  // unavailable rather than reported empty.
  const rosterRows = byProfile.data.organization_people;
  const rosterFailed = byProfile.unavailable.includes("organization_people");
  const personIds: string[] = Array.isArray(rosterRows)
    ? (rosterRows as { id?: unknown }[])
        .map((r) => r.id)
        .filter((id): id is string => typeof id === "string")
    : [];
  const byPerson = rosterFailed
    ? failedStage("organization_person_id")
    : await readRelations(db, "organization_person_id", personIds, user.id);
  unavailable.push(...byPerson.unavailable);

  const recordRows = byPerson.data.organization_evidence_records;
  const recordsFailed = byPerson.unavailable.includes("organization_evidence_records");
  const recordIds: string[] = Array.isArray(recordRows)
    ? (recordRows as { id?: unknown }[])
        .map((r) => r.id)
        .filter((id): id is string => typeof id === "string")
    : [];
  const byRecord = recordsFailed
    ? failedStage("organization_evidence_record_id")
    : await readRelations(db, "organization_evidence_record_id", recordIds, user.id);
  unavailable.push(...byRecord.unavailable);

  const delivered: Record<string, unknown> = {
    ...byProfile.data,
    ...byWorker.data,
    ...byPerson.data,
    ...byRecord.data,
  };
  const earlierUnavailable = new Set(unavailable);
  const byChild = await readChildRelations(db, delivered, earlierUnavailable, user.id);
  unavailable.push(...byChild.unavailable);

  const photoRows = Array.isArray(delivered.journal_entry_photos)
    ? (delivered.journal_entry_photos as Row[])
    : [];
  const avatarPath =
    profile && typeof (profile as Row).avatar_url === "string"
      ? ((profile as Row).avatar_url as string)
      : null;
  const manifest = await buildStorageManifest(db, photoRows, avatarPath);
  if (manifest.failed) unavailable.push("storage_manifest");

  const relationNotes: Record<string, string> = {};
  const redactions: Record<string, readonly string[]> = {};
  for (const r of EXPORTED_RELATIONS) {
    const name = r.as ?? r.table;
    if (r.rlsNote) relationNotes[name] = r.rlsNote;
    const cols = [...(r.redactActors ?? []), ...(r.omitColumns ?? [])];
    if (cols.length > 0) redactions[name] = cols;
  }

  return {
    kind: "ok",
    bundle: {
      format: "labourmarket.ai-personal-data-export",
      version: 3,
      generatedAt: new Date().toISOString(),
      userId: user.id,
      withheld: WITHHELD_RELATIONS.map((w) => ({
        table: w.table,
        reason: w.reason,
      })),
      note: EMPTY_MEANS_NOTE,
      unavailable,
      relationNotes,
      redactions,
      data: {
        profiles: profile,
        workers,
        ...delivered,
        ...byChild.data,
        storage_manifest: manifest.entries,
      },
    },
  };
}
