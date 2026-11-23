import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { iconControl } from "@/components/app/conversation/chat/icon-scale";
import { cn } from "@/lib/utils";

/**
 * SECTION HEAD — the compact head of a workspace card: an icon tile and the
 * section name on one line, an optional trailing node (a count, a link). The
 * section's explanation does not sit under it as a paragraph (decision 0032):
 * it goes one tap away in `Explain`, so the card starts with its content.
 */
export function SectionHead({
  id,
  icon: Icon,
  title,
  trailing,
  className,
}: {
  /** The heading id the section's `aria-labelledby` points at. */
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-ink-600 bg-ink-800 text-text-secondary"
      >
        <Icon {...iconControl()} />
      </span>
      <h2 id={id} className="min-w-0 flex-1 font-display text-base font-semibold text-text-primary">
        {title}
      </h2>
      {trailing}
    </header>
  );
}
