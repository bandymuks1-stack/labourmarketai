"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { listMyOrganizationEvidence } from "@/lib/organization-evidence/import-core";
import { readSubjectCompetencySignals } from "@/lib/organization-evidence/competency-signals-read";

/**
 * THE PERSON ACCEPTS a skill their organization's records named — the
 * ACCEPT of WORK → EVIDENCE → SUGGESTION → ACCEPT/REJECT → COMPETENCY for
 * imported history (2026-09-20).
 *
 * What it writes is the SAME row the journal's candidate confirmation
 * writes (`skill-pipeline-actions.ts` → `addSkillAndLink`): a `worker_skills`
 * row with `source: "self_declared"`, `verified: false`, `confidence_bin:
 * "yellow"`. The person's acceptance is a self-declaration backed by the
 * organization's words — never a verification, never a manager
 * confirmation, and `source` is the table's own closed set (the constraint
 * admits self_declared / work_journal / manager_confirmed; "organization
 * history" is the SUGGESTION's provenance, said in the copy, not a fourth
 * value invented here).
 *
 * MEMBERSHIP IS RE-DERIVED on the server, as the journal's decisions are:
 * the slug must be named by a competency signal on a record whose roster
 * row is LINKED to the caller. A slug the organization never named, or one
 * from a record about somebody else, is refused — the form is not trusted.
 */

const SLUG_RE = /^[a-z0-9_-]{1,64}$/;

export type AcceptOrganizationHistorySkillResult =
  | { readonly ok: true; readonly added: boolean }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "invalid"
        | "no_worker"
        | "not_named"
        | "skill_not_found"
        | "write_failed";
    };

export async function acceptOrganizationHistorySkillAction(
  slug: string,
): Promise<AcceptOrganizationHistorySkillResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, code: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const { data: workerRow } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const workerId = (workerRow?.id as string | null) ?? null;
  if (!workerId) return { ok: false, code: "no_worker" };

  // Membership: the caller's OWN linked history, then its signals.
  const mine = await listMyOrganizationEvidence({ supabase, userId: user.id }, { limit: 100 });
  if (mine.kind !== "ok") return { ok: false, code: "not_named" };
  const signals = await readSubjectCompetencySignals(
    supabase,
    mine.records.filter((r) => !r.withdrawn).map((r) => r.id),
  );
  if (signals.kind !== "ok" || !signals.signals.some((s) => s.slug === slug)) {
    return { ok: false, code: "not_named" };
  }

  const { data: skill } = await supabase
    .from("skills")
    .select("id, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (!skill?.id || skill.is_active === false) return { ok: false, code: "skill_not_found" };

  const { data: owned } = await supabase
    .from("worker_skills")
    .select("skill_id")
    .eq("worker_id", workerId)
    .eq("skill_id", skill.id)
    .maybeSingle();
  if (owned?.skill_id) return { ok: true, added: false };

  const ins = await supabase.from("worker_skills").upsert(
    [
      {
        worker_id: workerId,
        skill_id: skill.id,
        verified: false,
        source: "self_declared",
        confidence_bin: "yellow",
      },
    ],
    { onConflict: "worker_id,skill_id", ignoreDuplicates: true },
  );
  if (ins.error) {
    console.error("[evidence] organization-history skill accept failed:", ins.error.code);
    return { ok: false, code: "write_failed" };
  }
  try {
    revalidatePath("/[locale]/dashboard/profile", "page");
    revalidatePath("/[locale]/dashboard/journal", "page");
  } catch {
    /* freshness hint only */
  }
  return { ok: true, added: true };
}
