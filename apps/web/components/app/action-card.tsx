import type { LucideIcon } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * ActionCard — THE reusable navigation-card pattern (audit PR8, extracted
 * from the owner-approved MyZone grid card, the product's reference action
 * pattern). One visual grammar for "tap this to go do that":
 *
 *   optional icon → short title → one-line description, inside a
 *   `bg-surface-1` / `border-border-subtle` card that brightens on hover and
 *   shows a real focus ring. Minimum touch height 44px (min-h-11).
 *
 * Rules it encodes (so adopters can't drift):
 *   - it is ALWAYS a real link to an existing route — never a dead surface;
 *     non-clickable chrome must NOT use this component (dead-UI rule B);
 *   - affordance comes from the pattern (hover border + focus-visible ring),
 *     not from per-file styling;
 *   - copy arrives already localized; no fake counts, no invented urgency.
 */
export function ActionCard({
  href,
  title,
  description,
  icon: Icon,
  testid,
  className,
}: {
  /** Existing app route (typedRoutes-compatible via the shared Link). */
  href: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  testid?: string;
  className?: string;
}) {
  return (
    <Link
      href={href as "/dashboard"}
      data-testid={testid}
      className={cn(
        "flex min-h-11 flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface-1 p-4 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        className,
      )}
    >
      {Icon ? (
        <Icon
          className="h-5 w-5 shrink-0 text-brand-blue"
          strokeWidth={1.75}
          aria-hidden
        />
      ) : null}
      <span className="font-display text-sm font-semibold leading-snug text-text-primary">
        {title}
      </span>
      {description ? (
        <span className="text-[11px] leading-snug text-text-secondary">
          {description}
        </span>
      ) : null}
    </Link>
  );
}
