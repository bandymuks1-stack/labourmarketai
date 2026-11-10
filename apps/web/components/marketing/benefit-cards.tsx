import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/** Benefit cards (icons replaced by index chips for M0): used by every
 *  /for-* sub-page. Content is real marketing copy from messages — not a
 *  placeholder (nothing here is awaiting real data).
 *
 *  `nested`: rendered inside a section that already owns the page container
 *  and an h2 headline (RoleEnrichment). The cards then add no second container
 *  padding — the double inset squeezed three columns to ~175 px at 768 px and
 *  broke words mid-word — and title with h3 under that h2.
 *
 *  Columns follow the count, so no card is left alone on a row: three → 3,
 *  four → 2 then 4, otherwise 2 then 3. Titles hyphenate (the page sets
 *  `lang`), so long German / Dutch compounds wrap at a syllable, not mid-letter. */
export function BenefitCards({
  items,
  nested = false,
}: {
  items: { title: string; body: string }[];
  nested?: boolean;
}) {
  const Title = nested ? "h3" : "h2";
  const columns =
    items.length === 3
      ? "md:grid-cols-3"
      : items.length === 4
        ? "sm:grid-cols-2 xl:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <section
      className={cn(
        "grid gap-6",
        columns,
        !nested && "mx-auto max-w-container px-6 pb-12 sm:px-12",
      )}
    >
      {items.map((it, i) => (
        <Card key={it.title}>
          <span className="inline-grid h-9 w-9 place-items-center rounded-md border border-brand-blue/40 font-mono text-sm text-brand-blue">
            {i + 1}
          </span>
          <Title className="mt-4 hyphens-auto font-display text-lg font-semibold tracking-tight text-text-primary">
            {it.title}
          </Title>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {it.body}
          </p>
        </Card>
      ))}
    </section>
  );
}
