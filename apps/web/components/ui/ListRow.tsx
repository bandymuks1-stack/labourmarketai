import type { ReactNode } from "react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * ONE LIST ROW — a record in a list: a person, a need, a request, a project.
 *
 * Leading mark (icon or avatar), title, one meta line, and on the right a
 * status (the shared `StatusChip`) and actions. With `href` the title is the
 * link and the whole row is the tap target; actions stay separate controls
 * beside it, never nested inside the link. Use inside `<ul>` — the row is an
 * `<li>`. For a real grid of comparable values use a `<table>`; this is for
 * lists of records, which is what most "tables" in the product are.
 */
export function ListRow({
  href,
  leading,
  title,
  meta,
  status,
  actions,
  testId,
  className,
}: {
  /** Locale-less internal path. Makes the row a link to the record. */
  href?: string;
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  testId?: string;
  className?: string;
}) {
  const text = (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm font-semibold text-text-primary">{title}</span>
      {meta && <span className="truncate text-xs text-text-muted">{meta}</span>}
    </span>
  );
  return (
    <li
      data-testid={testId}
      className={cn(
        "relative flex min-h-14 items-center gap-3 border-b border-ink-600/70 px-3 py-2 last:border-b-0",
        href && "transition-colors hover:bg-ink-800/50 motion-reduce:transition-none",
        className,
      )}
    >
      {leading && (
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-700/70 text-text-secondary">
          {leading}
        </span>
      )}
      {href ? (
        // The link's hit area is the whole row (after:absolute inset-0);
        // status and actions sit above it as their own controls.
        <Link
          href={href}
          className="flex min-w-0 flex-1 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand-blue"
        >
          {text}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1">{text}</span>
      )}
      {status && <span className="relative z-10 shrink-0">{status}</span>}
      {actions && <span className="relative z-10 flex shrink-0 items-center gap-1">{actions}</span>}
    </li>
  );
}
