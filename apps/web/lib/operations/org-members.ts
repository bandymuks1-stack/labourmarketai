import "server-only";
import { countedOnce, type CorrectionChainRow } from "@/lib/journal/counted-once";
import { createClient } from "@/lib/supabase/server";

/**
 * Read model for the owner's canonical org-members panel (Phase 2). All reads
 * are RLS-scoped: engagement_contexts SELECT already allows manages_organization,
 * so an owner sees their org's member engagements; company_workers/agency_workers
 * are read via owns_company/owns_agency as the source of addable workers (the
 * worker is already known to the owner via the invite/accept flow — we never
 * enumerate strangers). Writes go through the SECURITY DEFINER RPCs
 * (addOrgMember / setEngagementJournalReview), never direct table writes.
 */

/**
 * The relationship slugs that ARE an organization membership (W9 slice 1).
 * Before this slice the panel listed `employee` only, so an owner could not
 * see — let alone revoke — the `manager` engagements that actually carry
 * `manages_organization()` authority. Statuses other than 'active' are not
 * listed: an ended membership is history, not a member.
 */
export const MEMBERSHIP_SLUGS = [
  "owner",
  "manager",
  "employee",
  "collaborator",
  "consultant",
  "freelancer",
  "viewer",
  // Institution loop (2026-09-19): a learner's `student` engagement is a
  // membership of the training provider's organization — listing it is what
  // lets the existing journal-review toggle reach it. The toggle only LANDS
  // once migration 20260919210000 (relationship_types.journal_reviewable)
  // is applied; until then the RPC answers `not_a_member_engagement`, which
  // the panel already renders honestly.
  "student",
] as const;

/** The engagement slugs `review_journal_entry` accepts as a reviewer. */
const REVIEWER_SLUGS: ReadonlySet<string> = new Set(["manager", "owner", "external_manager"]);
/** The membership roles `manages_organization()` accepts (see the queue). */
const GOVERNANCE_ROLES = ["owner", "admin", "manager", "external_manager"] as const;

export type OrgMember = {
  engagementId: string;
  /** The member's profile — lets sibling surfaces (booked people, R-2 GREEN)
   *  tell "already a member" from "booked only" without a second read. */
  profileId: string | null;
  name: string;
  reviewEnabled: boolean;
  /** The relationship's journal review can be switched on — the SAME data
   *  rule `set_engagement_journal_review` applies
   *  (relationship_types.journal_reviewable), never a UI literal. */
  reviewable: boolean;
  /** Canonical relationship_slug — what this membership actually grants. */
  role: string;
  /** True when this profile is the organization's registered owner. The
   *  RPC refuses to end that membership (last-owner protection); the panel
   *  reflects the same truth instead of offering a control that would fail. */
  isRegisteredOwner: boolean;
};

export type AddableWorker = { workerId: string; name: string };

/**
 * R-4 GREEN (2026-09-19): a governance member (active `company_memberships`
 * row with a managing role) who holds NO reviewer engagement context. They
 * pass `manages_organization()` — so they SEE the review queue — but
 * `review_journal_entry` requires an active manager/owner/external_manager
 * engagement and refuses them with `no_reviewer_engagement`. The owner
 * closes that gap with the existing `grant_org_manager` RPC (owner-only).
 */
export type GovernanceWithoutReviewer = {
  profileId: string;
  name: string;
  /** The membership role, verbatim. */
  membershipRole: string;
};

export type OrgMembersData = {
  orgId: string;
  members: OrgMember[];
  addable: AddableWorker[];
  /** Whether the CURRENT viewer is the registered owner — the only actor
   *  `grant_org_manager` admits. Drives whether the control is offered. */
  viewerIsRegisteredOwner: boolean;
  governanceWithoutReviewer: GovernanceWithoutReviewer[];
};

function nameOf(p: { full_name: string | null; email: string | null } | null): string {
  return p?.full_name ?? (p?.email ? p.email.split("@")[0] : "—");
}

/** Resolve the org the current user owns for a given legacy company/agency id,
 *  plus its registered owner (needed for last-owner protection in the UI). */
async function resolveOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  legacyCol: "legacy_company_id" | "legacy_agency_id",
  legacyId: string,
): Promise<{ id: string; ownerProfileId: string | null } | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id, owner_profile_id")
    .eq(legacyCol, legacyId)
    .maybeSingle();
  if (!data?.id) return null;
  return {
    id: data.id as string,
    ownerProfileId: (data.owner_profile_id as string | null) ?? null,
  };
}

