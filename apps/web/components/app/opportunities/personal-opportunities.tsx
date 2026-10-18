import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatUtcDate } from "@/lib/time/display";
import {
  PUBLIC_VACANCY_CARD_EMPLOYMENT_FORMS,
  PUBLIC_VACANCY_CARD_WORKING_TIMES,
} from "@/components/marketing/public-vacancy-card-facts";
import type { PersonalOpportunity, PersonalWhy } from "@/lib/opportunities/personal-recommendations";

/**
 * "JŪSŲ GALIMYBĖS" — the personal first view of /dashboard/opportunities
 * (owner addendum 2026-10-09). One heading, one sentence, at most three
 * compact previews (or the free discovery set of up to ten), each with ONE
 * evidence-based reason and ONE action. Everything else — full details, the
 * whole market, filters, saved items — is one deliberate step away; nothing
 * is removed from the product.
 */

type Labels = Awaited<ReturnType<typeof getTranslations>>;

function whyText(t: Labels, why: PersonalWhy): string {
  switch (why.code) {
    case "skills_confirmed":
    case "skills_journal":
    case "skills_history":
      return t(`why.${why.code}`, { count: why.count });
    case "skill_fit":
      return t("why.skill_fit", { matched: why.matched, total: why.total });
    default:
      return t(`why.${why.code}`);
  }
}

function payText(o: PersonalOpportunity, locale: string): string | null {
  if (!o.pay) return null;
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const cur = o.pay.currency ?? "";
  const { min, max } = o.pay;
  if (min !== null && max !== null && min !== max) return `${n.format(min)}–${n.format(max)} ${cur}`.trim();
  const v = min ?? max;
  return v !== null ? `${n.format(v)} ${cur}`.trim() : null;
}

