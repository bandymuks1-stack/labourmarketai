import "server-only";

import type { EntrySkillProvenance } from "@/lib/journal/entry-skill-source";

/**
 * THE single TS write path into `journal_entry_skills` (PR-C provenance).
 *
 * Every insert/upsert of an entry↔skill evidence link goes through
 * `writeEntrySkillLinks`, which stamps the write-time `provenance`:
 *
 *   'recognized' — pipeline auto-link from the entry text
 *   'confirmed'  — the worker's explicit one-tap candidate confirmation
 *   'manual'     — the worker manually linked a declared skill
 *
 * HONEST DEGRADATION: the provenance column ships in migration
 * 20260727180000_journal_entry_skill_provenance_v1.sql and may not be applied
 * in a given environment yet. When the stamped write fails with Postgres
 * undefined_column (42703) or the PostgREST schema-cache miss (PGRST204), the
 * SAME rows are retried WITHOUT the column — the link lands exactly as it did
 * before this feature, provenance simply stays unrecorded (NULL-by-absence).
 * Nothing is faked and no fake success is logged; the caller sees the real
 * final error, if any, plus a `degraded` flag.
 *
 * Guarded by lib/guards/journal-entry-skill-provenance.test.ts: no other TS
 * module may insert/upsert into journal_entry_skills directly.
 */

export type EntrySkillLinkRowInput = {
  journal_entry_id: string;
  worker_id: string;
  skill_id: string;
};

type WriteErrorShape = { code?: string; message?: string } | null;

export type WriteEntrySkillLinksResult = {
  error: WriteErrorShape;
  /** True when the environment lacks the provenance column and the write
   *  succeeded only after retrying unstamped. */
  degraded: boolean;
};

/** Postgres undefined_column (42703) or PostgREST "column not found in schema
 *  cache" (PGRST204) — the provenance column is not applied here yet. */
export function isMissingProvenanceColumnError(error: WriteErrorShape): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("provenance") &&
    (msg.includes("column") || msg.includes("schema cache"))
  );
}

export async function writeEntrySkillLinks(
  // The link table is not in the generated Supabase types yet — same `any`
  // routing as every existing call site (RLS still enforces ownership).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  rows: readonly EntrySkillLinkRowInput[],
  provenance: EntrySkillProvenance,
  /** 'upsert' = idempotent evidence add (onConflict journal_entry_id,skill_id,
   *  ignoreDuplicates — the shape every existing upsert site used);
   *  'insert' = plain insert (the manual replace-links flow). */
  mode: "insert" | "upsert",
): Promise<WriteEntrySkillLinksResult> {
  if (rows.length === 0) return { error: null, degraded: false };

  const write = (payload: Record<string, unknown>[]) =>
    mode === "upsert"
      ? sb.from("journal_entry_skills").upsert(payload, {
          onConflict: "journal_entry_id,skill_id",
          ignoreDuplicates: true,
        })
      : sb.from("journal_entry_skills").insert(payload);

  const stamped = await write(rows.map((r) => ({ ...r, provenance })));
  if (!stamped.error) return { error: null, degraded: false };

  if (isMissingProvenanceColumnError(stamped.error)) {
    // Environment predates the provenance column — retry unstamped so the
    // evidence link itself is never lost to an unapplied migration.
    const plain = await write(rows.map((r) => ({ ...r })));
    return { error: plain.error ?? null, degraded: true };
  }

  return { error: stamped.error, degraded: false };
}
