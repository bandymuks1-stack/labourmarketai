import { getTranslations } from "next-intl/server";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";

/**
 * Sales Offer — the first real, end-to-end pilot workflow (slice
 * sales-core-nonstop-v1, Phase 9). Describes the actual shipped chain
 * (Company/Agency → Worker → Work Journal → Review Enabled → Manager Review →
 * Evidence Result) and routes to the EXISTING manual pilot CTA (waitlist modal,
 * source-tagged). Honest by design: no checkout, no billing, no invented price,
 * no "automated"/"AI matching"/"guaranteed" claim — activation is manual.
 */
export async function PilotWorkflowOffer() {
  const t = await getTranslations("pricing.pilotWorkflow");
  const steps = t.raw("steps") as string[];
  return (
    <section
      aria-labelledby="pilot-workflow-title"
      data-testid="pilot-workflow-offer"
      className="mx-auto mb-10 max-w-container px-6 sm:px-12"
    >
      <div className="card-border flex flex-col gap-4 p-6">
        <span className="self-start rounded-sm border border-state-success/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-success">
          {t("eyebrow")}
        </span>
        <h2
          id="pilot-workflow-title"
          className="font-display text-xl font-bold tracking-tightest text-text-primary"
        >
          {t("title")}
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">{t("body")}</p>
        <ol className="flex flex-col gap-2 text-sm text-text-secondary">
          {steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-state-success/50 font-mono text-[11px] font-semibold text-state-success"
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-xs leading-relaxed text-text-muted">{t("ctaNote")}</p>
        <div className="mt-1">
          <WaitlistModal
            trigger={t("cta")}
            source="pricing_pilot_workflow"
            triggerClassName="inline-flex items-center justify-center rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80"
          />
        </div>
      </div>
    </section>
  );
}
