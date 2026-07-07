import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";

/** Shared sub-page hero: small-caps chip → two-line headline with the accent
 *  word in the brand gradient → honest sub-copy → one CTA. CTA is a real
 *  signup (workers), the canonical company-demand entry (/company-need),
 *  or the waitlist modal — per the M1 honest-positioning brief and the
 *  canonical demand-funnel rule (all start/submit-need CTAs → /company-need). */
export function PageHero({
  eyebrow,
  title,
  accent,
  subcopy,
  ctaKind,
  ctaLabel,
  ctaSource,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  subcopy: string;
  ctaKind: "signup" | "companyNeed" | "waitlist";
  ctaLabel: string;
  ctaSource: string;
}) {
  return (
    <section className="relative mx-auto max-w-container px-6 pb-12 pt-16 sm:px-12">
      <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-[11px] uppercase tracking-label text-text-secondary">
        <span className="live-dot" aria-hidden />
        {eyebrow}
      </p>
      <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tightest sm:text-6xl">
        {title} <span className="text-gradient-accent">{accent}</span>
      </h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-text-secondary">
        {subcopy}
      </p>
      <div className="mt-8">
        {ctaKind === "signup" ? (
          <Link href="/auth/signup">
            <Button>{ctaLabel} →</Button>
          </Link>
        ) : ctaKind === "companyNeed" ? (
          <Link href="/company-need">
            <Button>{ctaLabel} →</Button>
          </Link>
        ) : (
          <WaitlistModal
            trigger={ctaLabel}
            source={ctaSource}
            triggerClassName="font-semibold text-text-primary"
          />
        )}
      </div>
    </section>
  );
}
