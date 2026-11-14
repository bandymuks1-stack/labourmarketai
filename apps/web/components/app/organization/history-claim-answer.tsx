import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { HistoryClaimRedeemForm } from "@/components/app/organization/history-claim-redeem-form";
import { readHistoryClaimPreview } from "@/lib/organization-evidence/history-claim-actions";

/** The shape of a link token: 32 random bytes, base64url. Anything else is
 *  not asked about at all. */
const TOKEN = /^[A-Za-z0-9_-]{16,200}$/;

export function historyClaimTokenFrom(value: string | string[] | undefined): string | null {
  const one = Array.isArray(value) ? value[0] : value;
  return one && TOKEN.test(one) ? one : null;
}

/**
 * THE PERSON'S SIDE of a former employer's history link, on the person's own
 * profile — the page where every roster link has always been decided, so the
 * whole exchange has one address and no page of its own.
 *
 * What it may say is deliberately thin: the organization's name, and nothing
 * about the person the record is about. A link that reached the wrong hands
 * therefore tells that reader nothing — not a name, not a date, not an hour.
 * Saying "this is me" links nothing either: the organization is asked to
 * confirm who came, and only then does the offer appear just below, where the
 * person accepts or refuses.
 */
export async function HistoryClaimAnswer({ token }: { token: string }) {
  const t = await getTranslations("historyClaim");
  const preview = await readHistoryClaimPreview(token);

  const shell = (children: React.ReactNode) => (
    <Card className="flex flex-col gap-3" data-testid="history-claim-page">
      <h2 className="font-display text-xl font-semibold text-text-primary">{t("title")}</h2>
      {children}
    </Card>
  );

  if (preview.state === "needs_migration" || preview.state === "unavailable") {
    return shell(
      <Notice tone="warning" testId="history-claim-unavailable">
        {t("unavailable")}
      </Notice>,
    );
  }

  const organization = (
    <p className="text-sm leading-relaxed text-text-secondary" data-testid="history-claim-organization">
      {t("organization", { name: preview.organizationName ?? t("unnamedOrganization") })}
    </p>
  );

  // Confirmed by the organization: the offer itself now stands just below, in
  // the place every roster link is answered. Nothing to add to it here.
  if (preview.state === "approved") return null;

  if (preview.state === "redeemed" || preview.state === "rejected") {
    return shell(
      <>
        {organization}
        <Notice
          tone={preview.state === "rejected" ? "warning" : "info"}
          testId={`history-claim-state-${preview.state}`}
        >
          {preview.state === "redeemed" ? t("waitingForOrganization") : t("rejectedByOrganization")}
        </Notice>
      </>,
    );
  }

  return shell(
    <>
      {organization}
      <p className="text-sm leading-relaxed text-text-secondary">{t("explain")}</p>
      <HistoryClaimRedeemForm
        token={token}
        labels={{
          submit: t("redeem"),
          submitting: t("redeeming"),
          done: t("redeemedTitle"),
          doneHint: t("redeemedHint"),
          errors: {
            auth: t("errors.auth"),
            unavailable: t("errors.unavailable"),
            email_not_verified: t("errors.emailNotVerified"),
            creator_cannot_redeem: t("errors.creatorCannotRedeem"),
            no_worker_profile: t("errors.noWorkerProfile"),
            already_on_roster: t("errors.alreadyOnRoster"),
            rate_limited: t("errors.rateLimited"),
            needs_migration: t("errors.needsMigration"),
            error: t("errors.error"),
          },
        }}
      />
      <p className="text-meta leading-relaxed text-text-muted">{t("privacyNote")}</p>
    </>,
  );
}
