import { getTranslations } from "next-intl/server";

/**
 * Example-preview frame (trust & evidence, launch repair Scope G).
 *
 * The /for-* pages show illustrative preview cards (fictional persona, demand
 * card, agency pool) built from governed placeholders. Those cards must never
 * read as real people, real matches or real pool sizes, so this frame puts an
 * ALWAYS-VISIBLE "Example" chip + one-line explanation directly above the
 * preview — no hover, no tooltip, no fine print. Uses the shared
 * `shared.preview.conceptChip` / `shared.preview.conceptNote` keys.
 */
export async function ExamplePreviewFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("shared.preview");

  return (
    <figure
      className="flex flex-col items-center gap-3"
      data-testid="example-preview-frame"
    >
      <figcaption className="flex max-w-sm flex-col items-center gap-1 text-center">
        <span className="rounded-sm border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("conceptChip")}
        </span>
        <span className="text-meta leading-snug text-text-muted">
          {t("conceptNote")}
        </span>
      </figcaption>
      {children}
    </figure>
  );
}
