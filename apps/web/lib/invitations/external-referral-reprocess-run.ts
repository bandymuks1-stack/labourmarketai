import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { guardedSendTransactionalEmail } from "@/lib/email/send-ledger-store";
import { isTransactionalEmailConfigured } from "@/lib/email/transactional";
import { activeLocales } from "@/lib/i18n/config";
import { buildInvitationBody, buildInvitationSubject } from "@/lib/invitations/email-content";
import {
  reprocessExternalReferrals,
  selectReprocessCandidates,
  type ReferralRow,
  type ReprocessReport,
} from "@/lib/invitations/external-referral-reprocess";
import { buildInviteLink } from "@/lib/invitations/model";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The server wiring of `external-referral-reprocess.ts`: the service-role
 * reads and writes (`external_referral_reprocess_candidates_v1`,
 * `reissue_external_referral_v1`, `mark_external_referral_delivery_v1`), the
 * ledgered provider path and the person's language. Every decision lives in
 * the pure module; this file only connects it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type ReprocessMode = "dry_run" | "control" | "batch";

export type ReprocessRunResult =
  | { readonly kind: "needs_migration" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "report"; readonly report: ReprocessReport };

export async function runExternalReferralReprocess(input: {
  readonly mode: ReprocessMode;
  readonly origin: string;
}): Promise<ReprocessRunResult> {
  const admin = createAdminClient();
  const { data, error } = await asAny(admin).rpc("external_referral_reprocess_candidates_v1");
  if (error) {
    return error.code === "42883" || error.code === "PGRST202"
      ? { kind: "needs_migration" }
      : { kind: "unavailable" };
  }
  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const rows: ReferralRow[] = raw.map((r) => ({
    id: String(r.id),
    invitedEmail: (r.invited_email as string | null) ?? null,
    locale: (r.locale as string | null) ?? null,
    createdAt: String(r.created_at),
    expiresAt: (r.expires_at as string | null) ?? null,
    status: String(r.status),
    deliveryStatus: String(r.delivery_status),
    consentGiven: r.consent_given === true,
    externalSource: (r.external_source_slug as string | null) ?? null,
  }));
  const existingAccountEmails = new Set(
    raw
      .filter((r) => r.has_account === true && typeof r.invited_email === "string")
      .map((r) => (r.invited_email as string).trim().toLowerCase()),
  );
  const selection = selectReprocessCandidates(rows, { now: new Date(), existingAccountEmails });
  // The control test is the soonest-expiring eligible referral: one person,
  // chosen by the same rule the batch would use first.
  const control = selection.eligible[0]?.id;

  const report = await reprocessExternalReferrals(
    selection,
    input.mode === "dry_run"
      ? { dryRun: true }
      : input.mode === "control"
        ? { dryRun: false, onlyInvitationId: control ?? "none" }
        : { dryRun: false },
    {
      emailConfigured: isTransactionalEmailConfigured,
      mintToken: () => {
        const token = randomBytes(32).toString("base64url");
        return { token, hash: createHash("sha256").update(token).digest("hex") };
      },
      reissue: async (id, hash) => {
        const r = await asAny(admin).rpc("reissue_external_referral_v1", {
          p_invitation_id: id,
          p_new_token_hash: hash,
        });
        return r.error ? "error" : String(r.data ?? "error");
      },
      buildLink: (locale, token) => buildInviteLink(input.origin, locale, token),
      send: async (to, locale, link) => {
        const t = await getTranslations({ locale, namespace: "invitations.email" });
        const sent = await guardedSendTransactionalEmail(
          {
            to,
            subject: buildInvitationSubject(t, "join_platform"),
            text: buildInvitationBody(t, { link, personalMessage: null }),
          },
          { kind: "invitation" },
        );
        return sent.status === "sent";
      },
      mark: async (id, outcome) => {
        await asAny(admin).rpc("mark_external_referral_delivery_v1", {
          p_invitation_id: id,
          p_outcome: outcome,
        });
      },
      resolveLocale: (l) => ((activeLocales as readonly string[]).includes(l ?? "") ? (l as string) : "en"),
    },
  );
  return { kind: "report", report };
}
