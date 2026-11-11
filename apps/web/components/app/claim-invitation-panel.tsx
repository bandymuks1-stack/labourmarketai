import { getTranslations } from "next-intl/server";

import { PendingButton } from "@/components/app/pending-submit";
import type { ClaimInvitationPreview } from "@/lib/organization-claims/claim-invitation";
import {
  acceptClaimInvitationFormAction,
  requestClaimEmailProofFormAction,
} from "@/lib/organization-claims/claim-invitation-actions";
import { formatUtcDate } from "@/lib/time/display";

/** Outcomes the panel names; anything else reads as the generic failure line. */
const KNOWN_OUTCOMES = new Set([
  "claim_requested",
  "already_requested",
  "already_used",
  "expired",
  "revoked",
  "email_mismatch",
  "email_not_verified",
  "authority_not_confirmed",
  "invalid_role",
  "not_claimable",
  "inviter_cannot_claim",
  "operator_cannot_claim",
  "verify_sent",
  "verify_rate_limited",
]);

/**
 * The invite page for a "take over this company" invitation. Accepting sends a request; the
 * panel says plainly that an operator decides and that nothing changes before that.
 */
export async function ClaimInvitationPanel({
  locale,
  token,
  preview,
  result,
}: {
  locale: string;
  token: string;
  preview: Exclude<ClaimInvitationPreview, { kind: "not_claim" }>;
  result: string | null;
}) {
  const t = await getTranslations("companyClaim.invite");
  const resultKey = result && KNOWN_OUTCOMES.has(result) ? result : result ? "error" : null;

  if (resultKey === "claim_requested" || resultKey === "already_requested") {
    return (
      <section className="flex flex-col gap-3" data-testid="claim-invite-requested">
        <h1 className="font-display text-2xl font-bold text-text-primary">{t("requestedTitle")}</h1>
        <p className="text-sm text-text-secondary">{t("requestedBody")}</p>
      </section>
    );
  }

  if (preview.kind === "closed") {
    const key = KNOWN_OUTCOMES.has(preview.outcome) ? preview.outcome : "error";
    return (
      <section className="flex flex-col gap-3" data-testid="claim-invite-closed">
        <h1 className="font-display text-2xl font-bold text-text-primary">{t("closedTitle")}</h1>
        <p className="text-sm text-text-secondary">{t(`outcome.${key}`)}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid="claim-invite">
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("eyebrow")}</p>
      <h1 className="font-display text-2xl font-bold text-text-primary">
        {t("title", { company: preview.organizationName })}
      </h1>
      <p className="text-sm text-text-secondary">{t("body")}</p>
      {resultKey && (
        <p role="alert" className="rounded-md border border-dashed border-ink-500 p-3 text-sm text-text-primary" data-testid="claim-invite-result">
          {t(`outcome.${resultKey}`)}
        </p>
      )}
      {!preview.emailMatches ? (
        <p className="text-sm text-text-secondary" data-testid="claim-invite-mismatch">{t("outcome.email_mismatch")}</p>
      ) : !preview.emailVerified ? (
        <div className="flex flex-col gap-2" data-testid="claim-invite-verify">
          <p className="text-sm text-text-secondary">{t("verifyFirst")}</p>
          <form action={requestClaimEmailProofFormAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="token" value={token} />
            <PendingButton variant="secondary" pendingLabel={t("pending")}>
              {t("verifySend")}
            </PendingButton>
          </form>
        </div>
      ) : (
        <form action={acceptClaimInvitationFormAction} className="flex flex-col gap-3" data-testid="claim-invite-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="token" value={token} />
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            {t("roleLabel")}
            <input
              name="role"
              required
              minLength={2}
              maxLength={80}
              autoComplete="organization-title"
              placeholder={t("rolePlaceholder")}
              className="rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-base"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-text-primary">
            <input type="checkbox" name="authority" required className="mt-1 h-5 w-5" />
            <span>{t("authorityLabel", { company: preview.organizationName })}</span>
          </label>
          <PendingButton pendingLabel={t("pending")}>{t("submit")}</PendingButton>
          <p className="text-meta text-text-muted">{t("decidedBy")}</p>
        </form>
      )}
      <p className="text-meta text-text-muted">
        {t("expires", { date: formatUtcDate(preview.expiresAt, locale) ?? "—" })}
      </p>
    </section>
  );
}
