import { getTranslations } from "next-intl/server";

import { TrackedCta } from "@/components/app/tracked-cta";

/**
 * The homepage's closing fork: two plain doors into the two canonical
 * acquisition pages. Same place, same record — which door depends on which
 * side of the work the visitor stands on. No third option competes with them.
 */
export async function HomeSides() {
  const t = await getTranslations("publicSlice.home");
  return (
    <section className="py-12 lg:py-16" aria-labelledby="home-sides-title" data-testid="home-sides">
      <h2
        id="home-sides-title"
        className="font-display text-3xl font-bold leading-[1.08] tracking-tightest text-text-primary sm:text-5xl"
      >
        {t("title")}
      </h2>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">{t("sub")}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {(
          [
            { k: "worker", href: "/for-workers", id: "home_sides_workers", audience: "workers" },
            { k: "company", href: "/for-companies", id: "home_sides_companies", audience: "companies" },
          ] as const
        ).map((d) => (
          <TrackedCta
            key={d.k}
            href={d.href}
            ctaId={d.id}
            audience={d.audience}
            className="group block rounded-3xl bg-ink-800 p-7 transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:p-9"
          >
            <p className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
              {t(`${d.k}Title`)}
            </p>
            <p className="mt-2 max-w-sm text-body text-text-secondary">{t(`${d.k}Body`)}</p>
            <p className="mt-6 text-support font-semibold text-brand-blue">
              {t(`${d.k}Cta`)} <span aria-hidden>→</span>
            </p>
          </TrackedCta>
        ))}
      </div>
    </section>
  );
}
