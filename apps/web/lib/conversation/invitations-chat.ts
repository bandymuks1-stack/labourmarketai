"use server";

import "server-only";

import { listInvitationsAddressedToMe } from "@/lib/invitations/attention";

import type { InvitationsChatResult } from "@/lib/conversation/invitations-chat-contract";

/**
 * INVITATIONS ADDRESSED TO ME, for the chat (owner contract §4D ATTENTION —
 * "someone is waiting on you"; §15 the learner is the SAME person; §9 the
 * employer's invitation). A thin transport over the ONE domain read
 * (`lib/invitations/attention`: the network page's `listInvitationsForMe` +
 * the dashboard card's `listMyPendingWorkerInvitations`, both on the caller's
 * verified e-mail, pending only). No write, no ranking, no chat-only logic —
 * the same rows the opening brief counts and the confirmation token
 * fingerprints.
 */
export async function loadInvitationsForChat(): Promise<InvitationsChatResult> {
  try {
    const read = await listInvitationsAddressedToMe();
    if (read.status !== "ok") return { kind: read.status };
    const items = read.items.map((i) => ({
      ref: i.ref,
      invitationType: i.invitationType,
      relationshipSlug: i.relationshipSlug,
      organizationName: i.organizationName,
      projectTitle: i.projectTitle,
      inviterName: i.inviterName,
      personalMessage: i.personalMessage ? i.personalMessage.replace(/\s+/g, " ").trim().slice(0, 200) : null,
      expiresAt: i.expiresAt,
    }));
    return items.length === 0 ? { kind: "empty" } : { kind: "ok", items, total: read.total };
  } catch {
    return { kind: "error" };
  }
}
