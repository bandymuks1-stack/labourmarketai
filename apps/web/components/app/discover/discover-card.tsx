import {
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  Gauge,
  Globe2,
  GraduationCap,
  Handshake,
  MapPin,
  Network,
  Package,
  Search,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import type {
  DiscoverIconKey,
  DiscoverSide,
} from "@/lib/discover/discover-registry";

const ICONS: Record<DiscoverIconKey, LucideIcon> = {
  map: MapPin,
  sparkles: Sparkles,
  briefcase: Briefcase,
  globe: Globe2,
  gauge: Gauge,
  search: Search,
  clipboard: ClipboardList,
  users: Users,
  network: Network,
  store: Store,
  handshake: Handshake,
  resources: Package,
  graduation: GraduationCap,
  book: BookOpen,
  building: Building2,
};

/**
 * One Discover door. A real link to a real section (never a dead card), in the
 * CURRENT x Q language: a lit ink surface, a gold hairline that wakes on hover,
 * display type for the title. `feature` doors (the spatial lens) are larger.
 * Copy arrives localised; nothing here invents a count or a listing.
 */
export function DiscoverCard({
  id,
  href,
  icon,
  title,
  description,
  sideLabel,
  statusLabel,
  feature = false,
}: {
  id: string;
  href: string;
  icon: DiscoverIconKey;
  title: string;
  description: string;
  sideLabel: string;
  side?: DiscoverSide;
  /** Present only for `early` branches. */
  statusLabel?: string;
  feature?: boolean;
}) {
  const Icon = ICONS[icon];
  return (
    <Link
      href={href as "/dashboard"}
      data-testid={`discover-card-${id}`}
      className={cn(
        "group relative flex min-h-11 flex-col gap-3 overflow-hidden rounded-3xl bg-ink-800/80 p-5 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_0_0_1px_rgb(255_255_255/0.07)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_1px_0_rgb(255_255_255/0.14)_inset,0_0_0_1px_rgb(var(--c-brand-blue)/0.55),0_24px_60px_-30px_rgb(var(--c-brand-blue)/0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none sm:p-6",
        feature && "sm:min-h-[168px]",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-blue/10 blur-2xl transition-opacity group-hover:bg-brand-blue/20"
      />
      <span className="relative flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-ink-700 text-brand-blue shadow-[0_0_0_1px_rgb(var(--c-brand-blue)/0.28)]">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <ArrowUpRight
          aria-hidden
          className="h-5 w-5 text-text-muted transition-colors group-hover:text-brand-blue"
          strokeWidth={1.75}
        />
      </span>
      <span className="relative flex flex-col gap-1.5">
        <span
          className={cn(
            "font-display font-bold leading-[1.1] tracking-tightest text-text-primary",
            feature ? "text-2xl" : "text-xl",
          )}
        >
          {title}
        </span>
        <span className="text-support text-text-secondary">{description}</span>
      </span>
      <span className="relative mt-auto flex flex-wrap items-center gap-2 pt-1">
        <span className="rounded-full bg-ink-700 px-2.5 py-1 text-meta font-medium text-text-secondary">
          {sideLabel}
        </span>
        {statusLabel && (
          <span
            data-testid={`discover-status-${id}`}
            className="rounded-full px-2.5 py-1 text-meta font-medium text-brand-blue shadow-[0_0_0_1px_rgb(var(--c-brand-blue)/0.4)]"
          >
            {statusLabel}
          </span>
        )}
      </span>
    </Link>
  );
}
