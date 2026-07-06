"use client";

import { Link } from "@/lib/i18n/navigation";

/** Fired by an inline-dim "+" chip; WorkCardEditor listens and opens. */
export const WORK_CARD_OPEN_EDITOR_EVENT = "work-card:open-editor";

/**
 * A missing-dimension "+" chip that ACTS (dead-UI rule A). Page dims link to
 * their fill surface; inline dims (availability/location/pay) previously
 * pointed at "#work-card" — the card they already sit inside — so tapping them
 * scrolled a few pixels and the editor stayed closed (root-cause audit PR4).
 * Inline dims are now a button that opens the WorkCardEditor directly.
 */
export function WorkCardMissingChip({
  href,
  label,
  title,
  testid,
}: {
  /** Fill surface route for page dims; null for inline dims (opens the editor). */
  href: string | null;
  label: string;
  title: string;
  testid: string;
}) {
  const className =
    "inline-flex min-h-11 items-center gap-1 rounded-md border border-brand-orange/30 bg-brand-orange/5 px-2.5 py-1 text-[11px] text-brand-orange transition-colors hover:border-brand-orange hover:bg-brand-orange/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange";

  if (href) {
    return (
      <Link
        href={href as "/dashboard"}
        data-testid={testid}
        title={title}
        aria-label={title}
        className={className}
      >
        <span aria-hidden>+</span>
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-testid={testid}
      title={title}
      aria-label={title}
      className={className}
      onClick={() => window.dispatchEvent(new Event(WORK_CARD_OPEN_EDITOR_EVENT))}
    >
      <span aria-hidden>+</span>
      {label}
    </button>
  );
}
