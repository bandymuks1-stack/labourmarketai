import { getTranslations } from "next-intl/server";
import {
  Activity,
  BarChart3,
  Briefcase,
  CalendarDays,
  FolderKanban,
  Gauge,
  Handshake,
  History,
  MessageSquare,
  Package,
  Store,
  UserSearch,
  UsersRound,
} from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { ConfirmPulse } from "@/components/app/arena/confirm-pulse";

/**
 * THE COMPANY CONTEXT'S CENTRE (owner order 2026-10-01): the company home is
 * COMPANY MANAGEMENT, not a generic chip chat and not the owner's personal CV.
 * It is the model of what a company IS in this product, every entry a door
 * to an EXISTING canonical surface (no new surface, no second marketplace):
 *
 *   what we offer · what we need · marketplace · clients & suppliers ·
 *   people & team · projects & objects · candidates · messages · calendar ·
 *   capacity · work & hours · results · history
 *
 * ONE obvious next action leads (publish a need); the rest is progressive
 * disclosure — the first six entries are visible, the others sit behind
 * "More". Server component, props-free of identity: it renders only inside
 * an organization workspace (the dashboard decides), and each destination
 * re-checks its own rights under RLS. The calendar entry is the ONE calendar
 * (/dashboard/planning); "capacity" is the workforce zone, which the
 * context-parity guard records as a different capability, not a calendar.
 */
type Entry = {
  readonly id: string;
  readonly href: string;
  readonly Icon: React.ComponentType<{ className?: string }>;
};

const PRIMARY: readonly Entry[] = [
  { id: "need", href: "/dashboard/company/needs", Icon: UserSearch },
  { id: "offer", href: "/dashboard/services", Icon: Package },
  { id: "market", href: "/dashboard/listings", Icon: Store },
  { id: "people", href: "/dashboard/company/people", Icon: UsersRound },
  { id: "projects", href: "/dashboard/projects", Icon: FolderKanban },
  { id: "messages", href: "/dashboard/communication", Icon: MessageSquare },
];

const MORE: readonly Entry[] = [
  { id: "clients", href: "/dashboard/company/partners", Icon: Handshake },
  { id: "candidates", href: "/dashboard/company/scouting", Icon: Briefcase },
  { id: "calendar", href: "/dashboard/planning", Icon: CalendarDays },
  { id: "capacity", href: "/dashboard/company/planning", Icon: Gauge },
  { id: "work", href: "/dashboard/hours", Icon: Activity },
  { id: "results", href: "/dashboard/reports", Icon: BarChart3 },
  { id: "history", href: "/dashboard/company/history", Icon: History },
];

function Tile({ entry, label }: { entry: Entry; label: string }) {
  return (
    <Link
      href={entry.href as "/dashboard"}
      data-testid={`company-model-${entry.id}`}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-ink-500 bg-ink-800/40 px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-text-secondary"
    >
      <entry.Icon className="size-4 flex-none text-text-secondary" />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

export async function CompanyModelScreen() {
  const t = await getTranslations("companyModel");
  return (
    <section
      aria-label={t("title")}
      data-testid="company-model"
      className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-2 pt-4"
    >
      <h2 className="font-display text-card-title font-semibold text-text-primary">
        {t("title")}
      </h2>
      {/* What needs the owner first: the real reviewable-entry queue (honest
          unknown when unreadable, calm when empty) — the existing pulse the
          project surfaces already use, not a second counter. */}
      <ConfirmPulse />
      <Link
        href={"/dashboard/company/needs#demand-intake" as "/dashboard"}
        data-testid="company-model-primary"
        className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-blue px-5 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne"
      >
        {t("primary")}
      </Link>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PRIMARY.map((e) => (
          <Tile key={e.id} entry={e} label={t(e.id)} />
        ))}
      </div>
      <details className="group" data-testid="company-model-more">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-text-secondary hover:text-text-primary">
          {t("more")}
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MORE.map((e) => (
            <Tile key={e.id} entry={e} label={t(e.id)} />
          ))}
        </div>
      </details>
    </section>
  );
}
