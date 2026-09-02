"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  isTransactionalEmailConfigured,
  sendTransactionalEmail,
} from "@/lib/email/transactional";
import {
  buildInvitationBody,
  buildInvitationSubject,
  resolveRecipientLocale,
} from "@/lib/invitations/email-content";
import {
  buildInviteLink,
  isInvitationType,
  isRelationshipInviteSlug,
  parseEmailList,
  type InvitationType,
} from "@/lib/invitations/model";

/**
 * Canonical invitation server actions (core-network area B).
 *
 * Token custody: the raw token exists ONLY here (minted per address) and in
 * the email / copy-link handed back to the INVITER who minted it. The
 * database stores sha256(token) — a leaked table never leaks a usable link.
 *
 * Delivery truth: an invitation is marked `sent` ONLY after the provider
 * acknowledged the message. Provider not configured → the action returns
 * the link for manual sharing and the delivery state stays `not_sent` —
 * never a fake "Išsiųsta".
 *
 * Degradation: while the owner-gated migration 20260712200000 is not
 * applied, every action returns `needs-migration` (the UI shows the honest
 * not-enabled state; nothing pretends to work).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    /invitations|create_invitation_v1/.test(error.message ?? "")
  );
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mintToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "labourmarket.ai";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export type InvitationSendOutcome = {
  email: string;
  outcome:
    | "created" // stored; email delivery not configured — share the link
    | "sent" // stored + provider acknowledged the email
    | "delivery_failed" // stored, provider refused — retry with resend
    | "duplicate_pending"
    | "invalid_email"
    | "limit_reached"
    | "rate_limited"
    | "not_authorized"
    // The relationship named is not one that may be established by invitation
    // (unknown, inactive, or deliberately not offerable — `manager`, `owner`).
    | "invalid_relationship"
    // The relationship requires a capability the organization has not declared:
    // an organization that never said it provides education cannot name a
    // learner. Surfaced as itself so the screen can say what to do about it
    // rather than reporting a generic failure.
    | "organization_capability_required"
    | "error";
  invitationId?: string;
  /** The shareable link — returned ONLY to the inviter who minted it. */
  inviteLink?: string;
};

export type CreateInvitationsResult =
  | { status: "needs-migration" }
  | { status: "not-authed" }
  | {
      status: "ok";
      results: InvitationSendOutcome[];
      invalid: readonly string[];
      overflow: readonly string[];
      emailConfigured: boolean;
    };

export async function createAndSendInvitations(input: {
  emails: string;
  invitationType: string;
  locale: string;
  /** The RECIPIENT'S language (V8 W4-B item 6) — subject, body and the
   *  invite-link locale. Validated server-side; falls back to the sender's
   *  locale when absent or not an active locale. */
  recipientLocale?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  invitedName?: string | null;
  proposedRole?: string | null;
  personalMessage?: string | null;
  /**
   * IN WHAT CAPACITY the invited person joins — `student`, `volunteer`,
   * `employee`… Absent (or null) means the historical per-type default, so
   * every existing caller keeps its exact behaviour. Validated server-side by
   * `create_invitation_v1` against `relationship_types.invitable`; this layer
   * only forwards it.
   */
  relationshipSlug?: string | null;
}): Promise<CreateInvitationsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  if (!isInvitationType(input.invitationType)) {
    return { status: "ok", results: [], invalid: [], overflow: [], emailConfigured: false };
  }
  const type: InvitationType = input.invitationType;
  const parsed = parseEmailList(input.emails ?? "");
  const origin = await requestOrigin();
  const emailConfigured = isTransactionalEmailConfigured();
  // Only a capacity this build actually offers is forwarded. A forged value
  // would be refused by the RPC anyway (`invalid_relationship`); dropping it
  // here means a tampered form falls back to the historical default instead of
  // producing a confusing refusal for a choice the screen never showed.
  const relationshipSlug = isRelationshipInviteSlug(input.relationshipSlug)
    ? (input.relationshipSlug as string)
    : null;
  // Recipient-oriented language: email copy AND the invite-link path locale.
  const recipientLocale = resolveRecipientLocale(
    input.recipientLocale,
    input.locale,
  );
  const tEmail = await getTranslations({
    locale: recipientLocale,
    namespace: "invitations.email",
  });
  const results: InvitationSendOutcome[] = [];

  for (const email of parsed.valid) {
    const { token, hash } = mintToken();
    const { data, error } = await asAny(supabase).rpc("create_invitation_v1", {
      p_token_hash: hash,
      p_invitation_type: type,
      p_invited_email: email,
      p_invited_name: input.invitedName ?? null,
      p_organization_id: input.organizationId ?? null,
      p_project_id: input.projectId ?? null,
      p_proposed_role: input.proposedRole ?? null,
      p_personal_message: input.personalMessage ?? null,
      // The stored locale is the RECIPIENT'S — the accept flow and any
      // resend read it back as the invited person's language.
      p_locale: recipientLocale,
      /**
       * OMITTED ENTIRELY when no capacity was chosen, and that is deliberate.
       *
       * PostgREST resolves an RPC by the exact SET OF ARGUMENT NAMES in the
       * body. Against a database that still carries the pre-20260827200000
       * 9-argument `create_invitation_v1`, sending `p_relationship_slug: null`
       * matches NO function (PGRST202) — which would turn every ordinary
       * invitation into a "not enabled" state until the owner-gated migration
       * is applied. Spreading the key in only when a capacity was actually
       * chosen keeps the default call byte-identical to today's, so the
       * existing flow cannot regress while the migration is pending.
       */
      ...(relationshipSlug ? { p_relationship_slug: relationshipSlug } : {}),
    });
    if (error) {
      if (isMissingSchema(error)) return { status: "needs-migration" };
      results.push({ email, outcome: "error" });
      continue;
    }
    const outcome = (data?.outcome ?? "error") as string;
    if (outcome !== "created") {
      results.push({
        email,
        outcome: (
          [
            "duplicate_pending",
            "invalid_email",
            "limit_reached",
            "rate_limited",
            "not_authorized",
            "invalid_relationship",
            "organization_capability_required",
          ] as const
        ).includes(outcome as never)
          ? (outcome as InvitationSendOutcome["outcome"])
          : "error",
      });
      continue;
    }
    const invitationId = data.invitation_id as string;
    const inviteLink = buildInviteLink(origin, recipientLocale, token);

    if (!emailConfigured) {
      results.push({ email, outcome: "created", invitationId, inviteLink });
      continue;
    }

    const sendResult = await sendTransactionalEmail({
      to: email,
      subject: buildInvitationSubject(tEmail, type),
      text: buildInvitationBody(tEmail, {
        link: inviteLink,
        personalMessage: input.personalMessage ?? null,
      }),
    });
    const deliveryOutcome =
      sendResult.status === "sent" ? "sent" : "delivery_failed";
    // Record the TRUTHFUL provider result (never 'sent' without an ack).
    await asAny(supabase).rpc("mark_invitation_delivery_v1", {
      p_invitation_id: invitationId,
      p_outcome: deliveryOutcome,
    });
    results.push({
      email,
      outcome: sendResult.status === "sent" ? "sent" : "delivery_failed",
      invitationId,
      inviteLink,
    });
  }

  revalidatePath(`/${input.locale}/dashboard/network`);
  return {
    status: "ok",
    results,
    invalid: parsed.invalid,
    overflow: parsed.overflow,
    emailConfigured,
  };
}

