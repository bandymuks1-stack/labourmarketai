import { Card } from "@/components/ui/Card";

/** Three benefit cards (icons replaced by index chips for M0): used by every
 *  /for-* sub-page. Content is real marketing copy from messages — not a
 *  placeholder (nothing here is awaiting real data). */
export function BenefitCards({
  items,
}: {
  items: { title: string; body: string }[];
}) {
  return (
    <section className="mx-auto grid max-w-container gap-6 px-6 pb-12 sm:px-12 md:grid-cols-3">
      {items.map((it, i) => (
        <Card key={it.title}>
          <span className="inline-grid h-9 w-9 place-items-center rounded-md border border-brand-blue/40 font-mono text-sm text-brand-blue">
            {i + 1}
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-text-primary">
            {it.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {it.body}
          </p>
        </Card>
      ))}
    </section>
  );
}
