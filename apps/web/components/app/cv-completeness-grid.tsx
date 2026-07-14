import { getTranslations } from "next-intl/server";

/**
 * CV completeness grid (Full CV System v1, "create from any section").
 *
 * One dense card per CV section showing a REAL filled/empty state computed by
 * the profile page from saved data, each linking to its editor (page anchor
 * or route). Order-free by design — the owner requirement is that a worker
 * may start their CV from ANY section, so nothing here is a step sequence,
 * there is no progress %, and no section is "required". No score (§19).
 */

export interface CvSectionCard {
  /** cvSections.names.* key. */
  key: string;
  filled: boolean;
  /** Anchor (#...) or route the card links to. */
  href: string;
}

export async function CvCompletenessGrid({
  sections,
}: {
  sections: CvSectionCard[];
}) {
  const t = await getTranslations("cvSections.grid");
  const tName = await getTranslations("cvSections.names");

  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      data-testid="cv-completeness-grid"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{t("hint")}</p>
      </header>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {sections.map((s) => (
          <li key={s.key}>
            <a
              href={s.href}
              className="flex h-full flex-col gap-1 rounded-md border border-ink-600 px-3 py-2 transition-colors hover:border-brand-blue"
              data-testid={`cv-section-card-${s.key}`}
            >
              <span className="text-xs font-medium text-text-primary">
                {tName(s.key)}
              </span>
              <span
                className={`font-mono text-[10px] uppercase tracking-label ${
                  s.filled ? "text-state-success" : "text-text-muted"
                }`}
                data-testid={`cv-section-state-${s.key}`}
              >
                {s.filled ? `● ${t("filled")}` : `○ ${t("empty")}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
