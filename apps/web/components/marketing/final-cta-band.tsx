import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/marketing/reveal";

/**
 * PR-H global landing — section I: final CTA band. Every href resolves to a
 * REAL existing route under app/[locale]/ (enforced by
 * lib/guards/global-landing.test.ts — existence-checked on every CI run):
 *   worker   → /auth/signup     (worker signup)
 *   employer → /company-need    (canonical §17 demand entry)
 *   agency   → /auth/signup     (agencies sign up through the same door)
 *   partner  → /about           (real about/contact page)
 * No dead links, no "coming soon" pages.
 */
export const FINAL_CTA_LINKS = [
  { key: "worker", href: "/auth/signup", variant: "primary" },
  { key: "employer", href: "/company-need", variant: "secondary" },
  { key: "agency", href: "/auth/signup", variant: "secondary" },
  { key: "partner", href: "/about", variant: "secondary" },
] as const;

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
              <Link key={key} href={href} className="w-full">
                <Button
                  variant={variant}
                  className="w-full rounded-xl transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {t(key)} →
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
