import { getTranslations } from "next-intl/server";
import {
  NotebookPen,
  IdCard,
  MapPin,
  MessageSquare,
  Building2,
  Compass,
  CalendarDays,
  FileText,
  CircleCheck,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import { ActionCard } from "./action-card";
import { StatusChip } from "./status-chip";

/**
 * Mano erdvė control room (action-first-product-logic-v1).
 *
 * Owner principle: the user arrives, instantly understands what they can do,
 * and completes the next useful action in seconds. This is the single
 * action-first block of the personal dashboard — NOT a wall of loosely related
 * cards. It carries three things and nothing else:
 *   1. a one-line readiness status (information complete or not yet);
 *   2. "Ką galite padaryti dabar" — the few real fast actions, with human
 *      labels (record work / improve profile / be visible on the map / check
 *      messages, + company actions only when a real company exists);
 *   3. "Kas ką gerina" — one short, honest explanation of how the actions feed
 *      each other (journal → skills/profile/CV → visibility; map = where you
 *      are visible; messages = trusted contact only).
 *
 * Real data only: `incomplete` is derived from the worker's real profession +
 * entry state; `hasCompany` from a real owned company. No fake data, no
 * preview/sample actions, no admin/internal language.
 */

type ActionDef = { key: string; href: string; icon: LucideIcon };

// One canonical control room — every fast action routes to an EXISTING surface
// (no new/duplicate page). Opportunities, planning/bookings and reports/documents
// were reachable only by direct URL or count-gated cards; surfacing them here
// makes the canonical surfaces findable. Each destination renders its own honest
// state (empty / preparing), so a link is never a fake "available" claim.
const BASE_ACTIONS: readonly ActionDef[] = [
  { key: "recordWork", href: "/dashboard/journal", icon: NotebookPen },
  { key: "improveProfile", href: "/dashboard/profile", icon: IdCard },
  { key: "findOpportunities", href: "/dashboard/opportunities", icon: Compass },
  { key: "planning", href: "/dashboard/bookings", icon: CalendarDays },
  { key: "mapVisibility", href: "/dashboard/market-map", icon: MapPin },
  { key: "checkMessages", href: "/dashboard/communication", icon: MessageSquare },
  { key: "documents", href: "/dashboard/documents", icon: FileText },
];

const COMPANY_ACTION: ActionDef = {
  key: "companyActions",
  href: "/dashboard/company",
  icon: Building2,
};

const IMPROVES = ["journal", "profile", "map", "messages"] as const;

/** "Kas ką gerina" — the explanation half of the control room, mountable on
 *  its own so the dashboard can keep the ACTION grid above the fold and demote
 *  this help block below the active-work surfaces (audit PR6: help must never
 *  render before action). Same copy, same honesty rules. */
export async function MyZoneImproves() {
  const t = await getTranslations("auth.dashboard.myZone");
  return (
    <div
      data-testid="my-zone-improves"
      className="flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-ink-800/20 p-4"
    >
      <h3 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("improvesHeading")}
      </h3>
      <ul className="flex flex-col gap-1 text-xs leading-relaxed text-text-secondary">
        {IMPROVES.map((k) => (
          <li key={k} className="flex items-start gap-2">
            <span aria-hidden className="mt-1 text-brand-blue">
              ·
            </span>
            {t(`improves.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function MyZone({
  hasCompany,
  incomplete,
  improves = true,
}: {
  hasCompany: boolean;
  incomplete: boolean;
  /** Render the "Kas ką gerina" block inline (default). The dashboard passes
   *  false and mounts <MyZoneImproves/> below the fold instead. */
  improves?: boolean;
}) {
  const t = await getTranslations("auth.dashboard.myZone");
  const actions = hasCompany ? [...BASE_ACTIONS, COMPANY_ACTION] : BASE_ACTIONS;

  return (
    <section className="flex flex-col gap-5" data-testid="my-zone">
      {/* 1. Readiness status — one honest line, never a scary state. Uses the
          shared StatusChip (audit PR8): semantic tokens only, no raw emerald. */}
      <StatusChip
        variant={incomplete ? "attention" : "success"}
        icon={incomplete ? CircleAlert : CircleCheck}
        testid="my-zone-status"
      >
        {incomplete ? t("incompleteStatus") : t("readyStatus")}
      </StatusChip>

      {/* 2. Fast actions — the few real things you can do, in seconds. Each
          tile is the shared ActionCard (this grid is the pattern's ORIGIN —
          extracted verbatim in audit PR8 and re-adopted here). */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          {t("actionsHeading")}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {actions.map((a) => (
            <ActionCard
              key={a.key}
              href={a.href}
              testid={`my-zone-action-${a.key}`}
              icon={a.icon}
              title={t(`actions.${a.key}.title`)}
              description={t(`actions.${a.key}.desc`)}
            />
          ))}
        </div>
      </div>

      {/* 3. What improves what — one short, honest explanation. The dashboard
          demotes it below active work via improves={false} + <MyZoneImproves/>. */}
      {improves && <MyZoneImproves />}
    </section>
  );
}
