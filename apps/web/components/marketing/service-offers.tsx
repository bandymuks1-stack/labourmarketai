import { getTranslations } from "next-intl/server";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";

/**
 * Productized service offers (AI & automation) rendered on the pricing page.
 *
 * This is a CONTENT layer on top of the existing cinematic baseline — it reuses
 * the same `card-border` / `wow-card` shell, mono small-caps eyebrow, gradient
 * accent word and `Card`-style offer tiles that the rest of the marketing site
 * uses. It deliberately introduces NO new visual language (see the
 * `service-offers-baseline` guard).
 *
 * Honesty (PV §10): prices are shown as indicative "from" amounts only. The
 * single CTA is the existing lead-capture `WaitlistModal`, which inserts a
 * `leads` row — there is no card-payment widget, no third-party billing flow,
 * no recurring-plan claim, and no guaranteed-result promise. The pricing- and
 * CTA-honesty guards scan the copy in `messages/*.json`; the
 * `service-offers-baseline` guard pins this component to the cinematic shell.
 */
type Offer = {
  name: string;
  summary: string;
  priceFrom: string;
  timeline: string;
  includes: string[];
};

export async function ServiceOffers() {
  const t = await getTranslations("services");
  const offers = t.raw("offers") as Offer[];

  return (
    <section className="mx-auto max-w-container px-6 pb-16 sm:px-12">
      <div className="card-border wow-card p-6 sm:p-10">
        <p className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-brand-cyan">
          <span className="live-dot" aria-hidden />
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
          {t("title")}{" "}
          <span className="text-gradient-accent">{t("titleAccent")}</span>
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          {t("subcopy")}
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer, i) => (
            <div key={offer.name} className="flex flex-col card-border p-6">
              <span className="inline-grid h-9 w-9 place-items-center rounded-md border border-brand-blue/40 font-mono text-sm text-brand-blue">
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-text-primary">
                {offer.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {offer.summary}
              </p>

              <div className="mt-5 font-display text-2xl font-bold tracking-tightest text-text-primary">
                {offer.priceFrom}
              </div>
              <p className="mt-1 font-mono text-meta uppercase tracking-label text-text-muted">
                {offer.timeline}
              </p>

              <p className="mt-5 font-mono text-meta uppercase tracking-label text-text-muted">
                {t("includesLabel")}
              </p>
              <ul className="mt-3 flex flex-1 flex-col gap-2 text-sm text-text-secondary">
                {offer.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue"
                    />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <WaitlistModal
                  trigger={t("cta")}
                  source={`services_offer_${i + 1}`}
                  triggerClassName="text-sm font-semibold text-text-primary"
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-text-muted">
          {t("note")}
        </p>
      </div>
    </section>
  );
}
