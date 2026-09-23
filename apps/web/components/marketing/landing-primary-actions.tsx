import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { LandingCtaCapture } from "@/components/marketing/public-entry";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * THE LANDING'S ONE CLEAR NEXT STEP (owner directive 2026-09-23, landing §22).
 *
 * Measured before this existed: the hero had no call to action of its own.
 * Below 640px the header moves "Pradėti dabar" into the menu, and the entry's
 * doors appear only after a visitor has typed or tapped — so on a phone the
 * only visible way forward was to type a sentence. The page also ended at the
 * trust band with nothing to do next.
 *
 * ONE primary action — create an account — and ONE secondary — the public
 * job board, which needs no account. Both labels are the header's own
 * (`nav.startNow`, `nav.jobs`), so the page names the same two things the
 * same way everywhere. The pair renders twice: under the hero sentence and as
 * the closing band after the trust band.
 *
 * STATIC. `locale` is passed in; nothing here reads cookies or headers, so
 * the landing stays a static ISR page (the cold-start fix). Clicks are
 * reported through the SAME capture the entry's doors use, tagged
 * `landing_hero` or `landing_close`, so the funnel can finally tell the three
 * landing starts apart.
 */
export async function LandingPrimaryActions({
  locale,
  surface,
}: {
  readonly locale: string;
  readonly surface: "landing_hero" | "landing_close";
}) {
  const t = await getTranslations("nav");
  return (
    <div
      data-testid="landing-actions"
      data-surface={surface}
      className="flex flex-wrap items-center gap-3"
    >
      <LandingCtaCapture surface={surface} ctaId={`${surface}_signup`}>
        <AuthCtaLink
          relPath={`/${locale}/auth/signup`}
          className={cn(buttonLinkClassName("primary"), "gap-1.5 rounded-full")}
        >
          {t("startNow")}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </AuthCtaLink>
      </LandingCtaCapture>
      <LandingCtaCapture surface={surface} ctaId={`${surface}_jobs`}>
        <Link
          href="/jobs"
          className={cn(buttonLinkClassName("secondary"), "rounded-full")}
        >
          {t("jobs")}
        </Link>
      </LandingCtaCapture>
    </div>
  );
}

/**
 * The closing band: the page's last word is what to do next. Titled with the
 * existing `landing.cta.title` — the heading the former final band carried —
 * and deliberately without its old subcopy ("five doors…"), which described
 * a band that no longer exists.
 */
export async function LandingClosingBand({ locale }: { readonly locale: string }) {
  const t = await getTranslations("landing.cta");
  return (
    <section
      className="mt-16 border-t border-ink-600/60 pt-12"
      aria-labelledby="landing-close-title"
      data-testid="landing-close"
    >
      <h2
        id="landing-close-title"
        className="max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl"
      >
        {t("title")}
      </h2>
      <div className="mt-6">
        <LandingPrimaryActions locale={locale} surface="landing_close" />
      </div>
    </section>
  );
}
