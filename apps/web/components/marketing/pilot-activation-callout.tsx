import { getTranslations } from "next-intl/server";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";

// SR-5 pricing-page honesty callout. Sits above the tier table so a buyer
// understands that pilot activation is manual: no checkout, no automatic
// billing, no automatic verification. CTA reuses the existing waitlist
// modal with a pilot-review source tag so the owner can identify
// pilot-conversation intent. Server component — the modal handles its own
// client-side interactivity.
export async function PilotActivationCallout() {
  const t = await getTranslations("pricing.pilotActivation");
  const items = t.raw("items") as string[];
  return (
    <section
      aria-labelledby="pilot-activation-title"
      data-testid="pilot-activation-callout"
      className="mx-auto mb-10 max-w-container px-6 sm:px-12"
    >
      <div className="card-border flex flex-col gap-4 p-6">
        <span className="self-start rounded-sm border border-state-warning/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning">
          {t("badge")}
        </span>
        <h2
          id="pilot-activation-title"
          className="font-display text-xl font-bold tracking-tightest text-text-primary"
        >
          {t("title")}
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("body")}
        </p>
        <ul className="flex flex-col gap-2 text-sm text-text-secondary">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-state-warning"
              />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <WaitlistModal
            trigger={t("manualCta")}
            source="pricing_pilot_review"
            triggerClassName="inline-flex items-center justify-center rounded-md border border-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:border-brand-blue/80"
          />
        </div>
      </div>
    </section>
  );
}
