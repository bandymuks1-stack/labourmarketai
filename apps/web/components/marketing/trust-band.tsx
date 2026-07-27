import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";

/**
 * PR-H global landing — section H: trust & security. Only verifiable,
 * shipped-behaviour claims (doctrine §4 default-closed grants, §7 confirm
 * gates, §3.4 append-only audit log, §19 explained fit + §7.1 logged AI
 * extraction). No certification, guarantee or verification promises.
 */
export async function TrustBand() {
  const t = await getTranslations("landing.trust");
  const items = [
    ["t1t", "t1b"],
    ["t2t", "t2b"],
    ["t3t", "t3b"],
    ["t4t", "t4b"],
  ] as const;

  return (
    <section id="trust" className="mt-16 scroll-mt-24">
      <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
        {t("eyebrow")}
      </p>
      <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
        {t("title")}
      </h2>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([titleKey, bodyKey], i) => (
          <Reveal key={titleKey} delay={i * 0.06}>
            <div className="card-border flex h-full flex-col gap-3 p-5 sm:p-6">
              <span
                className="h-1 w-10 rounded-full bg-state-success"
                aria-hidden
              />
              <h3 className="font-display text-base font-semibold text-text-primary">
                {t(titleKey)}
              </h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                {t(bodyKey)}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