/** Owner's org members (canonical employee engagements) + workers they can add. */
export async function getOrgMembersData(
  kind: "company" | "agency",
  legacyId: string,
): Promise<OrgMembersData | null> {
  const supabase = await createClient();
  const org = await resolveOrg(
    supabase,
    kind === "company" ? "legacy_company_id" : "legacy_agency_id",
    legacyId,
  );
  if (!org) return null;
  const orgId = org.id;

  type Prof = { full_name: string | null; email: string | null };
  // Supabase may type a to-one embed as object or single-element array; normalize.
  const profName = (v: unknown): string => {
    const p = (Array.isArray(v) ? v[0] : v) as Prof | null | undefined;
    return nameOf(p ?? null);
  };

  // Canonical members: every ACTIVE membership engagement in this org (name via
  // the engagement's profile — engagement_contexts.profile_id → profiles).
  // W9 slice 1 widened this from employee-only: the manager engagements are the
  // ones that actually carry manages_organization() authority, so they have to
  // be visible before they can be revoked.
  const { data: ecRows } = await supabase
    .from("engagement_contexts")
    .select(
      "id, profile_id, relationship_slug, journal_review_enabled, profiles(full_name, email)",
    )
    .eq("organization_id", orgId)
    .in("relationship_slug", [...MEMBERSHIP_SLUGS])
    .eq("status", "active");

  // An owner cannot read another person's `profiles` row, so a member's name
  // came back "—" (production walk 2026-09-28). Fill only those from the
  // worker rows' `display_name` — what the roster on the same page shows — in
  // one bounded read, and only when some name is missing.
  const unnamed = (ecRows ?? [])
    .filter((r) => profName(r.profiles) === "—" && r.profile_id)
    .map((r) => r.profile_id as string);
  const displayByProfile = new Map<string, string>();
  if (unnamed.length > 0) {
    const { data: wRows } = await supabase
      .from("workers")
      .select("profile_id, display_name")
      .in("profile_id", unnamed);
    for (const w of (wRows ?? []) as { profile_id: string | null; display_name: string | null }[]) {
      const d = w.display_name?.trim();
      if (w.profile_id && d) displayByProfile.set(w.profile_id, d);
    }
  }
  // Which relationships may carry journal review — read from the catalog the
  // RPC itself consults. Unreadable → employee only (the previous rule), so a
  // failed read never offers a control the RPC would refuse.
  // (`journal_reviewable` is newer than the generated types — untyped read.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rtRows, error: rtError } = await (supabase as any)
    .from("relationship_types")
    .select("slug")
    .eq("journal_reviewable", true);
  const reviewableSlugs = new Set<string>(
    rtError || !rtRows ? ["employee"] : (rtRows as { slug: string }[]).map((r) => r.slug),
  );
  const members: OrgMember[] = (ecRows ?? []).map((r) => ({
    engagementId: r.id as string,
    profileId: (r.profile_id as string | null) ?? null,
    name:
      profName(r.profiles) === "—"
        ? (displayByProfile.get(r.profile_id as string) ?? "—")
        : profName(r.profiles),
    reviewEnabled: r.journal_review_enabled === true,
    reviewable: reviewableSlugs.has(String(r.relationship_slug ?? "")),
    role: (r.relationship_slug as string | null) ?? "other",
    isRegisteredOwner:
      org.ownerProfileId !== null && r.profile_id === org.ownerProfileId,
  }));
  const memberProfileIds = new Set(
    (ecRows ?? []).map((r) => r.profile_id).filter((v): v is string => Boolean(v)),
  );

  // Addable: workers already linked via the legacy invite/accept flow whose
  // profile is not yet a canonical org member.
  const linkTable = kind === "company" ? "company_workers" : "agency_workers";
  const { data: linkRows } = await supabase
    .from(linkTable)
    .select("worker_id, workers(profile_id, display_name, profiles(full_name, email))")
    .eq("status", "active");
  const addable: AddableWorker[] = (linkRows ?? [])
    .map((r) => {
      const w = (Array.isArray(r.workers) ? r.workers[0] : r.workers) as
        | { profile_id: string | null; display_name: string | null; profiles: unknown }
        | null;
      const workerId = (r as { worker_id: string | null }).worker_id;
      const profileId = w?.profile_id ?? null;
      if (!workerId || !profileId || memberProfileIds.has(profileId)) return null;
      // The worker row's own display name first: an owner cannot read another
      // person's `profiles` row, so that embed comes back empty and the option
      // read "—" (production walk 2026-09-28). The roster on the same page
      // shows this same `display_name`.
      const display = w?.display_name?.trim();
      return { workerId, name: display || profName(w?.profiles) };
    })
    .filter((x): x is AddableWorker => x !== null);

  // R-4 GREEN: governance members who can see the queue but cannot confirm.
  // Read under the membership SELECT policy (an active org member reads the
  // organization's memberships); compared against the engagement rows read
  // above. Bounded: an organization's managing memberships are a short list.
  const reviewerProfileIds = new Set(
    (ecRows ?? [])
      .filter((r) => REVIEWER_SLUGS.has(String(r.relationship_slug ?? "")))
      .map((r) => r.profile_id)
      .filter((v): v is string => Boolean(v)),
  );
  const { data: membershipRows } = await supabase
    .from("company_memberships")
    .select("profile_id, role, profiles(full_name, email)")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("role", [...GOVERNANCE_ROLES])
    .limit(100);
  const governanceWithoutReviewer: GovernanceWithoutReviewer[] = (membershipRows ?? [])
    .map((r) => {
      const profileId = (r.profile_id as string | null) ?? null;
      if (!profileId || reviewerProfileIds.has(profileId)) return null;
      // The registered owner is never listed: ensure_org_owner_engagement
      // gives them the owner engagement, and they are the grantor anyway.
      if (org.ownerProfileId !== null && profileId === org.ownerProfileId) return null;
      return {
        profileId,
        name: profName(r.profiles),
        membershipRole: String(r.role ?? ""),
      };
    })
    .filter((x): x is GovernanceWithoutReviewer => x !== null);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerIsRegisteredOwner =
    org.ownerProfileId !== null && user?.id === org.ownerProfileId;

  return { orgId, members, addable, viewerIsRegisteredOwner, governanceWithoutReviewer };
}

