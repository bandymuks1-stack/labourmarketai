import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  NO_READABLE_NAME,
  WORKER_NAME_FIELDS,
  resolveWorkerName,
  type WorkerNameRow,
} from "@/lib/journal/worker-name";
import { createClient } from "@/lib/supabase/server";

/**
 * The organization's ACTIVE employee engagements — the canonical membership
 * spine (`engagement_contexts`, 0013; review flag rerouted here by
 * 20260530140000) — with the CANONICAL journal-review flag per person.
 *
 * Read under the caller's RLS: `engagement_contexts_select` admits the
 * person's own rows and every row of an organization the caller manages, so
 * a non-manager simply reads nothing. Bounded (one page), no ranking, no
 * write.
 *
 * THE NAME COMES FROM A COLUMN THE MANAGER MAY READ. `profiles` RLS is
 * `id = auth.uid() OR is_admin()`, so a `profiles(...)` embed is `null` for
 * every employee the manager reviews — production walk 2026-09-05 on
 * `169df06f`: "Darbų peržiūra dar neįjungta: #8cda64" (a profile-id fragment
 * shown to a human, defect D2). `workers` RLS is `can_view_worker(id)`, which
 * admits the manager of an active employee engagement, so the shared
 * `WORKER_NAME_FIELDS` + `resolveWorkerName` (the journal surfaces' resolver,
 * guard `journal-worker-name-manager-readable`) is the canonical read. Never a
 * raw id: when nothing is readable the name is the explicit dash.
 *
 * Scale (owner constraint §1b): one indexed query on
 * (organization_id, relationship_slug, status) with a hard limit, then ONE
 * bounded `workers` read by the same page of profile ids; the caller never
 * receives a whole organization's history.
 */
export interface OrgEmployeeEngagement {
  readonly engagementId: string;
  readonly profileId: string;
  readonly name: string;
  readonly journalReviewEnabled: boolean;
}

export const ORG_EMPLOYEE_ENGAGEMENTS_LIMIT = 50;

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function listOrgEmployeeEngagements(
  organizationId: string,
): Promise<{ kind: "ok"; rows: readonly OrgEmployeeEngagement[] } | { kind: "error" }> {
  if (!UUID_RX.test(organizationId)) return { kind: "ok", rows: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "error" };
  const { data, error } = await asAny(supabase)
    .from("engagement_contexts")
    .select("id, profile_id, journal_review_enabled")
    .eq("organization_id", organizationId)
    .eq("relationship_slug", "employee")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(ORG_EMPLOYEE_ENGAGEMENTS_LIMIT);
  if (error) return { kind: "error" };
  const engagements = ((data ?? []) as {
    id: string;
    profile_id: string | null;
    journal_review_enabled: boolean | null;
  }[]).filter(
    (r): r is { id: string; profile_id: string; journal_review_enabled: boolean | null } =>
      typeof r.profile_id === "string" && r.profile_id.length > 0,
  );
  const names = await readManagerReadableNames(
    supabase,
    engagements.map((r) => r.profile_id),
  );
  if (names.kind === "error") return { kind: "error" };
  const rows: OrgEmployeeEngagement[] = engagements.map((r) => ({
    engagementId: r.id,
    profileId: r.profile_id,
    name: names.byProfileId.get(r.profile_id) ?? NO_READABLE_NAME,
    journalReviewEnabled: r.journal_review_enabled === true,
  }));
  return { kind: "ok", rows };
}

/**
 * ONE bounded `workers` read for the page of profile ids (≤ the engagement
 * page size) under the caller's RLS — the manager reads `display_name`
 * through `can_view_worker`; a person the caller may not read simply has no
 * row here and resolves to the dash.
 */
async function readManagerReadableNames(
  supabase: SupabaseClient,
  profileIds: readonly string[],
): Promise<{ kind: "ok"; byProfileId: ReadonlyMap<string, string> } | { kind: "error" }> {
  const byProfileId = new Map<string, string>();
  if (profileIds.length === 0) return { kind: "ok", byProfileId };
  const { data, error } = await asAny(supabase)
    .from("workers")
    .select(`profile_id, ${WORKER_NAME_FIELDS}`)
    .in("profile_id", profileIds.slice(0, ORG_EMPLOYEE_ENGAGEMENTS_LIMIT))
    .limit(ORG_EMPLOYEE_ENGAGEMENTS_LIMIT);
  if (error) return { kind: "error" };
  for (const w of (data ?? []) as ({ profile_id: string | null } & NonNullable<WorkerNameRow>)[]) {
    if (!w.profile_id) continue;
    byProfileId.set(w.profile_id, resolveWorkerName(w));
  }
  return { kind: "ok", byProfileId };
}
