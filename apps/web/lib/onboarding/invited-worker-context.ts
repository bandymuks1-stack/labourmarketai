import "server-only";

import {
  addressedReferralImpliesWorker,
  invitationImpliesWorkerContext,
  inviteTokenFromNextPath,
  pickAddressedJoinPlatform,
} from "@/lib/invitations/model";
import { listInvitationsForMe } from "@/lib/invitations/network";
import { readPublicInvitationPreview } from "@/lib/invitations/public-preview";

/**
 * WHO THIS INVITED PERSON IS, decided ON THE SERVER from verifiable data only
 * (2026-10-27). The onboarding page uses it to skip the role question; the
 * `completeOnboarding` action uses the SAME function to fix the role, so a
 * hand-crafted form cannot change what the invitation already settled.
 *
 *   - a token in `?next=/invite/<token>`: the invitation preview decides, by
 *     the unchanged token-path rule (`invitationImpliesWorkerContext`);
 *   - no token: the caller's own pending invitations for their VERIFIED
 *     e-mail; exactly one `join_platform` (`pickAddressedJoinPlatform`), and a
 *     worker only for a registered partner whose notice is about the person's
 *     own job search (`addressedReferralImpliesWorker`).
 *
 * Anything missing, ambiguous or unreadable → `workerImplied: false`, and the
 * role question is shown.
 */
export type InvitedWorkerContext = {
  readonly inviteToken: string | null;
  readonly addressedInvitationId: string | null;
  readonly workerImplied: boolean;
};

export async function resolveInvitedWorkerContext(
  nextPath: string | null,
): Promise<InvitedWorkerContext> {
  const inviteToken = inviteTokenFromNextPath(nextPath);
  if (inviteToken) {
    const preview = await readPublicInvitationPreview(inviteToken, { emitOpened: false });
    return {
      inviteToken,
      addressedInvitationId: null,
      workerImplied:
        preview.kind === "ok" &&
        invitationImpliesWorkerContext({
          invitationType: preview.preview.invitationType,
          externalSourceSlug: preview.preview.externalSourceSlug,
        }),
    };
  }
  const mine = await listInvitationsForMe();
  const addressed = mine.status === "ok" ? pickAddressedJoinPlatform(mine.items) : null;
  return {
    inviteToken: null,
    addressedInvitationId: addressed?.id ?? null,
    workerImplied: addressed ? addressedReferralImpliesWorker(addressed) : false,
  };
}
