/**
 * Invitations addressed to the person, for the chat — types only (a "use
 * server" module exports async functions alone). The row shape and the cap
 * are the domain read's own (`lib/invitations/attention`); the ref is the
 * shared `InvitationRef` the zod schema validates and the executor routes on.
 */
import type { InvitationRef } from "@/lib/invitations/model";

export type { InvitationRef };
export { INVITATIONS_ATTENTION_LIMIT as INVITATIONS_CHAT_LIMIT } from "@/lib/invitations/model";

export interface ChatInvitation {
  readonly ref: InvitationRef;
  /** The canonical invitation type (`join_organization`, `join_team`, …) or
   *  `company_roster` / `agency_roster`. */
  readonly invitationType: string;
  /** WHAT the person is asked to become (`student`, `employee`, …); null when
   *  the invitation names none (pre-20260827200000 rows, roster invitations). */
  readonly relationshipSlug: string | null;
  readonly organizationName: string | null;
  readonly projectTitle: string | null;
  readonly inviterName: string | null;
  /** The inviter's own words, whitespace-collapsed and cut for a chat card. */
  readonly personalMessage: string | null;
  readonly expiresAt: string | null;
}

export type InvitationsChatResult =
  | { readonly kind: "ok"; readonly items: readonly ChatInvitation[]; readonly total: number }
  | { readonly kind: "empty" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };
