import { LeadCapture, type LeadIntent } from "@/components/marketing/lead-capture";

/** Bottom call-to-action band. `accent` renders as a gradient second
 *  headline line; `ctaIntent` pre-selects the lead intent for the role. */
export function CtaBand({
  title,
  accent,
  subtitle,
  ctaSource,
  ctaLabel,
  ctaIntent = "hire_workers",
}: {
  title: string;
  accent?: string;
  subtitle: string;
  ctaSource: string;
  ctaLabel?: string;
  ctaIntent?: LeadIntent;
}) {
  return (
    <section className="mx-auto max-w-container px-6 pb-20 sm:px-12">
      <div className="relative overflow-hidden card-border px-8 py-14 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
          {title}
          {accent && (
            <>
              <br />
              <span className="text-gradient-accent">{accent}</span>
            </>
          )}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-text-secondary">
          {subtitle}
        </p>
        <div className="mt-8 flex justify-center">
          <LeadCapture
            source={ctaSource}
            label={ctaLabel}
            defaultIntent={ctaIntent}
          />
        </div>
      </div>
    </section>
  );
}
