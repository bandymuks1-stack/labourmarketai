import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { FINAL_CTA_LINKS } from "@/lib/marketing/public-doors";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/marketing/reveal";

/**
 * PR-H global landing — section I: final CTA band. The doors themselves live
 * in the PURE registry `lib/marketing/public-doors.ts` (five since window 6,
 * 2026-09-06 — the institution door joined worker / employer / agency /
 * partner, gap G-C1), so the landing guard, the production walk and this
 * band read ONE list. Every href resolves to a REAL existing route
 * (lib/guards/global-landing.test.ts); no dead links, no "coming soon".
 */
export { FINAL_CTA_LINKS, INSTITUTION_DOOR_NEXT } from "@/lib/marketing/public-doors";

export async function FinalCtaBand() {
  const t = await getTranslations("landing.cta");

  return (
    <section className="mt-16">
      <Reveal>
        <div className="card-border wow-card p-6 text-center sm:p-10">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {t("subcopy")}
          </p>
          <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
            {FINAL_CTA_LINKS.map(({ key, href, variant }) => (
              /**
               * The anchor IS the control. It used to wrap a <Button>, which
               * put the styling — and the focus ring — on a <button> that
               * navigates nothing, while the element that actually navigates
               * was an unstyled box and the pair formed two tab stops for one
               * action. Same rendered look, same classes; only the element
               * carrying them changed.
               */
              <Link
                key={key}
                href={href}
                data-testid={`final-door-${key}`}
                className={cn(
                  buttonLinkClassName(variant),
                  "w-full rounded-xl transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                )}
              >
                {t(key)} →
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
