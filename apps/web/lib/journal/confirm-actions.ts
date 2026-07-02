"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeConfidence } from "./confidence";

const MANAGER_RELATIONSHIPS = ["manager", "owner", "external_manager"];

type DB = Awaited<ReturnType<typeof createClient>>;

/** Resolve the manager's authorising engagement for an entry: they must hold
 *  an active manager/owner engagement in the same organization the entry's
 *  engagement context points at (§13.2, §4 default-closed). */
async function authorizeManager(
  supabase: DB,
  profileId: string,
  entryEngagementId: string,
): Promise<{ engagementId: string; role: string; orgId: string } | null> {
  const { data: entryEc } = await supabase
    .from("engagement_contexts")
    .select("organization_id")
    .eq("id", entryEngagementId)
    .maybeSingle();
  const orgId = entryEc?.organization_id ?? null;
  if (!orgId) return null;

  const { data: mgrEc } = await supabase
    .from("engagement_contexts")
    .select("id, relationship_slug")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("relationship_slug", MANAGER_RELATIONSHIPS)
    .limit(1)
    .maybeSingle();
  if (!mgrEc) return null;
  return { engagementId: mgrEc.id, role: mgrEc.relationship_slug, orgId };
}

/** Inline confidence recompute (§6.1) for every worker_skill under the entry's
 *  profession, scoped to the worker. M1 has no entry↔skill link, so counts are
 *  taken at the (worker, profession) granularity and applied uniformly. */
async function recomputeProfessionSkills(
  supabase: DB,
  workerId: string,
  professionId: string | null,
) {
  const { data: psRows } = await supabase
    .from("profession_skills")
    .select("skill_id")
    .eq("profession_id", professionId ?? "");
  const skillIds = (psRows ?? []).map((r) => r.skill_id);
  if (skillIds.length === 0) return;

  // entries for this (worker, profession)
  let entryQuery = supabase
    .from("journal_entries")
    .select("id")
    .eq("worker_id", workerId);
  entryQuery = professionId
    ? entryQuery.eq("profession_id", professionId)
    : entryQuery.is("profession_id", null);
  const { data: entryRows } = await entryQuery;
  const entryIds = (entryRows ?? []).map((r) => r.id);
  const selfLoggedEntries = entryIds.length;

  let managerConfirmedEntries = 0;
  let uniqueConfirmers = 0;
  let lastConfirmationAt: Date | null = null;
  if (entryIds.length > 0) {
    const { data: confs } = await supabase
      .from("journal_entry_confirmations")
      .select("entry_id, confirmer_id, confirmation_scope, created_at")
      .in("entry_id", entryIds);
    const confirmedEntryIds = new Set<string>();
    const confirmers = new Set<string>();
    for (const c of confs ?? []) {
      const action = (c.confirmation_scope as { action?: string } | null)?.action;
      // Only an explicit approval ('confirm') counts toward confidence — a
      // 'reject' or 'request_changes' evidence row never verifies skills.
      if (action !== "confirm") continue;
      confirmedEntryIds.add(c.entry_id);
      confirmers.add(c.confirmer_id);
      const ts = new Date(c.created_at);
      if (!lastConfirmationAt || ts > lastConfirmationAt) lastConfirmationAt = ts;
    }
    managerConfirmedEntries = confirmedEntryIds.size;
    uniqueConfirmers = confirmers.size;
  }

  const { score, bin } = computeConfidence({
    managerConfirmedEntries,
    selfLoggedEntries,
    uniqueConfirmers,
    lastConfirmationAt,
  });

  await supabase
    .from("worker_skills")
    .update({
      confidence_score: score,
      confidence_bin: bin,
      last_recompute_at: new Date().toISOString(),
    })
    .eq("worker_id", workerId)
    .in("skill_id", skillIds);
}

/** Side effects of an APPROVED review (the verified-skill loop, §13.2): mark
 *  the worker's self-declared skills under the entry's profession as verified,
 *  then recompute confidence. Shared by the legacy confirmEntry and the gated
 *  reviewJournalEntry action so approval behaves identically on both paths. */
export async function applyApprovalSkillEffects(
  supabase: DB,
  {
    workerId,
    professionId,
    confirmerId,
  }: { workerId: string; professionId: string | null; confirmerId: string },
): Promise<void> {
  if (professionId) {
    const { data: psRows } = await supabase
      .from("profession_skills")
      .select("skill_id")
      .eq("profession_id", professionId);
    const skillIds = (psRows ?? []).map((r) => r.skill_id);
    if (skillIds.length > 0) {
      await supabase
        .from("worker_skills")
        .update({
          verified: true,
          verified_by: confirmerId,
          verified_at: new Date().toISOString(),
        })
        .eq("worker_id", workerId)
        .eq("source", "self_declared")
        .in("skill_id", skillIds);
    }
  }
  await recomputeProfessionSkills(supabase, workerId, professionId);
}

/** Manager confirms a journal entry → verified-skill loop closes (§13.2).
 *  Appends an append-only confirmation, marks the worker's self-declared
 *  skills under the profession as verified, and recomputes confidence. */
export async function confirmEntry(formData: FormData): Promise<void> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt");
  if (!entryId) throw new Error("entry_id required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id, worker_id, engagement_context_id, profession_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) throw new Error("Entry not found");

  const auth = await authorizeManager(supabase, user.id, entry.engagement_context_id);
  if (!auth) throw new Error("Not authorized to confirm this entry");

  const { error: cErr } = await supabase.from("journal_entry_confirmations").insert({
    entry_id: entry.id,
    confirmer_id: user.id,
    confirmer_engagement_context_id: auth.engagementId,
    confirmer_role: auth.role,
    confirmation_scope: { action: "confirm", skills_confirmed: [], metrics_confirmed: [] },
  });
  if (cErr) throw new Error(`confirmation insert failed: ${cErr.message}`);

  // M1: approval verifies all the worker's self-declared skills under this
  // entry's profession (selective scoping arrives in M2) + recomputes
  // confidence. Shared with the gated reviewJournalEntry approval path.
  await applyApprovalSkillEffects(supabase, {
    workerId: entry.worker_id,
    professionId: entry.profession_id,
    confirmerId: user.id,
  });
  revalidatePath(`/${locale}/dashboard/inbox`);
  revalidatePath(`/${locale}/dashboard/journal`);
}

/** Manager rejects an entry → append-only confirmation with a reason note;
 *  no verification, no confidence change. */
export async function rejectEntry(formData: FormData): Promise<void> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt");
  if (!entryId) throw new Error("entry_id required");
  // Bounded free text: the reason lands in jsonb with no DB-side cap.
  if (reason.length > 2000) throw new Error("reason too long (max 2000 chars)");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id, engagement_context_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) throw new Error("Entry not found");

  const auth = await authorizeManager(supabase, user.id, entry.engagement_context_id);
  if (!auth) throw new Error("Not authorized to reject this entry");

  const { error } = await supabase.from("journal_entry_confirmations").insert({
    entry_id: entry.id,
    confirmer_id: user.id,
    confirmer_engagement_context_id: auth.engagementId,
    confirmer_role: auth.role,
    confirmation_scope: { action: "reject", reason },
  });
  if (error) throw new Error(`rejection insert failed: ${error.message}`);

  revalidatePath(`/${locale}/dashboard/inbox`);
}
