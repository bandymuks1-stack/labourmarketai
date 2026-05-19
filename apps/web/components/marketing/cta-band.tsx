import { LeadCapture } from "@/components/marketing/lead-capture";

/** Bottom call-to-action band shared by sub-pages. */
export function CtaBand({
  title,
  subtitle,
  ctaSource,
  ctaLabelKey = "open",
}: {
  title: string;
  subtitle: string;
  ctaSource: string;
  ctaLabelKey?: "open" | "openAlt";
}) {
  return (
    <section className="mx-auto max-w-container px-6 pb-20 sm:px-12">
      <div className="relative overflow-hidden card-border px-8 py-12 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-text-secondary">
          {subtitle}
        </p>
        <div className="mt-7 flex justify-center">
          <LeadCapture source={ctaSource} labelKey={ctaLabelKey} />
        </div>
      </div>
    </section>
  );
}
