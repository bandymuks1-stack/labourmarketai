import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Privacy self-service v1 — the user's OWN data as one JSON object
 * (GDPR access/portability, gdpr-readiness-v1 §2 "export PR").
 *
 * Every read below is an ordinary RLS-scoped query as the signed-in user —
 * no service role, no policy widening, no admin path. The bundle contains
 * ONLY data the user already owns and can already see in-product:
 *
 *   profile, consents (audit trail), worker rows, journal entries,
 *   worker skills, worker document METADATA (never file contents).
 *
 * DELIBERATELY EXCLUDED (and stated in the bundle itself, honestly):
 *   - conversations/messages — they contain the OTHER party's words;
 *   - journal confirmations — confirmer identities are not the caller's;
 *   - company/agency records — owned by other principals;
 *   - stored files — metadata only; files need their own signed flow.
 *
 * A FAILED READ IS NOT AN EMPTY ONE (SEP-7). Every read below discarded its
 * error and fell back to `[]` or `null`. That is wrong anywhere and worst
 * here: this bundle is a subject-access response, and it carries an
 * `excluded` list naming what was deliberately left out — so a reader is
 * entitled to conclude that everything NOT on that list IS included. A failed
 * read therefore did not merely lose data, it made the bundle assert
 * something false about itself.
 *
 * The sharpest case was `workers`: if that read failed, `workerIds` came back
 * empty, the whole journal / skills / documents branch was SKIPPED, and the
 * person received an export claiming they had no work history at all.
 *
 * So every read is now checked, and anything that could not be read is named
 * in `unavailable` — inside the bundle, beside `excluded`, in the same words
 * the person can act on. The export still returns what it could reach: a
 * transient failure must not deny someone their own data, but it must never
 * be reported to them as absence.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface PrivacyExportBundle {
  format: "labourmarket.ai-personal-data-export";
  version: 1;
  generatedAt: string;
  userId: string;
  excluded: readonly string[];
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

const EXCLUDED_NOTE = [
  "conversations and messages (they include the other party's words)",
  "journal confirmations (confirmer identities belong to other users)",
  "company/agency records (owned by other principals)",
  "stored file contents (metadata only in this bundle)",
] as const;

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

  const [profileRes, consentsRes, workersRes] = await Promise.all([
    db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    db.from("consents").select("*").eq("profile_id", user.id),
    db.from("workers").select("*").eq("profile_id", user.id),
  ]);
  if (profileRes.error) unavailable.push("profile");
  if (consentsRes.error) unavailable.push("consents");
  if (workersRes.error) unavailable.push("workers");

  const profile = profileRes.error ? null : (profileRes.data ?? null);
  const workers = workersRes.error ? [] : (workersRes.data ?? []);
  const workerIds: string[] = (workers as { id: string }[]).map((w) => w.id);

  let journalEntries: unknown[] = [];
  let workerSkills: unknown[] = [];
  let workerDocuments: unknown[] = [];
  if (workersRes.error) {
    // The branch below is gated on workerIds, so a failed `workers` read used
    // to skip it silently and report NO work history rather than an unread
    // one. Name all three: their emptiness here is unexplained, not proven.
    unavailable.push("journal_entries", "worker_skills", "worker_documents");
  } else if (workerIds.length > 0) {
    const [journalRes, skillsRes, docsRes] = await Promise.all([
      db.from("journal_entries").select("*").in("worker_id", workerIds),
      db.from("worker_skills").select("*").in("worker_id", workerIds),
      db.from("worker_documents").select("*").in("worker_id", workerIds),
    ]);
    if (journalRes.error) unavailable.push("journal_entries");
    else journalEntries = journalRes.data ?? [];
    if (skillsRes.error) unavailable.push("worker_skills");
    else workerSkills = skillsRes.data ?? [];
    if (docsRes.error) unavailable.push("worker_documents");
    else workerDocuments = docsRes.data ?? [];
  }

  return {
    kind: "ok",
    bundle: {
      format: "labourmarket.ai-personal-data-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      userId: user.id,
      excluded: EXCLUDED_NOTE,
      unavailable,
      data: {
        profile,
        consents: consentsRes.error ? [] : (consentsRes.data ?? []),
        workers,
        journal_entries: journalEntries,
        worker_skills: workerSkills,
        worker_documents: workerDocuments,
      },
    },
  };
}
