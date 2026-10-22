import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { billingPilotPassEnabled, getBillingConfigFor } from "@/lib/billing/config";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { PILOT_PASS_DAYS, evaluatePilotPass } from "@/lib/billing/pilot-pass-core";
import { Button } from "@/components/ui/Button";

/**
 * Organization pilot pass (pilot-pass-core), as a section of the account page
 * — billing settings already live there, so the pass adds no screen. Renders
 * NOTHING unless the owner switched the pass on AND billing is active for the
 * caller's workspace organization (the deny-by-default pilot); every other
 * account sees no trace of it. The period is stated before payment. The pay
 * control is one plain form that POSTs to /api/billing/pilot-pass, answered
 * with Stripe's hosted page; the outcome comes back as ?pilot_pass= /
 * ?pilot_pass_refused=. The plan itself then shows in the billing section
 * above ("active until …").
 */
const RESULTS = new Set(["paid", "cancelled"]);
const REFUSALS = new Set([
  "pilot_pass_disabled",
  "unauthenticated",
  "no_organization",
  "not_billing_authority",
  "billing_not_active",
  "plan_active",
  "checkout_failed",
]);

export async function PilotPassSection({
  result,
  refused,
}: {
  result: string | null;
  refused: string | null;
}) {
  if (!billingPilotPassEnabled()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let organizationId: string | null = null;
  let billingAuthority = false;
  let planActive = false;
  if (user) {
    const subject = await resolveBillingSubject();
    if (subject.subject?.type === "organization") {
      organizationId = subject.subject.id;
      billingAuthority = subject.billingAuthority;
      const ent = await getEffectiveEntitlements();
      planActive = ent.source === "subscription" && ent.active;
    }
  }
  const billingState = getBillingConfigFor(organizationId).state;
  if (billingState !== "stripe_live" && billingState !== "stripe_test") return null;

  const t = await getTranslations("pilotPass");
  const gate = evaluatePilotPass({
    enabled: true,
    authenticated: Boolean(user),
    organizationId,
    billingAuthority,
    billingState,
    planActive,
  });
  const days = String(PILOT_PASS_DAYS);

  return (
    <section
      data-testid="pilot-pass"
      data-mode={billingState === "stripe_live" ? "live" : "test"}
      className="flex flex-col gap-3 rounded-md border border-ink-500 px-4 py-4"
    >
      <h2 className="text-base font-semibold text-text-primary">{t("title", { days })}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{t("intro", { days })}</p>
      <p className="text-sm leading-relaxed text-text-secondary">{t("terms", { days })}</p>

      {result && RESULTS.has(result) ? (
        <p role="status" data-testid="pilot-pass-result" data-result={result} className="text-sm text-text-primary">
          {t(`result.${result}`)}
        </p>
      ) : null}
      {refused && REFUSALS.has(refused) ? (
        <p role="status" data-testid="pilot-pass-refused" data-reason={refused} className="text-sm text-text-primary">
          {t(`status.${refused}`)}
        </p>
      ) : null}

      {gate.ok ? (
        <form method="post" action="/api/billing/pilot-pass" className="flex flex-col items-start gap-3">
          <Button type="submit" data-testid="pilot-pass-pay">
            {t("pay", { days })}
          </Button>
        </form>
      ) : (
        <p data-testid="pilot-pass-state" data-reason={gate.reason} className="text-sm text-text-secondary">
          {t(`status.${gate.reason}`)}
        </p>
      )}
    </section>
  );
}
