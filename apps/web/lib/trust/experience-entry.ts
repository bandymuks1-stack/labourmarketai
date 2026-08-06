import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getManagedOrganizationIds } from "@/lib/company/managed-organizations";
import {
  deriveReviewEligibility,
  type EligibleInteractionKind,
  type ExistingRecordRef,
  type InteractionFacts,
} from "./experience-eligibility";
// The token grammar is PURE and shared with the client hook — one definition,
// so the two sides cannot disagree about what a valid token is.
import { parseInteractionToken } from "./experience-interaction-token";

export { parseInteractionToken, serializeInteractionToken } from "./experience-interaction-token";

/**
 * W6 slice 3D — the ENTRY POINT to the experience domain.
 *
 * THE GAP THIS CLOSES. `ExperienceSubmitForm` existed since slice 3B with no
 * mount point at all: submitting needs an eligible finished interaction as
 * context, and nothing handed it one. The temptation was a "leave a review"
 * button on the profile, the CV, the person page or the experiences result —
 * and every one of those is a generic button that would force the SERVER to
 * accept a client-chosen subject. The owner directive forbids all of them,
 * and it is right to: a generic entry point makes the interaction an argument
 * instead of a fact.
 *
 * SO THE ENTRY POINT IS THE INTERACTION ITSELF. This module answers exactly
 * two questions, both entirely server-side:
 *
 *   1. `listExperienceInvitations()` — which REAL interactions of mine could
 *      ground an experience right now, and what is the honest state of each
 *      (can submit / already submitted / not yet)?
 *   2. `loadExperienceSubmitContext(kind, id)` — for ONE named interaction,
 *      may this viewer submit, and who is the subject?
 *
 * WHAT THE CLIENT MAY NOT DECIDE. The client sends a kind and an interaction
 * id and NOTHING else that matters. The subject is RESOLVED HERE from the
 * canonical row — never accepted from the caller — so a forged
 * subject/interaction pair cannot even be expressed. Participation, completion
 * and duplicate state are re-derived here too. And this is still not the
 * security boundary: `submit_experience_record` re-derives all of it a second
 * time in SQL under `security definer`. Two independent derivations, because
 * the UI layer is allowed to be wrong.
 *
 * THE ELIGIBILITY DOCTRINE IS NOT RELAXED TO SUIT THE UI. Completion is read
 * through `isInteractionCompleted` from the pure contract, which is the same
 * predicate the SQL encodes. Where the contract is conservative (an accepted
 * booking grounds nothing before its start date) this module is conservative
 * in exactly the same way, and a surface that finds that inconvenient renders
 * "not yet" rather than widening the rule.
 *
 * FAIL-CLOSED. Every read degrades to `unavailable` when the owner-gated
 * domain migration is unapplied — never an invented invitation, never a
 * silently empty list presented as "nothing to describe".
 */

export type ExperienceInvitationState =
  /** A real completed interaction, this viewer is a party, nothing submitted. */
  | "eligible"
  /** This viewer already submitted for this interaction — one record, ever. */
  | "already_submitted"
  /** The interaction exists but is not completed yet (contract-conservative). */
  | "not_yet";

export type ExperienceInvitation = {
  readonly kind: EligibleInteractionKind;
  readonly interactionId: string;
  /** Resolved HERE from the canonical row — never supplied by a caller. */
  readonly subjectType: "worker" | "organization";
  readonly subjectId: string;
  /**
   * A short non-identifying context string the viewer already sees on their
   * own surfaces (a booking's role text, an engagement's title). Deliberately
   * NOT a person's name: the parties already know each other, and a label is
   * not a place to widen what a surface discloses.
   */
  readonly contextLabel: string | null;
  readonly state: ExperienceInvitationState;
  /** Set only for `already_submitted`. */
  readonly existingRecordId?: string;
};

export type ExperienceInvitationsResult =
  | { readonly state: "list"; readonly invitations: readonly ExperienceInvitation[] }
  | { readonly state: "unavailable" }
  | { readonly state: "not_authenticated" }
  | { readonly state: "error" };

export type ExperienceSubmitContext =
  | {
      readonly state: "eligible";
      readonly kind: EligibleInteractionKind;
      readonly interactionId: string;
      readonly subjectType: "worker" | "organization";
      readonly subjectId: string;
      readonly contextLabel: string | null;
    }
  | {
      readonly state: "already_submitted";
      readonly existingRecordId: string;
    }
  /** Deliberately coarse: the person is told the real product state, not which
   *  internal predicate said no. `not_a_party` in particular must not become an
   *  oracle for "this interaction exists". */
  | { readonly state: "not_eligible"; readonly reason: "not_yet" | "not_available" }
  | { readonly state: "unavailable" }
  | { readonly state: "not_authenticated" }
  | { readonly state: "error" };

