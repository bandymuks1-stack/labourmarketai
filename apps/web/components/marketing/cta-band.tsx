import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";

/** Bottom call-to-action band. CTA kind chooses between the real worker
 *  signup and the company / agency waitlist modal — see M1 honest-
 *  positioning brief and PV §10. */
export function CtaBand({
  title,
  accent,
  subtitle,
  ctaKind,
  ctaLabel,
  ctaSource,
}: {
  title: string;
  accent?: string;
  subtitle: string;
  ctaKind: "signup" | "waitlist";
  ctaLabel: string;
  ctaSource: string;
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
          {ctaKind === "signup" ? (
            <Link href="/auth/signup" className={buttonLinkClassName()}>
              {ctaLabel} →
            </Link>
          ) : (
            <WaitlistModal
              trigger={ctaLabel}
              source={ctaSource}
              triggerClassName="font-semibold text-text-primary"
            />
          )}
        </div>
      </div>
    </section>
  );
}
