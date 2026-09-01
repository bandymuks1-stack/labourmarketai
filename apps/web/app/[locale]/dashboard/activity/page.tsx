import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import {
  ACTIVITY_SOURCE_MODULE_IDS,
  buildActivityRows,
  filterActivityRows,
  isActivitySourceModuleId,
  type ActivityStateFilter,
} from "@/lib/dashboard/activity-centre";
import { getDashboardModule } from "@/lib/dashboard/dashboard-module-registry";
import {
  getDurableNotifications,
  getSpineCounts,
} from "@/lib/notifications/spine";

/**
 * Unified activity centre (control room PR C) — ONE cross-module surface
 * listing everything that requires the caller's awareness.
 *
 * Honest by construction (guard: lib/guards/activity-centre.test.ts):
 *  - the notification spine is the ONLY source — one request-cached
 *    `getSpineCounts()` read (shared with the layout's bell/badges), never
 *    a second count query, never a parallel notification truth;
 *  - every row links the signal's REAL clearing surface and explains its
 *    read semantics — visiting that page IS the read event, so there is
 *    no "mark read" control here (it would be a lie the next page-load
 *    reverts);
 *  - signals without an honest seen-model (demand interest, verification,
 *    journal confirmation) are not listed at all — they join the spine
 *    first (migration-gated, capability gap map §2);
 *  - filtering is searchParams-driven plain links (server component, no
 *    client state) — the accessible pattern the documents page uses.
 */

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const CHIP_ACTIVE = "border-brand-blue text-brand-blue";
const CHIP_IDLE = "border-ink-500 text-text-secondary hover:border-brand-blue";

/** Filter-chip href — omits defaults so the canonical URL stays clean. */
function activityHref(
  state: ActivityStateFilter,
  moduleId: string | null,
): string {
  const params = new URLSearchParams();
  if (state === "all") params.set("state", "all");
  if (moduleId) params.set("module", moduleId);
  const qs = params.toString();
  return qs ? `/dashboard/activity?${qs}` : "/dashboard/activity";
}