/**
 * HOW MANY PEOPLE HAVE RECORDED WORK NOBODY CAN CONFIRM. Review is opt-in per
 * engagement (`journal_review_enabled`); when it is off, a worker's entries are
 * in no queue, so an owner who never opened the per-worker toggle had no way to
 * learn that real work was being recorded. This counts distinct members with
 * live entries in the last 30 days in the organization's reviewable engagements
 * where review is OFF — the same read shape as the journal window report, under
 * the caller's own RLS (an org manager). It does NOT enable anything and it is
 * never called "awaiting review": nobody can act on those entries yet.
 *
 * Returns null on any read error — never a fabricated 0 (SEP-7).
 */
export async function countWorkersWithUnconfirmableWork(
  orgId: string,
  days = 30,
): Promise<number | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rtRows, error: rtError } = await (supabase as any)
    .from("relationship_types")
    .select("slug")
    .eq("journal_reviewable", true);
  const reviewable: string[] =
    rtError || !rtRows ? ["employee"] : (rtRows as { slug: string }[]).map((r) => r.slug);
  const { data: ecs, error: ecError } = await supabase
    .from("engagement_contexts")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .eq("journal_review_enabled", false)
    .in("relationship_slug", reviewable);
  if (ecError) return null;
  const ids = (ecs ?? []).map((e) => e.id as string);
  if (ids.length === 0) return 0;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: entries, error: entryError } = await supabase
    .from("journal_entries")
    .select("id, correction_of, engagement_context_id")
    .in("engagement_context_id", ids)
    .is("superseded_by", null)
    .is("deleted_at", null)
    .gte("created_at", since)
    .limit(1000);
  if (entryError) return null;
  // Counted once per correction chain (counted-once.ts). This figure is a
  // DISTINCT-context count, so a corrected original and its correction (same
  // context) never changed it — the rule is applied anyway so every journal
  // reader states the same population.
  return new Set(
    countedOnce((entries ?? []) as unknown as (CorrectionChainRow & { engagement_context_id: string })[]).map(
      (e) => e.engagement_context_id,
    ),
  ).size;
}
