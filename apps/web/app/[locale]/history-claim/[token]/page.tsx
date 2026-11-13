import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { buttonLinkClassName } from "@/components/ui/Button";
import { HistoryClaimRedeemForm } from "@/components/app/organization/history-claim-redeem-form";
import { readHistoryClaimPreview } from "@/lib/organization-evidence/history-claim-actions";
import { createClient } from "@/lib/supabase/server";
import { BRAND_NAME } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

/** A page reached by a capability token is never a search result, and its
 *  title never reads the token. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "historyClaim" });
  return { title: `${t("pageTitle")} · ${BRAND_NAME}`, robots: { index: false, follow: false } };
}

/**
 * THE PERSON'S SIDE of a former employer's history link.
 *
 * What this page may say is deliberately thin: the organization's name, and
 * nothing about the person the record is about. A link that reached the wrong
 * hands therefore tells that reader nothing — not a name, not a date, not an
 * hour. Saying "this is me" here links nothing either: the organization is
 * asked to confirm who came, and the person then accepts or refuses on their
 * own profile, which is where every roster link has always been decided.
 */
export default async function HistoryClaimPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("historyClaim");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const returnTo = `/${locale}/history-claim/${token}`;
  if (!user) {
    // Signing in (or signing up, with ANY address) comes first: the claim is
    // answered by a person, never by a link.
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(returnTo)}`);
  }

  const preview = await readHistoryClaimPreview(token);
  const shell = (children: React.ReactNode) => (
    <main
      className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 px-6 py-10"
      data-testid="history-claim-page"
    >
      {children}
    </main>
  );
  const home = (
    <Link href={`/${locale}/dashboard`} className={buttonLinkClassName("secondary", "sm")} data-testid="history-claim-home">
      {t("toDashboard")}
    </Link>
  );

  if (preview.state === "needs_migration" || preview.state === "unavailable") {
    return shell(
      <Card className="flex flex-col gap-3">
        <h1 className="font-display text-xl font-semibold text-text-primary">{t("title")}</h1>
        <Notice tone="warning" testId="history-claim-unavailable">
          {t("unavailable")}
        </Notice>
        {home}
      </Card>,
    );
  }

  const organization = preview.organizationName ?? t("unnamedOrganization");

  if (preview.state === "redeemed" || preview.state === "approved" || preview.state === "rejected") {
    return shell(
      <Card className="flex flex-col gap-3">
        <h1 className="font-display text-xl font-semibold text-text-primary">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-text-secondary" data-testid="history-claim-organization">
          {t("organization", { name: organization })}
        </p>
        <Notice
          tone={preview.state === "rejected" ? "warning" : "info"}
          testId={`history-claim-state-${preview.state}`}
        >
          {preview.state === "redeemed"
            ? t("waitingForOrganization")
            : preview.state === "approved"
              ? t("approvedGoToProfile")
              : t("rejectedByOrganization")}
        </Notice>
        {preview.state === "approved" ? (
          <Link
            href={`/${locale}/dashboard/profile`}
            className={buttonLinkClassName("primary", "sm")}
            data-testid="history-claim-to-profile"
          >
            {t("openProfile")}
          </Link>
        ) : (
          home
        )}
      </Card>,
    );
  }

  return shell(
    <Card className="flex flex-col gap-3">
      <h1 className="font-display text-xl font-semibold text-text-primary">{t("title")}</h1>
      <p className="text-sm leading-relaxed text-text-secondary" data-testid="history-claim-organization">
        {t("organization", { name: organization })}
      </p>
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
    </Card>,
  );
}
