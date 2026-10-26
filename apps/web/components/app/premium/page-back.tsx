import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * THE BACK LINK — the one "go up a level" control above a page title, for
 * every signed-in area (owner order 2026-10-25: the same title + back pattern
 * in worker, company, agency, admin, projects, marketplace, journal and AI).
 *
 * It replaces back links that had drifted into three looks — a muted text-xs
 * line, a blue underlined text-xs line and a mono uppercase label — each with
 * a typed "←" glyph. One look now: a 16px arrow icon and the destination's
 * name in the support size, muted until hovered. The tap area is the 44px
 * floor every header control keeps, pulled back by a negative margin so the
 * visual rhythm above the title is unchanged.
 *
 * It names WHERE it goes ("Veiksmų centras", "Operacijų skydas"), never just
 * "Back": the person always knows which level they return to. It is a plain
 * link (server-renderable); the destination stays the caller's decision.
 */
export function PageBack({
  href,
  children,
  "data-testid": testId,
  className,
}: {
  readonly href: string;
  readonly children: ReactNode;
  /** Passed through as the link's own test id (existing anchors keep working). */
  readonly "data-testid"?: string;
  readonly className?: string;
}) {
  return (
    <Link
      href={href as "/dashboard"}
      data-testid={testId}
      className={cn(
        "group -my-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full pr-2 text-support font-medium text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-blue",
        className,
      )}
    >
      <ArrowLeft
        className="size-4 shrink-0 transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transition-none"
        strokeWidth={1.75}
        aria-hidden
      />
      <span>{children}</span>
    </Link>
  );
}