// The old hardcoded LT/EN buildSubject/buildBody ternaries (keyed on the
// SENDER'S UI locale) are gone — subject/body now come from the i18n
// catalogs in the RECIPIENT'S language via lib/invitations/email-content.ts.

export type SimpleInvitationResult =
  | { status: "needs-migration" }
  | { status: "not-authed" }
  | { status: "ok"; outcome: string; inviteLink?: string };

export async function revokeInvitationAction(input: {
  invitationId: string;
  locale: string;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("revoke_invitation_v1", {
    p_invitation_id: input.invitationId,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  revalidatePath(`/${input.locale}/dashboard/network`);
  return { status: "ok", outcome: data as string };
}

export async function resendInvitationAction(input: {
  invitationId: string;
  email: string;
  locale: string;
  /** The invitation's stored recipient language (invitations.locale). Falls
   *  back to the sender's locale when absent/invalid. */
  recipientLocale?: string | null;
  invitationType: string;
  personalMessage?: string | null;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  // Resend ROTATES the token — the previous link stops working.
  const { token, hash } = mintToken();
  const { data, error } = await asAny(supabase).rpc("resend_invitation_v1", {
    p_invitation_id: input.invitationId,
    p_new_token_hash: hash,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  if (data !== "ok") return { status: "ok", outcome: data as string };

  const origin = await requestOrigin();
  const recipientLocale = resolveRecipientLocale(
    input.recipientLocale,
    input.locale,
  );
  const inviteLink = buildInviteLink(origin, recipientLocale, token);
  if (isTransactionalEmailConfigured() && isInvitationType(input.invitationType)) {
    const tEmail = await getTranslations({
      locale: recipientLocale,
      namespace: "invitations.email",
    });
    const sendResult = await sendTransactionalEmail({
      to: input.email,
      subject: buildInvitationSubject(tEmail, input.invitationType),
      text: buildInvitationBody(tEmail, {
        link: inviteLink,
        personalMessage: input.personalMessage ?? null,
      }),
    });
    await asAny(supabase).rpc("mark_invitation_delivery_v1", {
      p_invitation_id: input.invitationId,
      p_outcome: sendResult.status === "sent" ? "sent" : "delivery_failed",
    });
    revalidatePath(`/${input.locale}/dashboard/network`);
    return {
      status: "ok",
      outcome: sendResult.status === "sent" ? "sent" : "delivery_failed",
      inviteLink,
    };
  }
  revalidatePath(`/${input.locale}/dashboard/network`);
  return { status: "ok", outcome: "created", inviteLink };
}

export async function acceptInvitationAction(input: {
  token: string;
}): Promise<
  | { status: "needs-migration" }
  | { status: "not-authed" }
  | {
      status: "ok";
      outcome: string;
      invitationType?: string;
      projectId?: string | null;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("accept_invitation_v1", {
    p_token: input.token,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  return {
    status: "ok",
    outcome: (data?.outcome ?? "error") as string,
    invitationType: data?.invitation_type as string | undefined,
    projectId: (data?.project_id ?? null) as string | null,
  };
}

export async function declineInvitationAction(input: {
  token: string;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("decline_invitation_v1", {
    p_token: input.token,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  return { status: "ok", outcome: data as string };
}

export async function acceptInvitationByIdAction(input: {
  invitationId: string;
  locale: string;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc(
    "accept_invitation_by_id_v1",
    { p_invitation_id: input.invitationId },
  );
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  revalidatePath(`/${input.locale}/dashboard/network`);
  return { status: "ok", outcome: (data?.outcome ?? "error") as string };
}
