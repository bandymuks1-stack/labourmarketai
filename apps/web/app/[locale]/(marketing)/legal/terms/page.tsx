import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Public Terms of Service — core contractual truth (legal-entity truth v1).
 *
 * Renders the mandatory, entity-accurate core (contracting party = UAB
 * „Nonstop Group“; Lithuanian law with mandatory-rights carve-outs; IP owner
 * = Labour Market AI Sp. z o.o. as licensor only; no employment guarantee)
 * from `legal.terms.sections`, and keeps the honest note that the FULL
 * lawyer-reviewed terms text is still being finalised — no fake legal
 * finality. Guarded by legal-entity-truth.test.ts.
 */
export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");

  const sections = ["0", "1", "2"].map((i) => ({
    heading: t(`terms.sections.${i}.heading`),
    items: [0, 1, 2]
      .map((j) =>
        t.has(`terms.sections.${i}.items.${j}` as never)
          ? t(`terms.sections.${i}.items.${j}` as never)
          : null,
      )
      .filter((x): x is string => x !== null),
  }));

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-12" data-testid="legal-terms">
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("terms.title")}
      </h1>

      <div className="mt-8 flex flex-col gap-8">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-xl font-semibold text-text-primary">
              {s.heading}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {s.items.map((item) => (
                <li
                  key={item.slice(0, 40)}
                  className="text-sm leading-relaxed text-text-secondary"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Honest pending note: the full binding terms await legal review. */}
      <div className="mt-10 flex flex-col gap-3 border-t border-ink-600/60 pt-6 text-sm leading-relaxed text-text-secondary">
        <p>{t("preparing.body")}</p>
        <p className="text-text-muted">{t("preparing.contact")}</p>
      </div>
    </article>
  );
}
