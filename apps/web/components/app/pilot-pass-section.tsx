import { getTranslations } from "next-intl/server";

import { PILOT_PASS_DAYS } from "@/lib/billing/pilot-pass-core";
import { readPilotPassOffer } from "@/lib/billing/pilot-pass-offer";
import { Button } from "@/components/ui/Button";

/**
 * Organization pilot pass (pilot-pass-core), as a section of the account page
 * — billing settings already live there, so the pass adds no screen. It sits
 * at the TOP of the page, outside the collapsed plan fold: an owner measured
 * 2026-10-22 could not find it inside that fold. Renders NOTHING unless the
 * owner switched the pass on AND billing is active for an organization the
 * person can act for (readPilotPassOffer); in another workspace it names the
 * organization to choose. The period is stated before payment. The pay
 * control is one plain form that POSTs to /api/billing/pilot-pass, answered
 * with Stripe's hosted page; the outcome comes back as ?pilot_pass= /
 * ?pilot_pass_refused=. The plan itself then shows in the billing section
 * ("active until …").
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
  const offer = await readPilotPassOffer();
  if (offer.kind === "hidden") return null;

  const t = await getTranslations("pilotPass");
  const days = String(PILOT_PASS_DAYS);

  return (
    <section
      id="pilot-pass"
      data-testid="pilot-pass"
      data-offer={offer.kind}
      data-mode={offer.kind === "here" ? offer.mode : undefined}
      className="scroll-mt-20 flex flex-col gap-3 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-4 py-4"
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

      {offer.kind === "elsewhere" ? (
        <p data-testid="pilot-pass-elsewhere" className="text-sm text-text-primary">
          {t("elsewhere", { organization: offer.organizationName })}
        </p>
      ) : offer.gate.ok ? (
        <form method="post" action="/api/billing/pilot-pass" className="flex flex-col items-start gap-3">
          <Button type="submit" data-testid="pilot-pass-pay">
            {t("pay", { days })}
          </Button>
        </form>
      ) : (
        <p data-testid="pilot-pass-state" data-reason={offer.gate.reason} className="text-sm text-text-secondary">
          {t(`status.${offer.gate.reason}`)}
        </p>
      )}
    </section>
  );
}