/** RPC/relation absent (migration unapplied) — the fail-closed signal. */
const ABSENT_CODES = new Set(["42883", "PGRST202", "42P01", "PGRST205"]);

function isAbsent(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && ABSENT_CODES.has(error.code ?? ""));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * The three canonical interaction reads, each returning `InteractionFacts` in
 * the pure contract's shape plus the resolved subject.
 *
 * Every one of them filters on the viewer EXPLICITLY. RLS already restricts
 * these tables, but "the policy would have stopped it" is not a reason to send
 * a query that asks for someone else's rows — and the party check is the thing
 * that decides who the subject is, so it cannot live in a policy anyway.
 */
type ResolvedInteraction = {
  facts: InteractionFacts;
  subjectType: "worker" | "organization";
  subjectId: string;
  contextLabel: string | null;
};

async function readBookings(
  supabase: Db,
  viewerId: string,
  onlyId?: string,
): Promise<ResolvedInteraction[] | "absent"> {
  let q = supabase
    .from("booking_requests")
    .select("id, owner_id, organization_id, status, start_date, role_text, workers(profile_id)")
    .eq("status", "accepted");
  if (onlyId) q = q.eq("id", onlyId);
  const { data, error } = await q.limit(200);
  if (error) return isAbsent(error) ? "absent" : [];

  const out: ResolvedInteraction[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const workerRel = row.workers as { profile_id?: string } | { profile_id?: string }[] | null;
    const workerProfile = Array.isArray(workerRel)
      ? (workerRel[0]?.profile_id ?? null)
      : (workerRel?.profile_id ?? null);
    const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
    const orgId = typeof row.organization_id === "string" ? row.organization_id : null;
    if (!workerProfile || !ownerId) continue;
    // The viewer must be one of the two real parties; the OTHER party is the
    // subject. This is where "who is this about" is decided — from the row.
    //
    // W6 author/subject correction: since org demand spine v2 a booking can
    // belong to an ORGANIZATION. When it does, the employer party IS that
    // organization — so the worker's experience gets an ORGANIZATION subject,
    // never the owner's private profile. This was the recorded W6 modelling
    // defect (employer-subject rows stored as subject_type='worker').
    let subjectType: "worker" | "organization" | null = null;
    let subjectId: string | null = null;
    if (viewerId === ownerId) {
      subjectType = "worker";
      subjectId = workerProfile;
    } else if (viewerId === workerProfile) {
      if (orgId) {
        subjectType = "organization";
        subjectId = orgId;
      } else {
        subjectType = "worker";
        subjectId = ownerId;
      }
    }
    if (!subjectType || !subjectId) continue;
    out.push({
      facts: {
        kind: "accepted_booking",
        interactionId: String(row.id),
        // Mirrors the engagement pattern: when the subject is the
        // ORGANIZATION, the two contract parties are the authoring worker and
        // that organization — so the party check proves subject membership,
        // not merely author identity. In every person-subject direction the
        // parties stay the two real people.
        partyA: subjectType === "organization" ? workerProfile : ownerId,
        partyB: subjectType === "organization" ? subjectId : workerProfile,
        status: String(row.status ?? ""),
        startDateIso: (row.start_date as string | null) ?? null,
      },
      subjectType,
      subjectId,
      contextLabel: (row.role_text as string | null) ?? null,
    });
  }
  return out;
}

