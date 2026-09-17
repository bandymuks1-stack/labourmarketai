/**
 * Canonical invitation model (core-network area B) — pure, shared by the
 * server actions, the UI and the guard tests. No IO.
 */

export const INVITATION_TYPES = [
  "join_platform",
  "join_organization",
  "join_team",
  "join_as_employee",
  "collaborate_partner",
  "join_project",
  "invite_company",
  // Universal invitation/referral network v1 (20260917120000): THE EMPLOYER
  // FOUND THE PERSON. Targets the canonical demand object (customer_requests)
  // and never a vacancy copy. Acceptance records EMPLOYER_INVITED_TO_TARGET
  // (an interest row whose snapshot names its basis), never a system match.
  "invite_to_demand",
] as const;
export type InvitationType = (typeof INVITATION_TYPES)[number];

export function isInvitationType(v: string | undefined): v is InvitationType {
  return (INVITATION_TYPES as readonly string[]).includes(v ?? "");
}

/** Types that require an organization context. */
export const ORG_INVITATION_TYPES: readonly InvitationType[] = [
  "join_organization",
  "join_team",
  "join_as_employee",
  "collaborate_partner",
];

/** Types whose target is a demand (customer_requests) — the reverse-discovery
 *  path: employer finds person, employer invites, person decides. */
export const DEMAND_INVITATION_TYPES: readonly InvitationType[] = ["invite_to_demand"];

/**
 * MULTI-USE BOUNDS — mirrors `create_invitation_v2`, which is the enforcement
 * point. A campaign link belongs to a context someone is answerable for (an
 * organization, a project, a need): up to 500 seats. A plain "invite a
 * colleague" link is crew-sized: up to 20. 1 = single-use, the default and
 * every pre-existing invitation.
 */
export const MAX_CAMPAIGN_USES_WITH_CONTEXT = 500;
export const MAX_CAMPAIGN_USES_WITHOUT_CONTEXT = 20;
export const MAX_INVITATION_EXPIRY_DAYS = 90;
export const DEFAULT_INVITATION_EXPIRY_DAYS = 14;

/** Whether `type` carries a context an organization/project/need owner is
 *  answerable for — the condition for a larger campaign. Pure. */
export function invitationTypeHasContext(type: InvitationType | string): boolean {
  return (
    (ORG_INVITATION_TYPES as readonly string[]).includes(type) ||
    type === "join_project" ||
    (DEMAND_INVITATION_TYPES as readonly string[]).includes(type)
  );
}

/** The seat count a sender may ask for, clamped to what the RPC will accept
 *  for this type. Never widens; a forged larger value is refused server-side. */
export function clampCampaignUses(type: InvitationType | string, requested: number): number {
  const max = invitationTypeHasContext(type)
    ? MAX_CAMPAIGN_USES_WITH_CONTEXT
    : MAX_CAMPAIGN_USES_WITHOUT_CONTEXT;
  if (!Number.isFinite(requested)) return 1;
  return Math.min(Math.max(1, Math.floor(requested)), max);
}

