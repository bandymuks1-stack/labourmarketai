import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Employee Lifecycle read service (EC-canonical lifecycle v1).
 *
 * Reads the CANONICAL employment record `engagement_contexts` plus the new
 * lifecycle tables with the caller's RLS-scoped client. RLS lets a lifecycle
 * row be read by the engagement's own worker, a manager of its organization
 * (the sanctioned dual-arm `manages_organization` predicate) or a platform
 * admin — this module never widens that.
 *
 * INTERNAL ONLY: this layer never sends anything anywhere — no email, no
 * SMS, no push, no webhook, no outbound call of any kind.
 *
 * Honest degradation: while the human-gated migration
 * 20260817190000_employee_lifecycle_v1 is not applied the reads see
 * 42P01/42703 and report { status: "needs-migration" } — the lifecycle
 * sections then show the calm "not available yet" state and nothing is
 * faked.
 */

import {
  LIFECYCLE_READ_LIMIT,
  deriveLifecycleStage,
  isLifecycleMigrationMissingCode,
  isValidEndedReason,
  type LifecycleEventRow,
  type LifecycleMemberRow,
  type LifecycleRunItemRow,
  type LifecycleRunRow,
  type LifecycleTemplateRow,
} from "@/lib/lifecycle/lifecycle-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

type RawRow = Record<string, unknown>;

function errCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function toRunItem(r: RawRow): LifecycleRunItemRow {
  const status = String(r.status ?? "pending");
  return {
    id: String(r.id),
    runId: String(r.run_id),
    itemOrder: Number(r.item_order),
    kind: String(r.kind ?? "custom"),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    required: r.required === true,
    status:
      status === "done" || status === "skipped" || status === "pending"
        ? status
        : "pending",
    responsibleProfileId: (r.responsible_profile_id as string | null) ?? null,
    linkedEntityType: (r.linked_entity_type as string | null) ?? null,
    linkedEntityId: (r.linked_entity_id as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
  };
}

function toRun(
  r: RawRow,
  items: readonly LifecycleRunItemRow[],
): LifecycleRunRow {
  const status = String(r.status ?? "in_progress");
  return {
    id: String(r.id),
    engagementContextId: String(r.engagement_context_id),
    status:
      status === "completed" || status === "cancelled" || status === "in_progress"
        ? status
        : "in_progress",
    templateName: (r.template_name as string | null) ?? null,
    startedAt: String(r.started_at),
    completedAt: (r.completed_at as string | null) ?? null,
    items,
  };
}

export type LifecycleOverviewResult =
  | { status: "not-authed" }
  | { status: "needs-migration" }
  | {
      status: "ok";
      members: readonly LifecycleMemberRow[];
      templates: readonly LifecycleTemplateRow[];
      onboardingRuns: ReadonlyMap<string, LifecycleRunRow>;
      offboardingRuns: ReadonlyMap<string, LifecycleRunRow>;
      events: readonly LifecycleEventRow[];
      error: boolean;
    };

/**
 * Employer-side lifecycle overview for ONE organization: every org-bound
 * engagement with its derived stage, open runs (with items), the org's
 * onboarding templates and the recent lifecycle history. RLS scopes every
 * query; `orgId` must come from the server-side employer context resolver,
 * never from the client.
 */
export async function getLifecycleOverview(
  orgId: string,
): Promise<LifecycleOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  // One probe read decides applied-vs-not (established feature-detect shape).
  const probe = await asAny(supabase)
    .from("engagement_contexts")
    .select("id, lifecycle_stage")
    .eq("organization_id", orgId)
    .limit(1);
  if (probe.error && isLifecycleMigrationMissingCode(errCode(probe.error))) {
    return { status: "needs-migration" };
  }

  // Registered owner (last-owner protection mirror in the UI — the RPC is
  // the enforcing truth). RLS-scoped read; null when not visible.
  const orgRes = await asAny(supabase)
    .from("organizations")
    .select("owner_profile_id")
    .eq("id", orgId)
    .maybeSingle();
  const ownerProfileId: string | null =
    (orgRes.data?.owner_profile_id as string | null) ?? null;

  let loadError = false;

  const [ecRes, tplRes, onbRes, offRes, evRes] = await Promise.all([
    asAny(supabase)
      .from("engagement_contexts")
      .select(
        "id, profile_id, relationship_slug, status, lifecycle_stage, probation_until, ended_reason, profiles(full_name, email)",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .limit(LIFECYCLE_READ_LIMIT),
    asAny(supabase)
      .from("onboarding_templates")
      .select("id, name, is_active, onboarding_template_items(id)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .limit(LIFECYCLE_READ_LIMIT),
    asAny(supabase)
      .from("onboarding_runs")
      .select("id, engagement_context_id, status, template_name, started_at, completed_at")
      .eq("organization_id", orgId)
      .eq("status", "in_progress")
      .limit(LIFECYCLE_READ_LIMIT),
    asAny(supabase)
      .from("offboarding_runs")
      .select("id, engagement_context_id, status, started_at, completed_at")
      .eq("organization_id", orgId)
      .eq("status", "in_progress")
      .limit(LIFECYCLE_READ_LIMIT),
    asAny(supabase)
      .from("engagement_lifecycle_events")
      .select(
        "id, engagement_context_id, action, before_stage, after_stage, note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  for (const res of [ecRes, tplRes, onbRes, offRes, evRes]) {
    if (res.error) {
      if (isLifecycleMigrationMissingCode(errCode(res.error))) {
        return { status: "needs-migration" };
      }
      loadError = true;
    }
  }

  type Prof = { full_name: string | null; email: string | null };
  const profName = (v: unknown): string => {
    const p = (Array.isArray(v) ? v[0] : v) as Prof | null | undefined;
    return p?.full_name ?? (p?.email ? p.email.split("@")[0] : "—");
  };

  const onboardingByEc = new Map<string, string>();
  for (const r of (onbRes.data ?? []) as RawRow[]) {
    onboardingByEc.set(String(r.engagement_context_id), String(r.id));
  }
  const offboardingByEc = new Map<string, string>();
  for (const r of (offRes.data ?? []) as RawRow[]) {
    offboardingByEc.set(String(r.engagement_context_id), String(r.id));
  }

  const members: LifecycleMemberRow[] = ((ecRes.data ?? []) as RawRow[]).map(
    (r) => {
      const endedReason = String(r.ended_reason ?? "");
      return {
        engagementId: String(r.id),
        profileId: String(r.profile_id),
        name: profName(r.profiles),
        relationshipSlug: String(r.relationship_slug ?? "other"),
        engagementStatus: String(r.status ?? "active"),
        stage: deriveLifecycleStage(
          String(r.status ?? "active"),
          (r.lifecycle_stage as string | null) ?? null,
        ),
        probationUntil: (r.probation_until as string | null) ?? null,
        endedReason: isValidEndedReason(endedReason) ? endedReason : null,
        isRegisteredOwner:
          ownerProfileId !== null && String(r.profile_id) === ownerProfileId,
        openOnboardingRunId: onboardingByEc.get(String(r.id)) ?? null,
        openOffboardingRunId: offboardingByEc.get(String(r.id)) ?? null,
      };
    },
  );

  const templates: LifecycleTemplateRow[] = (
    (tplRes.data ?? []) as RawRow[]
  ).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    isActive: r.is_active === true,
    itemCount: Array.isArray(r.onboarding_template_items)
      ? r.onboarding_template_items.length
      : 0,
  }));

  // Items for the OPEN runs only (bounded: open runs are few by construction
  // — one per engagement).
  const onboardingRuns = new Map<string, LifecycleRunRow>();
  const offboardingRuns = new Map<string, LifecycleRunRow>();
  const openOnbIds = [...onboardingByEc.values()];
  const openOffIds = [...offboardingByEc.values()];

  if (openOnbIds.length > 0) {
    const itemsRes = await asAny(supabase)
      .from("onboarding_run_items")
      .select(
        "id, run_id, item_order, kind, title, description, required, status, responsible_profile_id, linked_entity_type, linked_entity_id, note, completed_at",
      )
      .in("run_id", openOnbIds)
      .order("item_order", { ascending: true })
      .limit(LIFECYCLE_READ_LIMIT * 3);
    if (itemsRes.error) loadError = true;
    const byRun = new Map<string, LifecycleRunItemRow[]>();
    for (const raw of (itemsRes.data ?? []) as RawRow[]) {
      const item = toRunItem(raw);
      const list = byRun.get(item.runId) ?? [];
      list.push(item);
      byRun.set(item.runId, list);
    }
    for (const r of (onbRes.data ?? []) as RawRow[]) {
      const run = toRun(r, byRun.get(String(r.id)) ?? []);
      onboardingRuns.set(run.id, run);
    }
  }
  if (openOffIds.length > 0) {
    const itemsRes = await asAny(supabase)
      .from("offboarding_run_items")
      .select(
        "id, run_id, item_order, kind, title, description, required, status, linked_entity_type, linked_entity_id, note, completed_at",
      )
      .in("run_id", openOffIds)
      .order("item_order", { ascending: true })
      .limit(LIFECYCLE_READ_LIMIT * 3);
    if (itemsRes.error) loadError = true;
    const byRun = new Map<string, LifecycleRunItemRow[]>();
    for (const raw of (itemsRes.data ?? []) as RawRow[]) {
      const item = toRunItem(raw);
      const list = byRun.get(item.runId) ?? [];
      list.push(item);
      byRun.set(item.runId, list);
    }
    for (const r of (offRes.data ?? []) as RawRow[]) {
      const run = toRun(r, byRun.get(String(r.id)) ?? []);
      offboardingRuns.set(run.id, run);
    }
  }

  const events: LifecycleEventRow[] = ((evRes.data ?? []) as RawRow[]).map(
    (r) => ({
      id: String(r.id),
      engagementContextId: String(r.engagement_context_id),
      action: String(r.action ?? "stage_changed") as LifecycleEventRow["action"],
      beforeStage: (r.before_stage as string | null) ?? null,
      afterStage: (r.after_stage as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      createdAt: String(r.created_at),
    }),
  );

  return {
    status: "ok",
    members,
    templates,
    onboardingRuns,
    offboardingRuns,
    events,
    error: loadError,
  };
}

export type MyOnboardingResult =
  | { status: "not-authed" }
  | { status: "needs-migration" }
  | { status: "none" }
  | { status: "ok"; runs: readonly LifecycleRunRow[] };

/**
 * Worker-side view: MY open onboarding checklists (RLS already scopes runs
 * to the engagement's own worker; this narrows to open runs on my own
 * engagements).
 */
export async function getMyOnboardingRuns(): Promise<MyOnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const ecRes = await asAny(supabase)
    .from("engagement_contexts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(LIFECYCLE_READ_LIMIT);
  if (ecRes.error) {
    return isLifecycleMigrationMissingCode(errCode(ecRes.error))
      ? { status: "needs-migration" }
      : { status: "none" };
  }
  const ecIds = ((ecRes.data ?? []) as RawRow[]).map((r) => String(r.id));
  if (ecIds.length === 0) return { status: "none" };

  const runsRes = await asAny(supabase)
    .from("onboarding_runs")
    .select(
      "id, engagement_context_id, status, template_name, started_at, completed_at",
    )
    .in("engagement_context_id", ecIds)
    .eq("status", "in_progress")
    .limit(10);
  if (runsRes.error) {
    return isLifecycleMigrationMissingCode(errCode(runsRes.error))
      ? { status: "needs-migration" }
      : { status: "none" };
  }
  const runRows = (runsRes.data ?? []) as RawRow[];
  if (runRows.length === 0) return { status: "none" };

  const itemsRes = await asAny(supabase)
    .from("onboarding_run_items")
    .select(
      "id, run_id, item_order, kind, title, description, required, status, responsible_profile_id, linked_entity_type, linked_entity_id, note, completed_at",
    )
    .in(
      "run_id",
      runRows.map((r) => String(r.id)),
    )
    .order("item_order", { ascending: true })
    .limit(LIFECYCLE_READ_LIMIT * 3);
  const byRun = new Map<string, LifecycleRunItemRow[]>();
  for (const raw of ((itemsRes.data ?? []) as RawRow[])) {
    const item = toRunItem(raw);
    const list = byRun.get(item.runId) ?? [];
    list.push(item);
    byRun.set(item.runId, list);
  }

  return {
    status: "ok",
    runs: runRows.map((r) => toRun(r, byRun.get(String(r.id)) ?? [])),
  };
}
