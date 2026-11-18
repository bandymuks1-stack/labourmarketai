/**
 * Shared building blocks for the public legal pages. All wording comes from
 * the `legal` i18n namespace.
 *
 * The pages render the policy text itself and nothing about the document's
 * drafting state: no "draft", "pending review" or "not the final document"
 * notices (owner order 2026-10-23, guarded by legal-pages-public-clean.test.ts).
 */

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
