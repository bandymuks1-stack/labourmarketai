import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { billingLiveCheckEnabled, getBillingConfigFor } from "@/lib/billing/config";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { evaluateLiveCheck } from "@/lib/billing/live-check-core";
import { Button } from "@/components/ui/Button";

/**
 * The owner's one-time 1 € LIVE payment check (live-check-core), as a section
 * of the account page — billing settings already live there, so the check
 * adds no screen. Renders NOTHING unless the owner switched the check on AND
 * billing is LIVE for the caller's workspace organization (the deny-by-default
 * pilot); every other account sees no trace of it. The pay control is one
 * plain form that POSTs to /api/billing/live-check, answered with Stripe's
 * hosted page; the outcome comes back as ?live_check= / ?live_check_refused=.
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

export async function LivePaymentCheckSection({
  result,
  refused,
}: {
  result: string | null;
  refused: string | null;
}) {
  if (!billingLiveCheckEnabled()) return null;

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
  const billingState = getBillingConfigFor(organizationId).state;
  if (billingState !== "stripe_live") return null;

  const t = await getTranslations("liveCheck");
  const gate = evaluateLiveCheck({
    enabled: true,
    authenticated: Boolean(user),
    organizationId,
    billingAuthority,
    billingState,
  });

  return (
    <section
      data-testid="live-payment-check"
      className="flex flex-col gap-3 rounded-md border border-ink-500 px-4 py-4"
    >
      <h2 className="text-base font-semibold text-text-primary">{t("title")}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
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
    </section>
  );
}
