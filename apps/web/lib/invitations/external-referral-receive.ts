import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTransactionalEmailConfigured,
  sendTransactionalEmail,
} from "@/lib/email/transactional";
import { getTranslations } from "next-intl/server";
import { activeLocales } from "@/lib/i18n/config";
import type { ExternalReferralSource } from "@/lib/invitations/external-sources";
import {
  toDeclaredContext,
  type ExternalWorkerReferralV1,
} from "@/lib/invitations/external-referral-contract";
import {
  buildInvitationBody,
  buildInvitationSubject,
} from "@/lib/invitations/email-content";
import { buildInviteLink } from "@/lib/invitations/model";

/**
 * RECEIVE AN EXTERNAL REFERRAL — the service behind the partner door
 * (universal network v1).
 *
 * Runs ONLY after `authorizeExternalReferralRequest` said `ok` and the body
 * parsed against the strict contract. It mints the token (the raw token
 * exists here and in the first response, nowhere else — the database stores
 * sha256), calls `receive_external_referral_v1` through the service-role
 * client (the function is executable by service_role only and re-checks
 * consent + idempotency itself), and — when a provider is configured —
 * e-mails the person the invitation in their language.
 *
 * WHAT COMES BACK
 *   created   → invitationId + inviteUrl (once) + whether an e-mail went out
 *   duplicate → invitationId + current status; NO url (the raw token of the
 *               first delivery is not recoverable, and a replay must not
 *               mint a second capability for the same person)
 *   consent_required / invalid_* → refused, nothing stored
 *   needs_migration → the door is not enabled on this database yet; the
 *               caller is told so, never told "stored"
 */
export type ReceiveReferralResult =
  | {
      readonly outcome: "created";
      readonly invitationId: string;
      readonly inviteUrl: string;
      readonly delivery: "sent" | "delivery_failed" | "not_sent";
    }
  | { readonly outcome: "duplicate"; readonly invitationId: string; readonly status: string }
  | {
      readonly outcome:
        | "consent_required"
        | "invalid_source"
        | "invalid_reference"
        | "invalid_email"
        | "invalid_context"
        | "invalid_expiry"
        | "invalid_token_hash";
    }
  | { readonly outcome: "needs_migration" }
  | { readonly outcome: "error"; readonly code: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient<any, any, any>): any {
  return c;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function recipientLocale(envelope: ExternalWorkerReferralV1): string {
  const l = envelope.locale ?? "";
  return (activeLocales as readonly string[]).includes(l) ? l : "en";
}

export async function receiveExternalReferral(input: {
  readonly source: ExternalReferralSource;
  readonly envelope: ExternalWorkerReferralV1;
  /** `https://host` of this deployment — for the invite link. */
  readonly origin: string;
}): Promise<ReceiveReferralResult> {
  const { source, envelope } = input;
  const token = randomBytes(32).toString("base64url");
  const locale = recipientLocale(envelope);

  const admin = createAdminClient();
  const { data, error } = await asAny(admin).rpc("receive_external_referral_v1", {
    p_source_slug: source.slug,
    p_reference: envelope.leadId,
    p_token_hash: sha256Hex(token),
    p_invited_email: envelope.worker.contact.email ?? null,
    p_invited_name: envelope.worker.contact.name ?? null,
    p_locale: locale,
    p_declared_context: toDeclaredContext(envelope),
    p_consent: envelope.consent,
    p_required_consent_version: source.consentVersion,
    p_expires_in_days: 30,
  });
  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      return { outcome: "needs_migration" };
    }
    return { outcome: "error", code: error.code ?? null };
  }
  const outcome = String(data?.outcome ?? "error");
  if (outcome === "duplicate") {
    return {
      outcome: "duplicate",
      invitationId: String(data.invitation_id),
      status: String(data.status ?? "pending"),
    };
  }
  if (outcome !== "created") {
    const refusals = [
      "consent_required",
      "invalid_source",
      "invalid_reference",
      "invalid_email",
      "invalid_context",
      "invalid_expiry",
      "invalid_token_hash",
    ] as const;
    return (refusals as readonly string[]).includes(outcome)
      ? { outcome: outcome as (typeof refusals)[number] }
      : { outcome: "error", code: outcome };
  }

  const invitationId = String(data.invitation_id);
  const inviteUrl = buildInviteLink(input.origin, locale, token);

  // Delivery, in the person's language, ONLY through the existing provider
  // path and ONLY when it is configured — never a fake "sent".
  let delivery: "sent" | "delivery_failed" | "not_sent" = "not_sent";
  const email = envelope.worker.contact.email;
  if (email && isTransactionalEmailConfigured()) {
    const tEmail = await getTranslations({ locale, namespace: "invitations.email" });
    const sent = await sendTransactionalEmail({
      to: email,
      subject: buildInvitationSubject(tEmail, "join_platform"),
      text: buildInvitationBody(tEmail, { link: inviteUrl, personalMessage: null }),
    });
    delivery = sent.status === "sent" ? "sent" : "delivery_failed";
    await asAny(admin).rpc("mark_external_referral_delivery_v1", {
      p_invitation_id: invitationId,
      p_outcome: delivery,
    });
  }

  return { outcome: "created", invitationId, inviteUrl, delivery };
}
