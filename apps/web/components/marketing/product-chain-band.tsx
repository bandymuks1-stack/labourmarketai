import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";
import { EvidenceDot, type EvidenceStanding } from "@/components/app/work-world/primitives";

/**
 * PRODUCT CHAIN BAND (landing rebuild 2026-07-29).
 *
 * The owner's one-sentence product, drawn as the six-link chain it really is:
 *
 *   DARBO POREIKIS → TINKAMAS ŽMOGUS → REALUS DARBAS → DARBO ŽURNALAS
 *   → ĮRODYTI ĮGŪDŽIAI → GERESNĖ KITA GALIMYBĖ
 *
 * The JOURNAL link is visually the pivot — it is the platform's genuine
 * differentiator (work becomes recorded evidence, evidence becomes the next
 * opportunity), so it gets the accent treatment while the rest stay calm.
 * Server component; motion via the existing <Reveal/> (reduced-motion safe).
 */
export async function ProductChainBand() {
  const t = await getTranslations("landing.chain");

  const steps = ["need", "person", "work", "journal", "skills", "next"] as const;
  // The signature evidence diamond, with the colour role it has INSIDE the
  // product (work-world grammar, propagated 2026-09-18): the journal link is
  // cyan EVIDENCE, proven skills are champagne ATTESTATION, and every other
  // link is a reported step. A legend of the grammar a visitor will meet
  // after signing in — not a claim about anyone's record.
  const standing: Record<(typeof steps)[number], EvidenceStanding> = {
    need: "ORGANIZATION_REPORTED",
    person: "ORGANIZATION_REPORTED",
    work: "ORGANIZATION_REPORTED",
    journal: "SELF_REPORTED",
    skills: "ORGANIZATION_ATTESTED",
    next: "ORGANIZATION_REPORTED",
  };

  return (
    // NO `id="how-it-works"` HERE. `page.tsx` already wraps this band in
    // `<div id="how-it-works" className="scroll-mt-24">`, so the nav anchor
    // was never dead — adding a second id here duplicated it, which is an
    // accessibility defect and exactly the kind of thing a guard is supposed
    // to prevent rather than cause. Caught in the browser, not by the guard,
    // because the guard's file list had excluded page.tsx.
    <section className="mt-24" aria-labelledby="product-chain-title">
      <Reveal>
        <p className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("eyebrow")}
        </p>
        <h2
          id="product-chain-title"
          className="mt-3 max-w-2xl font-display text-3xl font-bold leading-[1.08] tracking-tightest sm:text-4xl"
        >
          {t("title")}
        </h2>
      </Reveal>

      <Reveal delay={0.08}>
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {steps.map((key, i) => {
            const isPivot = key === "journal";
            return (
              <li
                key={key}
                className={`relative flex flex-col gap-2 rounded-xl border p-4 ${
                  isPivot
                    ? "border-brand-cyan/50 bg-brand-cyan/5"
                    : "border-ink-500 bg-ink-800/40"
                }`}
              >
                <span
                  className={`inline-flex items-center gap-2 font-mono text-meta font-semibold ${
                    isPivot ? "text-brand-cyan" : "text-text-muted"
                  }`}
                >
                  <EvidenceDot state={standing[key]} />
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {t(`steps.${key}.title`)}
                </span>
                <span className="text-xs leading-relaxed text-text-secondary">
                  {t(`steps.${key}.body`)}
                </span>
                {/* The connective arrow — the CHAIN is the message. */}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-text-muted lg:block"
                  >
                    →
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Reveal>

      {/* The journal sentence — why the pivot is the pivot. */}
      <Reveal delay={0.12}>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("journalNote")}
        </p>
      </Reveal>
    </section>
  );
}
