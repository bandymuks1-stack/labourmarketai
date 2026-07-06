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

  const [{ data: profile }, { data: consents }, { data: workers }] =
    await Promise.all([
      db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      db.from("consents").select("*").eq("profile_id", user.id),
      db.from("workers").select("*").eq("profile_id", user.id),
    ]);

  const workerIds: string[] = ((workers ?? []) as { id: string }[]).map(
    (w) => w.id,
  );

  let journalEntries: unknown[] = [];
  let workerSkills: unknown[] = [];
  let workerDocuments: unknown[] = [];
  if (workerIds.length > 0) {
    const [journalRes, skillsRes, docsRes] = await Promise.all([
      db.from("journal_entries").select("*").in("worker_id", workerIds),
      db.from("worker_skills").select("*").in("worker_id", workerIds),
      db.from("worker_documents").select("*").in("worker_id", workerIds),
    ]);
    journalEntries = journalRes.data ?? [];
    workerSkills = skillsRes.data ?? [];
    workerDocuments = docsRes.data ?? [];
  }

  return {
    kind: "ok",
    bundle: {
      format: "labourmarket.ai-personal-data-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      userId: user.id,
      excluded: EXCLUDED_NOTE,
      data: {
        profile: profile ?? null,
        consents: consents ?? [],
        workers: workers ?? [],
        journal_entries: journalEntries,
        worker_skills: workerSkills,
        worker_documents: workerDocuments,
      },
    },
  };
}