async function readEngagements(
  supabase: Db,
  viewerId: string,
  managedOrgIds: readonly string[],
  onlyId?: string,
): Promise<ResolvedInteraction[] | "absent"> {
  let q = supabase
    .from("engagement_contexts")
    .select("id, profile_id, organization_id, status, ended_at, title");
  if (onlyId) q = q.eq("id", onlyId);
  const { data, error } = await q.limit(200);
  if (error) return isAbsent(error) ? "absent" : [];

  const out: ResolvedInteraction[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const profileId = typeof row.profile_id === "string" ? row.profile_id : null;
    const orgId = typeof row.organization_id === "string" ? row.organization_id : null;
    if (!profileId || !orgId) continue;

    // Two directions, and they produce DIFFERENT subject types — which is the
    // whole reason the subject cannot come from the client:
    //   worker → describes the ORGANIZATION they worked for;
    //   org manager → describes the WORKER who was engaged.
    let subjectType: "worker" | "organization" | null = null;
    let subjectId: string | null = null;
    if (viewerId === profileId) {
      subjectType = "organization";
      subjectId = orgId;
    } else if (managedOrgIds.includes(orgId)) {
      subjectType = "worker";
      subjectId = profileId;
    }
    if (!subjectType || !subjectId) continue;

    out.push({
      facts: {
        kind: "completed_engagement",
        interactionId: String(row.id),
        // The contract's party check compares the author AND the subject
        // against these two, and an engagement's two sides are asymmetric:
        // one is always the engaged PROFILE, the other is whichever side the
        // viewer is not. When the worker authors, the second party is the
        // ORGANIZATION they are describing; when a manager authors for the
        // organization, the second party is that manager. Writing `viewerId`
        // for both directions would have let the party check pass on identity
        // alone and stopped proving anything.
        partyA: profileId,
        partyB: subjectType === "organization" ? subjectId : viewerId,
        status: String(row.status ?? ""),
        endedAtIso: (row.ended_at as string | null) ?? null,
      },
      subjectType,
      subjectId,
      contextLabel: (row.title as string | null) ?? null,
    });
  }
  return out;
}

async function readServiceRequests(
  supabase: Db,
  viewerId: string,
  onlyId?: string,
): Promise<ResolvedInteraction[] | "absent"> {
  let q = supabase
    .from("service_offering_requests")
    .select("id, buyer_id, provider_id, status")
    .eq("status", "accepted");
  if (onlyId) q = q.eq("id", onlyId);
  const { data, error } = await q.limit(200);
  if (error) return isAbsent(error) ? "absent" : [];

  const out: ResolvedInteraction[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const buyer = typeof row.buyer_id === "string" ? row.buyer_id : null;
    const provider = typeof row.provider_id === "string" ? row.provider_id : null;
    if (!buyer || !provider) continue;
    let subjectId: string | null = null;
    if (viewerId === buyer) subjectId = provider;
    else if (viewerId === provider) subjectId = buyer;
    if (!subjectId) continue;
    out.push({
      facts: {
        kind: "concluded_service_request",
        interactionId: String(row.id),
        partyA: buyer,
        partyB: provider,
        status: String(row.status ?? ""),
      },
      subjectType: "worker",
      subjectId,
      contextLabel: null,
    });
  }
  return out;
}

/** The viewer's OWN experience records, as eligibility-contract refs. */
async function readOwnRecords(
  supabase: Db,
  viewerId: string,
): Promise<{ refs: ExistingRecordRef[]; byInteraction: Map<string, string> } | "absent"> {
  const { data, error } = await supabase
    .from("experience_records")
    .select(
      "id, author_profile_id, subject_profile_id, subject_organization_id, interaction_kind, interaction_id",
    )
    .eq("author_profile_id", viewerId)
    .limit(500);
  if (error) return isAbsent(error) ? "absent" : { refs: [], byInteraction: new Map() };

  const refs: ExistingRecordRef[] = [];
  const byInteraction = new Map<string, string>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const kind = String(row.interaction_kind ?? "") as EligibleInteractionKind;
    const interactionId = String(row.interaction_id ?? "");
    refs.push({
      authorProfileId: String(row.author_profile_id ?? ""),
      subjectProfileId: String(row.subject_profile_id ?? row.subject_organization_id ?? ""),
      interactionKind: kind,
      interactionId,
    });
    byInteraction.set(`${kind}:${interactionId}`, String(row.id));
  }
  return { refs, byInteraction };
}

/** Organizations the viewer may act for. An engagement's org side is only
 *  the viewer's to describe when they actually manage that organization.
 *  Uses the manages_organization() SQL-truth mirror (engagement arm +
 *  membership arm) — the previous owner-only read was strictly narrower than
 *  what the RPC accepts, so admin/manager members saw no org-side
 *  invitations at all. */
async function managedOrganizationIds(): Promise<string[]> {
  return getManagedOrganizationIds();
}

/**
 * Every interaction of the viewer's that the experience domain recognises,
 * with its honest state. An empty list is a real answer ("nothing you have
 * finished is describable yet") and is rendered as such — never as a prompt.
 */