export default async function ActivityCentrePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ module?: string; state?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { module: rawModule, state: rawState } = await searchParams;
  const moduleFilter = isActivitySourceModuleId(rawModule) ? rawModule : null;
  const state: ActivityStateFilter = rawState === "all" ? "all" : "attention";

  const tA = await getTranslations("activityCentre");
  const tTypes = await getTranslations("auth.notifications.types");
  // Un-namespaced translator for the registry-sourced module label keys
  // (full paths, reused — the same pattern the module grid uses).
  const t = await getTranslations();

  // The ONE spine read — request-cached, shared with the layout's bell and
  // nav badges, so this page adds zero extra count queries. The durable feed
  // beside it is the OTHER honest row kind (stored facts, persisted read
  // state) — the same source the bell renders, read once with a page-sized
  // limit so events older than the bell's 20-row window stay reachable here
  // (completion v1: the "view all" landing finally shows all).
  const counts = await getSpineCounts();
  const durable = await getDurableNotifications(100);
  const rows = buildActivityRows(counts);
  const visible = filterActivityRows(rows, { moduleId: moduleFilter, state });

  return (
    <div className="flex flex-col gap-6" data-testid="activity-centre-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {tA("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {tA("title")}
        </h1>
        <p className="text-sm text-text-secondary">{tA("intro")}</p>
      </header>

      {/* Honest read model, stated up front: signals clear on their own
          surface — nothing here to mark as read. */}
      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="activity-read-model-note"
      >
        {tA("readModel")}
      </p>

      {/* Filters — plain links driven by searchParams (keyboard accessible,
          no client state). Selection is marked for assistive tech too. */}
      <nav
        className="flex flex-col gap-3"
        aria-label={tA("filters.stateLabel")}
        data-testid="activity-filters"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {tA("filters.stateLabel")}
          </span>
          {(["attention", "all"] as const).map((s) => (
            <Link
              key={s}
              href={activityHref(s, moduleFilter) as "/dashboard"}
              aria-current={state === s ? "true" : undefined}
              data-testid={`activity-filter-state-${s}`}
              className={`${CHIP_BASE} ${state === s ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {tA(`filters.${s}`)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {tA("filters.moduleLabel")}
          </span>
          <Link
            href={activityHref(state, null) as "/dashboard"}
            aria-current={moduleFilter === null ? "true" : undefined}
            data-testid="activity-filter-module-all"
            className={`${CHIP_BASE} ${moduleFilter === null ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {tA("filters.allModules")}
          </Link>
          {ACTIVITY_SOURCE_MODULE_IDS.map((id) => (
            <Link
              key={id}
              href={activityHref(state, id) as "/dashboard"}
              aria-current={moduleFilter === id ? "true" : undefined}
              data-testid={`activity-filter-module-${id}`}
              className={`${CHIP_BASE} ${moduleFilter === id ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {t(getDashboardModule(id).labelKey)}
            </Link>
          ))}
        </div>
      </nav>

      {visible.length === 0 ? (
        /* Calm all-clear — nothing pending is a good state, not an error. */
        <p
          className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary"
          data-testid="activity-all-clear"
        >
          {tA("allClear")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="activity-signal-list">
          {visible.map((row) => (
            <li key={row.id}>
              {/* The whole row is a link to the signal's REAL clearing
                  surface — the row IS the next action, exactly like the
                  bell (audit PR5). */}
              <Link
                href={row.href as "/dashboard"}
                data-testid={`activity-signal-${row.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-500 bg-ink-800/30 px-4 py-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(row.moduleLabelKey)}
                  </span>
                  <span className="text-sm font-semibold text-text-primary">
                    {tTypes(row.typeKey)}
                  </span>
                  {/* Read semantics — where and how this signal clears. */}
                  <span className="text-xs leading-relaxed text-text-muted">
                    {tA(`readSemantics.${row.typeKey}`)}
                  </span>
                </span>
                {row.count > 0 ? (
                  <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange px-1.5 text-xs font-bold leading-none text-white tabular-nums">
                    {row.count}
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
                    {tA("rowClear")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* DURABLE EVENTS (completion v1) — the stored "this happened to you"
          facts from notification_events, the second honest row kind beside
          the derived signals above. Same source as the bell, higher limit.
          Links only (a stored row carries its entity's canonical surface);
          the persisted read state is managed from the bell — this page keeps
          its no-control read model. While the store is unapplied or empty
          the section shows its honest empty line. */}
      <section
        className="flex flex-col gap-2"
        data-testid="activity-stored-events"
      >
        <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
          {tA("storedTitle")}
        </h2>
        <p className="text-xs leading-relaxed text-text-muted">
          {tA("storedIntro")}
        </p>
        {durable.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary"
            data-testid="activity-stored-empty"
          >
            {tA("storedEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="activity-stored-list">
            {durable.map((e) => {
              const body = (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-text-primary">
                      {tTypes.has(e.type as never)
                        ? tTypes(e.type as never)
                        : tTypes("generic")}
                    </span>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {e.created_at.slice(0, 16).replace("T", " ")}
                    </span>
                  </span>
                  {e.read_at === null ? (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full bg-state-live"
                      data-testid={`activity-stored-unread-${e.id}`}
                    />
                  ) : null}
                </span>
              );
              return (
                <li key={e.id}>
                  {e.href ? (
                    <Link
                      href={e.href as "/dashboard"}
                      data-testid={`activity-stored-event-${e.id}`}
                      className={`flex items-center rounded-md border border-ink-500 px-4 py-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                        e.read_at === null ? "bg-ink-800/40" : "bg-ink-800/10"
                      }`}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      data-testid={`activity-stored-event-${e.id}`}
                      className={`flex items-center rounded-md border border-ink-500 px-4 py-3 ${
                        e.read_at === null ? "bg-ink-800/40" : "bg-ink-800/10"
                      }`}
                    >
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
