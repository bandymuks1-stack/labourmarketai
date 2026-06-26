import { getTranslations } from "next-intl/server";
import {
  NotebookPen,
  IdCard,
  MapPin,
  MessageSquare,
  Building2,
  CircleCheck,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

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

const BASE_ACTIONS: readonly ActionDef[] = [
  { key: "recordWork", href: "/dashboard/journal", icon: NotebookPen },
  { key: "improveProfile", href: "/dashboard/profile", icon: IdCard },
  { key: "mapVisibility", href: "/dashboard/market-map", icon: MapPin },
  { key: "checkMessages", href: "/dashboard/communication", icon: MessageSquare },
];

const COMPANY_ACTION: ActionDef = {
  key: "companyActions",
  href: "/dashboard/company",
  icon: Building2,
};

const IMPROVES = ["journal", "profile", "map", "messages"] as const;

export async function MyZone({
  hasCompany,
  incomplete,
}: {
  hasCompany: boolean;
  incomplete: boolean;
}) {
  const t = await getTranslations("auth.dashboard.myZone");
  const actions = hasCompany ? [...BASE_ACTIONS, COMPANY_ACTION] : BASE_ACTIONS;

  return (
    <section className="flex flex-col gap-5" data-testid="my-zone">
      {/* 1. Readiness status — one honest line, never a scary state. */}
      <div
        data-testid="my-zone-status"
        data-incomplete={incomplete ? "true" : "false"}
        className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
          incomplete
            ? "border-brand-orange/50 bg-brand-orange/10 text-brand-orange"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
        }`}
      >
        {incomplete ? (
          <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        ) : (
          <CircleCheck className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        )}
        {incomplete ? t("incompleteStatus") : t("readyStatus")}
      </div>

      {/* 2. Fast actions — the few real things you can do, in seconds. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          {t("actionsHeading")}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {actions.map((a) => (
            <Link
              key={a.key}
              href={a.href as "/dashboard"}
              data-testid={`my-zone-action-${a.key}`}
              className="flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface-1 p-4 transition-colors hover:border-brand-blue"
            >
              <a.icon
                className="h-5 w-5 shrink-0 text-brand-blue"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="font-display text-sm font-semibold leading-snug text-text-primary">
                {t(`actions.${a.key}.title`)}
              </span>
              <span className="text-[11px] leading-snug text-text-secondary">
                {t(`actions.${a.key}.desc`)}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* 3. What improves what — one short, honest explanation. */}
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
    </section>
  );
}
