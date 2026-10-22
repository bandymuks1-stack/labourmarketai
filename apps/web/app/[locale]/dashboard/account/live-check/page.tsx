import { setRequestLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { billingLiveCheckEnabled, getBillingConfigFor } from "@/lib/billing/config";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { evaluateLiveCheck } from "@/lib/billing/live-check-core";
import { PageTitle } from "@/components/app/premium/page-title";
import { Button } from "@/components/ui/Button";

/**
 * The owner's one-time 1 € LIVE payment check (live-check-core). Shows the
 * honest state for the caller's workspace organization and, only when every
 * gate holds, one plain form that POSTs to /api/billing/live-check — which
 * answers with Stripe's hosted page. No client input, no client JavaScript.
 */
const RESULTS = new Set(["paid", "cancelled"]);
const REFUSALS = new Set([
  "live_check_disabled",
  "unauthenticated",
  "no_organization",
  "not_billing_authority",
  "not_live",
  "checkout_failed",
]);

export default async function LiveCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ result?: string; refused?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { result, refused } = await searchParams;
  const t = await getTranslations("liveCheck");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let organizationId: string | null = null;
  let billingAuthority = false;
  if (user) {
    const subject = await resolveBillingSubject();
    if (subject.subject?.type === "organization") {
      organizationId = subject.subject.id;
      billingAuthority = subject.billingAuthority;
    }
  }
  const gate = evaluateLiveCheck({
    enabled: billingLiveCheckEnabled(),
    authenticated: Boolean(user),
    organizationId,
    billingAuthority,
    billingState: getBillingConfigFor(organizationId).state,
  });

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" id="main-content">
      <header className="flex flex-col gap-1">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>

      <p className="text-sm leading-relaxed text-text-secondary">{t("notice")}</p>

      {result && RESULTS.has(result) ? (
        <p role="status" data-testid="live-check-result" data-result={result} className="text-sm text-text-primary">
          {t(`result.${result}`)}
        </p>
      ) : null}
      {refused && REFUSALS.has(refused) ? (
        <p role="status" data-testid="live-check-refused" data-reason={refused} className="text-sm text-text-primary">
          {t(`status.${refused}`)}
        </p>
      ) : null}

      {gate.ok ? (
        <form method="post" action="/api/billing/live-check" className="flex flex-col items-start gap-3">
          <p className="text-sm text-text-secondary">{t("ready")}</p>
          <Button type="submit" data-testid="live-check-pay">
            {t("pay")}
          </Button>
        </form>
      ) : (
        <p data-testid="live-check-state" data-reason={gate.reason} className="text-sm text-text-secondary">
          {t(`status.${gate.reason}`)}
        </p>
      )}
    </div>
  );
}
