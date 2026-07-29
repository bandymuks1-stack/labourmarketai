import { getTranslations } from "next-intl/server";

/**
 * Shared building blocks for the compliance / explanation pack (CR train
 * WAGON 2). All wording comes from the `legal` i18n namespace (lt/en/ru).
 *
 * Honesty contract (train §4.3 + stop-rule 5):
 *  - `PendingLegalNotice` is the visible "final wording pending owner/legal
 *    review" state. Every legal explanation page renders it while the binding
 *    wording is still owner/lawyer-gated. It must NEVER be removed by copy
 *    that claims lawyer approval — the compliance-explanation-pack guard bans
 *    fake finalization tokens.
 *  - `LegalDisclaimer` is the "informational only, not legal advice" line.
 *  - `PendingLegalItems` lists the EXACT sentences/facts a page still owes to
 *    the owner/lawyer, so pending wording is explicit, not vague.
 */

export async function PendingLegalNotice() {
  const t = await getTranslations("legal.pendingLegal");
  return (
    <aside
      role="note"
      aria-label={t("badge")}
      data-testid="pending-legal-note"
      className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 p-4"
    >
      <span className="inline-flex w-fit items-center gap-2 rounded-sm border border-state-warning/40 bg-state-warning/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning">
        {t("badge")}
      </span>
      <p className="text-sm leading-relaxed text-text-secondary">{t("body")}</p>
    </aside>
  );
}

export async function LegalDisclaimer() {
  const t = await getTranslations("legal");
  return (
    <p
      data-testid="legal-disclaimer"
      className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
    >
      {t("disclaimer")}
    </p>
  );
}

export interface LegalSection {
  heading: string;
  items: string[];
}

/** Plain heading + bullet list renderer used by the legal explanation pages. */
export function LegalSectionList({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="mt-8 flex flex-col gap-8">
      {sections.map((section) => (
        <section key={section.heading}>
          <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
            {section.heading}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {section.items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-md border border-border-subtle bg-surface-1 px-4 py-3 text-sm leading-relaxed text-text-secondary"
              >
                <span aria-hidden className="mt-0.5 font-mono text-xs text-text-muted">
                  •
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Explicit list of the facts/sentences a page still owes to owner/legal review. */
export function PendingLegalItems({ title, items }: { title: string; items: string[] }) {
  return (
    <section
      data-testid="pending-legal-items"
      className="mt-8 rounded-md border border-state-warning/40 bg-state-warning/5 p-4"
    >
      <p className="font-mono text-meta uppercase tracking-label text-state-warning">{title}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-text-secondary">
            — {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
