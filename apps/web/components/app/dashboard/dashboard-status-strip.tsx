import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import type { StatusStripEntry } from "@/lib/dashboard/control-room-view-model";

/**
 * Compact status strip (PR B) — the control room's one-glance answer to
 * "is anything waiting on me?". Fed by the pure view model, which derives
 * every entry from the notification spine: a row exists ONLY while its
 * real count is > 0, uses the SAME localized copy as the bell
 * (auth.notifications.types.*), and links the exact surface that clears
 * or resolves the signal. Nothing waiting → one honest, calm line — never
 * a wall of fake zeros, never an invented metric.
 */
export async function DashboardStatusStrip({
  entries,
}: {
  entries: readonly StatusStripEntry[];
}) {
  const t = await getTranslations("auth.dashboard.statusStrip");
  const tTypes = await getTranslations("auth.notifications.types");

  return (
    <section
      data-testid="dashboard-status-strip"
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("title")}
        </span>
        <span className="flex items-center gap-3">
          {/* Primary-action hierarchy v1: the ONE clear time-surface door —
              every dated commitment lives on the canonical calendar; the
              dashboard never grows its own time projection. */}
          <Link
            href={"/dashboard/planning" as "/dashboard"}
            data-testid="status-strip-calendar"
            className="rounded-sm font-mono text-[10px] uppercase tracking-label text-brand-blue hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            {t("calendar")} →
          </Link>
          {/* Control room PR C: the strip's full view — the unified activity
              centre, same spine, per-signal read semantics + filters. */}
          <Link
            href={"/dashboard/activity" as "/dashboard"}
            data-testid="status-strip-view-all"
            className="rounded-sm font-mono text-[10px] uppercase tracking-label text-brand-blue hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            {t("viewAll")} →
          </Link>
        </span>
      </div>
      {entries.length === 0 ? (
        <p
          data-testid="status-strip-all-clear"
          className="text-xs leading-relaxed text-text-muted"
        >
          {t("allClear")}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href as "/dashboard"}
                data-testid={`status-strip-${e.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-xs text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              >
                <span>{tTypes(e.typeKey)}</span>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1.5 text-[10px] font-bold leading-none text-white tabular-nums">
                  {e.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
