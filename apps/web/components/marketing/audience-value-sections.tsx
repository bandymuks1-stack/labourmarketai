import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Reveal } from "@/components/marketing/reveal";

/**
 * PR-H global landing — sections B–F: audience value blocks for workers,
 * employers, agencies, training institutions and partners/institutions.
 * Every "more" link targets a REAL existing public route — no dead links.
 * Copy lives in `landing.{workers,employers,agencies,training,partners}`.
 */
type Block = {
  ns: "workers" | "employers" | "agencies" | "training" | "partners";
  items: readonly string[];
  href: string;
  accent: string;
  id?: string;
};

const BLOCKS: readonly Block[] = [
  {
    ns: "workers",
    items: ["i1", "i2", "i3", "i4", "i5"],
    href: "/for-workers",
    accent: "bg-brand-cyan",
  },
  {
    ns: "employers",
    items: ["i1", "i2", "i3", "i4", "i5"],
    href: "/for-companies",
    accent: "bg-brand-blue",
  },
  {
    ns: "agencies",
    items: ["i1", "i2", "i3", "i4"],
    href: "/for-agencies",
    accent: "bg-brand-violet",
  },
  {
    ns: "training",
    items: ["i1", "i2", "i3", "i4"],
    href: "/labour-market",
    accent: "bg-state-success",
  },
  {
    ns: "partners",
    items: ["i1", "i2", "i3", "i4"],
    href: "/about",
    accent: "bg-state-amber",
    id: "partners",
  },
] as const;

export async function AudienceValueSections() {
  const t = await getTranslations("landing");

  return (
    <section className="mt-16">
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("audienceValueEyebrow")}
      </p>
      <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
        {t("audienceValueTitle")}
      </h2>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {BLOCKS.map((b, i) => (
          <Reveal
            key={b.ns}
            delay={(i % 2) * 0.08}
            className={b.ns === "partners" ? "md:col-span-2" : ""}
          >
            <div
              id={b.id}
              className="glow-hover card-border flex h-full scroll-mt-24 flex-col gap-4 p-6 sm:p-7"
            >
              <span className={`h-1 w-12 rounded-full ${b.accent}`} aria-hidden />
              <div>
                <h3 className="font-display text-xl font-semibold text-text-primary">
                  {t(`${b.ns}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {t(`${b.ns}.lead`)}
                </p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {b.items.map((k) => (
                  <li
                    key={k}
                    className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cyan/70"
                      aria-hidden
                    />
                    {t(`${b.ns}.${k}`)}
                  </li>
                ))}
              </ul>
              <Link
                href={b.href}
                className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-brand-blue transition-colors hover:text-brand-cyan"
              >
                {t(`${b.ns}.cta`)} →
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