export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "revoked",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const DELIVERY_STATUSES = ["not_sent", "sent", "delivery_failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** One send action covers at most this many addresses — a deliberate,
 *  visible cap; bulk blasting is not a product feature. */
export const MAX_EMAILS_PER_ACTION = 10;

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface ParsedEmailList {
  /** Deduped, lowercased valid addresses (bounded by MAX_EMAILS_PER_ACTION). */
  readonly valid: readonly string[];
  /** Entries that are not a valid address — surfaced, never silently dropped. */
  readonly invalid: readonly string[];
  /** Valid addresses beyond the per-action cap — refused, listed honestly. */
  readonly overflow: readonly string[];
}

/**
 * Parse a pasted address list (comma / semicolon / whitespace / newline
 * separated). One bad address never cancels the valid ones — each bucket is
 * reported separately.
 */
export function parseEmailList(raw: string): ParsedEmailList {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const overflow: string[] = [];
  for (const token of raw.split(/[\s,;]+/)) {
    const entry = token.trim();
    if (!entry) continue;
    const lower = entry.toLowerCase();
    if (!EMAIL_RX.test(lower) || lower.length > 254) {
      if (!invalid.includes(entry)) invalid.push(entry);
      continue;
    }
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (valid.length >= MAX_EMAILS_PER_ACTION) overflow.push(lower);
    else valid.push(lower);
  }
  return { valid, invalid, overflow };
}

/** The invite deep link: locale-aware, token-carrying, safe to share. */
export function buildInviteLink(
  origin: string,
  locale: string,
  token: string,
): string {
  return `${origin.replace(/\/+$/, "")}/${locale}/invite/${token}`;
}

/** Where acceptance lands the person — the exact real context. */
export function acceptedDestination(input: {
  invitationType: InvitationType | string;
  projectId?: string | null;
}): string {
  if (input.invitationType === "join_project" && input.projectId) {
    return `/dashboard/projects/${input.projectId}`;
  }
  // The person said "interested" to a specific need — the board's own
  // interest list is where that answer already lives.
  if (input.invitationType === "invite_to_demand") {
    return "/dashboard/opportunities";
  }
  if (
    (ORG_INVITATION_TYPES as readonly string[]).includes(input.invitationType)
  ) {
    return "/dashboard";
  }
  return "/dashboard";
}

/**
 * IN WHAT CAPACITY? — the human half of relationship invitations.
 *
 * `accept_invitation_v1` used to be able to create exactly two relationships:
 * `employee`, or `collaborator` for a partner invitation. That is why an
 * education institution could declare it provides training and still had no way
 * to connect a single learner — the invitation model had the whole lifecycle
 * and no vocabulary. Migration 20260827200000 moved the relationship into DATA
 * (`invitations.relationship_slug` → `relationship_types`), and this list is
 * what the sender picks from.
 *
 * ── WHY THIS IS A LIST AND NOT A NEW invitation_type ───────────────────────
 * Adding `join_as_student` to INVITATION_TYPES would have been smaller today
 * and wrong tomorrow: the next relationship (mentor, apprentice, trainee) would
 * need another type, another CASE arm and another migration. ARCHITECTURE §6.2
 * names that exact move — "hardcoding today's actor/relationship taxonomy as
 * exhaustive" — as a narrowing failure to reject in review. So INVITATION_TYPES
 * is UNCHANGED, and a learner invitation is `join_organization` carrying
 * `relationshipSlug: "student"`.
 *
 * ── THE NAMES ARE NOT DEFINED HERE ─────────────────────────────────────────
 * Every slug below is already localized in `messages/<loc>/relationship-types.json`
 * (namespace `relationshipTypes`) — the same words the CV prints. Defining a
 * second set of labels for the same vocabulary would be the duplication the
 * doctrine's canonical check exists to prevent, and the two copies would drift.
 *
 * ── ADDING ONE LATER ───────────────────────────────────────────────────────
 * `update relationship_types set invitable = true where slug = '<new>'`, then
 * one entry here. No migration, no schema change — which is the promise
 * 20260827050000 made for organization capabilities, kept for relationships.
 *
 * Pure data. No IO.
 */
export interface RelationshipInviteChoice {
  /** The stored slug. Localized through `relationshipTypes`, never rendered raw. */
  readonly slug: string;
  /**
   * The organization capability the org must have declared first, or null.
   * MIRRORS `relationship_types.requires_organization_role` — the DATABASE is
   * the authority and refuses the write regardless of what this says; this copy
   * exists only so the screen can explain the refusal BEFORE the send instead
   * of after it.
   */
  readonly requiresOrganizationRole: string | null;
}

/**
 * The capacities a sender may offer, in the order they are offered.
 *
 * `employee` leads because it is the historical default and every existing
 * caller means it; education follows because it is the capability the product
 * previously had no way to express at all.
 *
 * DELIBERATELY ABSENT (see the migration's seed for the full reasoning):
 * `owner` (a transfer, not an invitation), `manager` (administrative authority
 * over other people's records — granted through the audited membership path,
 * never through a mailed token), `viewer` and `unemployed` (not relationships
 * to an organization).
 */
export const RELATIONSHIP_INVITE_CHOICES: readonly RelationshipInviteChoice[] = [
  { slug: "employee", requiresOrganizationRole: null },
  { slug: "student", requiresOrganizationRole: "training_provider" },
  { slug: "volunteer", requiresOrganizationRole: null },
  { slug: "collaborator", requiresOrganizationRole: null },
  { slug: "freelancer", requiresOrganizationRole: null },
  { slug: "consultant", requiresOrganizationRole: null },
] as const;

/** The capacity a sender gets when they express no preference — the historical
 *  default, so an untouched form behaves exactly as it did before. */
export const DEFAULT_RELATIONSHIP_SLUG = "employee";

export function isRelationshipInviteSlug(v: string | null | undefined): boolean {
  return RELATIONSHIP_INVITE_CHOICES.some((c) => c.slug === (v ?? ""));
}

/** What an organization holding `capabilities` may actually offer. Never used
 *  as the enforcement point — `create_invitation_v1` re-checks server-side. */
export function relationshipChoiceBlocked(
  choice: RelationshipInviteChoice,
  capabilities: readonly string[],
): boolean {
  return (
    choice.requiresOrganizationRole !== null &&
    !capabilities.includes(choice.requiresOrganizationRole)
  );
}

/**
 * WHICH invitation addressed to me — the argument the matching canonical
 * accept takes (owner contract §4D: the person answers from the attention
 * item over the ONE dispatcher). `invitation` → `acceptInvitationByIdAction`
 * (`accept_invitation_by_id_v1`, by id); the roster kinds → the dashboard
 * card's own accept action (`accept_{company,agency}_worker_invitation`, by
 * the company / agency id — exactly what that card submits). Pure so the
 * server read, the zod schema and the chat card share one definition.
 */
export type InvitationRef =
  | { readonly source: "invitation"; readonly invitationId: string }
  | { readonly source: "company_roster"; readonly orgId: string }
  | { readonly source: "agency_roster"; readonly orgId: string };

/** How many invitations the attention surfaces show at once (the real total is
 *  reported beside them). */
export const INVITATIONS_ATTENTION_LIMIT = 5;

/* ────────────────────────────────────────────────────────────────────────────
 * REFERRAL PROVENANCE + DECLARED CONTEXT (universal network v1)
 *
 * What an APPROVED EXTERNAL SOURCE may declare about a person, as stored on
 * `invitations.declared_context`. Declared input, never evidence: the person
 * reviews every item (accept / reject / correct) and only the profile paths
 * that already exist may turn any of it into a profile fact.
 * ──────────────────────────────────────────────────────────────────────── */
export type DeclaredContextV1 = {
  readonly v: 1;
  readonly subjectType?: "INDIVIDUAL_WORKER" | "SPECIALIST" | "TEAM" | "BRIGADE";
  readonly professions: readonly { readonly id?: string; readonly raw?: string }[];
  readonly sectors: readonly string[];
  readonly skills: readonly string[];
  readonly yearsClaimed?: number;
  readonly languages: readonly string[];
  readonly residenceCountry?: string;
  readonly availability?: string;
  readonly destinations: readonly string[];
  readonly mobilityScope?: "LISTED" | "EU_WIDE";
  readonly freeText?: string;
};

/** One reviewable line of a declared context, keyed so a review decision can
 *  name it (`professions:0`, `skills:3`). Pure. */
export type DeclaredContextItem = {
  readonly key: string;
  readonly group: "professions" | "sectors" | "skills" | "languages" | "destinations";
  readonly label: string;
};

export const REVIEW_DECISIONS = ["accepted", "rejected", "corrected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export function isReviewDecision(v: unknown): v is ReviewDecision {
  return (REVIEW_DECISIONS as readonly string[]).includes(String(v ?? ""));
}

/** The item keys `review_referral_context_v1` accepts: `<group>:<index>`. */
export const REVIEW_ITEM_KEY_RX = /^[a-z_]+:[0-9]{1,3}$/;

/** Flatten a declared context into reviewable items. Unknown shapes yield
 *  nothing rather than throwing — a malformed stored blob renders as "nothing
 *  to review", never as a crash on the person's own page. */
export function declaredContextItems(raw: unknown): DeclaredContextItem[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const ctx = raw as Partial<DeclaredContextV1>;
  const out: DeclaredContextItem[] = [];
  const list = (
    group: DeclaredContextItem["group"],
    values: readonly unknown[] | undefined,
    toLabel: (v: unknown) => string | null,
  ) => {
    if (!Array.isArray(values)) return;
    values.slice(0, 100).forEach((v, i) => {
      const label = toLabel(v);
      if (label) out.push({ key: `${group}:${i}`, group, label });
    });
  };
  list("professions", ctx.professions, (v) => {
    if (!v || typeof v !== "object") return null;
    const p = v as { id?: unknown; raw?: unknown };
    const raw = typeof p.raw === "string" ? p.raw.trim() : "";
    const id = typeof p.id === "string" ? p.id.trim() : "";
    return raw || id || null;
  });
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  list("sectors", ctx.sectors, str);
  list("skills", ctx.skills, str);
  list("languages", ctx.languages, str);
  list("destinations", ctx.destinations, str);
  return out;
}
