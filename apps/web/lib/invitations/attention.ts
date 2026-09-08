import "server-only";

import { INVITATIONS_ATTENTION_LIMIT, type InvitationRef } from "@/lib/invitations/model";
import { listInvitationsForMe } from "@/lib/invitations/network";
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";

/**
 * INVITATIONS ADDRESSED TO ME — the ONE domain read behind every surface that
 * tells a signed-in person "someone is waiting on you" (owner contract §4D
 * ATTENTION; §15 the learner's invitation; §9 the employer's).
 *
 * Two canonical invitation systems exist and BOTH stay where they are:
 *   • `invitations` (core-network area B) — organisation / team / project /
 *     partner / learner invitations, read by `listInvitationsForMe`
 *     (`list_invitations_for_me_v1`: pending, unexpired, the caller's
 *     VERIFIED e-mail from the JWT), accepted by `accept_invitation_by_id_v1`;
 *   • the company / agency ROSTER invitations (`company_worker_invitations`,
 *     `agency_worker_invitations`, migrations 0025/0027/0036), read by
 *     `listMyPendingWorkerInvitations` (invitee-side RLS on the caller's
 *     e-mail), accepted by `accept_{company,agency}_worker_invitation`.
 *
 * This module composes those two EXISTING reads — no new query shape, no new
 * table, no ranking — so the opening brief, the chat listing and the
 * confirmation-token fingerprint all answer from the same rows the network
 * page and the dashboard invitation card already show. Transactional e-mail is
 * an owner gate, so until it opens this read is how a signed-in person learns
 * they were invited at all.
 *
 * Scale (contract §1b): both underlying reads are bounded and indexed on the
 * caller (RPC scoped to one e-mail; roster reads `.limit(50)` on
 * `invited_email`); the display list is capped at `INVITATIONS_ATTENTION_LIMIT`
 * (`lib/invitations/model`, shared with the chat contract and the zod schema).
 */
export type { InvitationRef };

export interface AttentionInvitation {
  readonly ref: InvitationRef;
  /** The canonical invitation type (`join_organization`, `join_team`, …);
   *  `company_roster` / `agency_roster` for the roster system. */
  readonly invitationType: string;
  /** WHAT the person is asked to become (`student`, `employee`, …) — only the
   *  canonical system names it; null on pre-20260827200000 rows and on roster
   *  invitations (which link a worker to a company, not an engagement). */
  readonly relationshipSlug: string | null;
  readonly organizationName: string | null;
  readonly projectTitle: string | null;
  readonly inviterName: string | null;
  readonly personalMessage: string | null;
  readonly createdAt: string;
  /** Null for roster invitations — they carry no expiry. */
  readonly expiresAt: string | null;
}

export type InvitationsAddressedToMe =
  | { readonly status: "ok"; readonly items: readonly AttentionInvitation[]; readonly total: number }
  /** The canonical invitations migration is not applied — an honest "not enabled". */
  | { readonly status: "unavailable" }
  | { readonly status: "error" };

function refKey(ref: InvitationRef): string {
  return ref.source === "invitation" ? `invitation:${ref.invitationId}` : `${ref.source}:${ref.orgId}`;
}

/** Both canonical reads, merged newest-first. Internal: the fingerprint must
 *  see every pending row, not only the display slice. */
async function readAll(): Promise<
  | { readonly status: "ok"; readonly items: readonly AttentionInvitation[] }
  | { readonly status: "unavailable" }
  | { readonly status: "error" }
> {
  const [canonical, roster] = await Promise.all([listInvitationsForMe(), listMyPendingWorkerInvitations()]);
  if (canonical.status === "needs-migration") return { status: "unavailable" };
  if (canonical.status !== "ok") return { status: "error" };
  const items: AttentionInvitation[] = [
    ...canonical.items.map((i) => ({
      ref: { source: "invitation" as const, invitationId: i.id },
      invitationType: i.invitationType,
      relationshipSlug: i.relationshipSlug,
      organizationName: i.organizationName,
      projectTitle: i.projectTitle,
      inviterName: i.inviterName,
      personalMessage: i.personalMessage,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
    ...roster.map((r) => ({
      ref: r.kind === "company" ? { source: "company_roster" as const, orgId: r.orgId } : { source: "agency_roster" as const, orgId: r.orgId },
      invitationType: r.kind === "company" ? "company_roster" : "agency_roster",
      relationshipSlug: null,
      organizationName: r.orgName === "—" ? null : r.orgName,
      projectTitle: null,
      inviterName: null,
      personalMessage: r.note,
      createdAt: r.invitedAt,
      expiresAt: null,
    })),
  ];
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { status: "ok", items };
}

/** The pending invitations addressed to the caller, newest first, capped for
 *  display; `total` is the real count behind the cap. */
export async function listInvitationsAddressedToMe(): Promise<InvitationsAddressedToMe> {
  const all = await readAll();
  if (all.status !== "ok") return all;
  return { status: "ok", items: all.items.slice(0, INVITATIONS_ATTENTION_LIMIT), total: all.items.length };
}

/**
 * THE state fingerprint for `worker.respond-invitation` (bound into the
 * confirmation token by the ONE dispatcher). Pending in the caller's own list
 * = acceptable; anything else — accepted, declined, revoked, expired, addressed
 * to another e-mail, or simply unreadable — reads as `absent`, so a token
 * minted while pending goes stale the moment the row leaves that state, and a
 * failed read never mints an acceptable token. The invitee cannot select
 * canonical `invitations` rows (inviter-side RLS); this is why the dispatcher
 * asks the domain read instead of querying.
 */
export async function invitationStateFingerprint(ref: InvitationRef): Promise<string> {
  try {
    const all = await readAll();
    if (all.status !== "ok") return `invitation:${all.status}`;
    const key = refKey(ref);
    return `invitation:${all.items.some((i) => refKey(i.ref) === key) ? "pending" : "absent"}`;
  } catch {
    return "invitation:error";
  }
}
