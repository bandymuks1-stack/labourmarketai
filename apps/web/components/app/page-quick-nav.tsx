import { cn } from "@/lib/utils";

/**
 * PageQuickNav — a sticky, page-local jump bar for long authenticated surfaces
 * (IA cleanup v2, correction #3). Long pages (Mano CV, Profile) get a compact
 * mini-navigation so the user can jump to a section and never get lost after
 * scrolling. Only the anchors RELEVANT to the page are passed in.
 *
 * Pure anchor links (`<a href="#id">`) — no JS, no client bundle. The caller
 * adds matching `id` + `scroll-mt-*` to each target section. Presentational
 * only: labels arrive already-localized.
 */
export type QuickNavItem = {
  /** In-page anchor target, e.g. "#mano-cv-identity". */
  href: string;
  /** Already-localized label. */
  label: string;
};

export function PageQuickNav({
  items,
  ariaLabel,
  className,
}: {
  items: QuickNavItem[];
  /** Localized aria-label for the nav landmark. */
  ariaLabel: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={ariaLabel}
      data-testid="page-quick-nav"
      className={cn(
        "sticky top-14 z-20 -mx-2 flex flex-wrap items-center gap-1 overflow-x-auto rounded-md border border-border-subtle bg-surface-1/80 px-2 py-1.5 backdrop-blur md:top-3",
        className,
      )}
    >
      {items.map((it) => (
        // min-h-11 = 44px touch target (audit PR8): these are decision chips
        // on long mobile pages; visual size stays compact, tap area does not.
        <a
          key={it.href}
          href={it.href}
          className="inline-flex min-h-11 shrink-0 items-center rounded px-2.5 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:bg-ink-700 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}
