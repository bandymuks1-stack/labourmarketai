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
  if (
    (ORG_INVITATION_TYPES as readonly string[]).includes(input.invitationType)
  ) {
    return "/dashboard";
  }
  return "/dashboard";
}