export async function PersonalOpportunities({
  items,
  mode,
  locale,
  roleLabel,
  professionLabel,
  countryLabel,
  discoverySet,
  canShowMore,
}: {
  readonly items: readonly PersonalOpportunity[];
  readonly mode: "top" | "discover";
  readonly locale: string;
  readonly roleLabel: (slug: string | null) => string;
  /** The catalogue profession name in the reader's language, or null. */
  readonly professionLabel: (slug: string | null) => string | null;
  readonly countryLabel: (code: string | null) => string;
  /** Size of the free curated discovery set (a set, never a viewing quota). */
  readonly discoverySet: number;
  /** True when the discovery set holds more than the first view shows. */
  readonly canShowMore: boolean;
}) {
  const t = await getTranslations("opportunities.personal");
  const base = `/${locale}/dashboard/opportunities`;

  const detailHref = (o: PersonalOpportunity) =>
    o.kind === "vacancy" ? `/${locale}/jobs/${o.id}` : `${base}?view=all#opp-${o.id}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8" data-testid="personal-opportunities" data-mode={mode} data-count={items.length}>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-text-primary">
          {mode === "top" ? t("title") : t("discoverTitle")}
        </h1>
        <p className="max-w-[56ch] text-[0.98rem] leading-relaxed text-text-secondary">
          {mode === "top" ? t("subtitle") : t("discoverSubtitle", { count: discoverySet })}
        </p>
      </header>

      {items.length === 0 ? (
        <section className="flex flex-col gap-3 rounded-[22px] border border-text-primary/10 p-6" data-testid="personal-opportunities-empty">
          <h2 className="font-display text-lg font-semibold text-text-primary">{t("emptyTitle")}</h2>
          <p className="max-w-[56ch] text-sm leading-relaxed text-text-secondary">{t("emptyBody")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/${locale}/dashboard/profile`}
              className="inline-flex min-h-11 items-center rounded-full bg-gradient-cta px-5 text-sm font-semibold text-text-on-brand"
              data-testid="personal-opportunities-improve"
            >
              {t("improveProfile")}
            </Link>
            <Link
              href={`${base}?view=all`}
              className="inline-flex min-h-11 items-center rounded-full border border-text-primary/20 px-5 text-sm font-semibold text-text-primary hover:border-brand-blue"
              data-testid="personal-opportunities-market"
            >
              {t("market")}
            </Link>
          </div>
        </section>
      ) : (
        <ol className="flex flex-col" data-testid="personal-opportunities-list">
          {items.map((o, i) => {
            const localized = o.kind === "vacancy" ? professionLabel(o.professionSlug) : null;
            const title = o.kind === "vacancy" ? (localized ?? o.title) : roleLabel(o.roleSlug);
            // The publisher's own words stay visible under a localized heading.
            const original = localized && localized.trim().toLowerCase() !== o.title.trim().toLowerCase() ? o.title : null;
            const where = [o.place, o.country ? countryLabel(o.country) : null].filter(Boolean).join(", ");
            const pay = payText(o, locale);
            const facts = [
              o.facts.employmentForm && PUBLIC_VACANCY_CARD_EMPLOYMENT_FORMS.includes(o.facts.employmentForm)
                ? t(`form.${o.facts.employmentForm}`)
                : null,
              o.facts.workingTime && PUBLIC_VACANCY_CARD_WORKING_TIMES.includes(o.facts.workingTime)
                ? t(`time.${o.facts.workingTime}`)
                : null,
              o.facts.positions && o.facts.positions > 1 ? t("positions", { count: o.facts.positions }) : null,
              o.facts.start && /^\d{4}-\d{2}-\d{2}/.test(o.facts.start)
                ? t("starts", { date: formatUtcDate(o.facts.start, locale) ?? o.facts.start })
                : null,
            ]
              .filter((x): x is string => !!x)
              .slice(0, 3);
            return (
              <li
                key={o.key}
                className="group grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-2 border-t border-text-primary/10 py-5 first:border-t-0"
                data-testid="personal-opportunity"
                data-kind={o.kind}
                data-status={o.status}
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="flex items-center gap-2 text-meta text-text-muted">
                    <span
                      aria-hidden
                      className={`inline-block h-[7px] w-[7px] rounded-full ${o.status === "strong" ? "bg-text-primary" : "border border-text-primary/70"}`}
                    />
                    {t(`status.${o.status}`)} · {t(`kind.${o.kind}`)}
                  </p>
                  <h2 className="font-display text-[1.2rem] font-semibold leading-snug tracking-[-0.02em] text-text-primary">
                    <Link
                      href={detailHref(o)}
                      className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                      data-testid="personal-opportunity-title"
                      aria-describedby={`why-${i}`}
                    >
                      {title}
                    </Link>
                  </h2>
                  {original ? (
                    <p className="text-meta text-text-muted" data-testid="personal-opportunity-original-title">
                      {original}
                    </p>
                  ) : null}
                  <p className="text-sm text-text-secondary">
                    {[where || null, o.employer].filter(Boolean).join(" · ")}
                  </p>
                  {facts.length > 0 ? <p className="text-meta text-text-muted">{facts.join(" · ")}</p> : null}
                  <p id={`why-${i}`} className="text-sm text-text-primary" data-testid="personal-opportunity-why">
                    {whyText(t, o.why)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  {pay ? (
                    <span className="font-display text-base font-semibold tabular-nums text-text-primary" data-testid="personal-opportunity-pay">
                      {pay}
                    </span>
                  ) : null}
                  <Link
                    href={detailHref(o)}
                    className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-text-primary/20 px-4 text-sm font-semibold text-text-primary transition-colors hover:border-brand-blue"
                    data-testid="personal-opportunity-open"
                  >
                    {t("open")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {items.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-text-primary/10 pt-5" aria-label={t("moreLabel")}>
          {mode === "top" && canShowMore ? (
            <Link href={`${base}?view=discover`} className="text-sm font-semibold text-brand-blue hover:underline" data-testid="personal-opportunities-more">
              {t("more", { count: discoverySet })} →
            </Link>
          ) : null}
          {mode === "discover" ? (
            <Link href={base} className="text-sm font-semibold text-brand-blue hover:underline" data-testid="personal-opportunities-back">
              ← {t("back")}
            </Link>
          ) : null}
          <Link href={`${base}?view=all`} className="text-sm text-text-secondary hover:text-text-primary" data-testid="personal-opportunities-market">
            {t("market")} →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