export async function listExperienceInvitations(): Promise<ExperienceInvitationsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "not_authenticated" };

  const nowIso = new Date().toISOString();
  const managed = await managedOrganizationIds();

  const [bookings, engagements, services, own] = await Promise.all([
    readBookings(supabase, user.id),
    readEngagements(supabase, user.id, managed),
    readServiceRequests(supabase, user.id),
    readOwnRecords(supabase, user.id),
  ]);

  // The experience store itself being absent is the fail-closed case: without
  // it we cannot know what was already submitted, so we must not invite.
  if (own === "absent") return { state: "unavailable" };
  if (bookings === "absent" || engagements === "absent" || services === "absent") {
    return { state: "unavailable" };
  }

  const invitations: ExperienceInvitation[] = [];
  for (const r of [...bookings, ...engagements, ...services]) {
    const existingRecordId = own.byInteraction.get(
      `${r.facts.kind}:${r.facts.interactionId}`,
    );
    if (existingRecordId) {
      invitations.push({
        kind: r.facts.kind,
        interactionId: r.facts.interactionId,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        contextLabel: r.contextLabel,
        state: "already_submitted",
        existingRecordId,
      });
      continue;
    }
    const verdict = deriveReviewEligibility({
      authorProfileId: user.id,
      subjectProfileId: r.subjectId,
      interaction: r.facts,
      existingRecords: own.refs,
      nowIso,
    });
    if (verdict.eligible) {
      invitations.push({ ...invitationBase(r), state: "eligible" });
    } else if (verdict.reason === "interaction_not_completed") {
      invitations.push({ ...invitationBase(r), state: "not_yet" });
    }
    // Any other denial (not a party, self-review, unknown kind) means this
    // row should not have been offered at all — it is dropped silently rather
    // than shown as a blocked invitation, because naming it would confirm the
    // interaction exists to someone the contract says is not part of it.
  }

  return { state: "list", invitations };
}

function invitationBase(r: ResolvedInteraction): Omit<ExperienceInvitation, "state"> {
  return {
    kind: r.facts.kind,
    interactionId: r.facts.interactionId,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    contextLabel: r.contextLabel,
  };
}

/**
 * The gate the submit form mounts behind. Given ONLY a kind and an id, decide
 * whether this viewer may describe this interaction — and resolve who the
 * subject is.
 *
 * A caller that names an interaction they are not part of, or one that does
 * not exist, gets the SAME `not_available` answer. That is deliberate: two
 * distinct answers would turn this into an existence oracle for interactions
 * between other people.
 */
export async function loadExperienceSubmitContext(
  kind: EligibleInteractionKind,
  interactionId: string,
): Promise<ExperienceSubmitContext> {
  // Re-validated HERE even though the action already parsed it: this function
  // is exported and a future caller must not be able to skip the grammar.
  if (!parseInteractionToken(`${kind}:${interactionId}`)) {
    return { state: "not_eligible", reason: "not_available" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "not_authenticated" };

  const own = await readOwnRecords(supabase, user.id);
  if (own === "absent") return { state: "unavailable" };

  const managed = kind === "completed_engagement" ? await managedOrganizationIds() : [];
  const found =
    kind === "accepted_booking"
      ? await readBookings(supabase, user.id, interactionId)
      : kind === "completed_engagement"
        ? await readEngagements(supabase, user.id, managed, interactionId)
        : await readServiceRequests(supabase, user.id, interactionId);
  if (found === "absent") return { state: "unavailable" };

  const match = found.find((r) => r.facts.interactionId === interactionId);
  // Not found, or found but the viewer is not a party — one answer, on purpose.
  if (!match) return { state: "not_eligible", reason: "not_available" };

  const existingRecordId = own.byInteraction.get(`${kind}:${interactionId}`);
  if (existingRecordId) return { state: "already_submitted", existingRecordId };

  const verdict = deriveReviewEligibility({
    authorProfileId: user.id,
    subjectProfileId: match.subjectId,
    interaction: match.facts,
    existingRecords: own.refs,
    nowIso: new Date().toISOString(),
  });
  if (!verdict.eligible) {
    return {
      state: "not_eligible",
      reason: verdict.reason === "interaction_not_completed" ? "not_yet" : "not_available",
    };
  }

  return {
    state: "eligible",
    kind,
    interactionId,
    // Resolved from the canonical row. The form carries these so the RPC has
    // something to compare against — and the RPC re-derives them regardless.
    subjectType: match.subjectType,
    subjectId: match.subjectId,
    contextLabel: match.contextLabel,
  };
}
