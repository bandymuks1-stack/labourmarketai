import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { hashRecipient } from "@/lib/email/durable-send-guard";
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

export type ReprocessMode = "dry_run" | "control" | "batch" | "resolve_reservations";

export type ReprocessRunResult =
  | { readonly kind: "needs_migration" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "report"; readonly report: ReprocessReport }
  | { readonly kind: "resolved"; readonly reserved: number; readonly outcomes: Readonly<Record<string, number>> };

export async function runExternalReferralReprocess(input: {
  readonly mode: ReprocessMode;
  readonly origin: string;
}): Promise<ReprocessRunResult> {
  const admin = createAdminClient();
  // v2 adds `address_already_sent`: an older duplicate row of an address that
  // was already mailed must never be mailed again. v3 (20261028070000) adds the
  // send reservation; before it is applied the runner reads v2 as before.
  let { data, error } = await asAny(admin).rpc("external_referral_reprocess_candidates_v3");
  if (error && (error.code === "42883" || error.code === "PGRST202")) {
    if (input.mode === "resolve_reservations") return { kind: "needs_migration" };
    ({ data, error } = await asAny(admin).rpc("external_referral_reprocess_candidates_v2"));
  }
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
  const alreadyMailedEmails = new Set(
    raw
      .filter((r) => r.address_already_sent === true && typeof r.invited_email === "string")
      .map((r) => (r.invited_email as string).trim().toLowerCase()),
  );
  if (input.mode === "resolve_reservations") return resolveReservations(admin, raw);
  const reservedEmails = new Set(
    raw
      .filter((r) => r.address_reserved === true && typeof r.invited_email === "string")
      .map((r) => (r.invited_email as string).trim().toLowerCase()),
  );
  const selection = selectReprocessCandidates(rows, {
    now: new Date(),
    existingAccountEmails,
    alreadyMailedEmails,
    reservedEmails,
  });
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
        const r = await asAny(admin).rpc("mark_external_referral_delivery_v1", {
          p_invitation_id: id,
          p_outcome: outcome,
        });
        if (r.error || r.data !== "ok") throw new Error("mark_failed");
      },
      resolveLocale: (l) => ((activeLocales as readonly string[]).includes(l ?? "") ? (l as string) : "en"),
    },
  );
  return { kind: "report", report };
}

/**
 * Recovery of reservations a stopped run left behind — never a second mail.
 * Each reserved row goes to `resolve_external_referral_reservation_v1` with the
 * ledger hash of its OWN address: a ledger row at/after the reservation marks
 * it sent; none, and older than 15 minutes, releases it; younger stays.
 * Nothing is sent here.
 */
async function resolveReservations(
  admin: SupabaseClient,
  raw: ReadonlyArray<Record<string, unknown>>,
): Promise<ReprocessRunResult> {
  const reserved = raw.filter((r) => r.delivery_reserved_at != null && typeof r.invited_email === "string");
  const outcomes: Record<string, number> = {};
  for (const r of reserved) {
    const res = await asAny(admin).rpc("resolve_external_referral_reservation_v1", {
      p_invitation_id: String(r.id),
      p_ledger_hash: hashRecipient(r.invited_email as string),
    });
    const key = res.error ? "error" : String(res.data ?? "error");
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  return { kind: "resolved", reserved: reserved.length, outcomes };
}
