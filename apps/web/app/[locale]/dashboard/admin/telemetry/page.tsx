import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";

/**
 * Pilot telemetry admin inbox (v1, read-only).
 *
 * Server-gated via `requireSuperadmin(locale)`. The SQL SELECT is also
 * admin-only via the `pilot_events_select` RLS policy in migration 0020
 * — double-gated so a non-admin who guesses the URL gets an empty list.
 *
 * v1 surfaces three panels:
 *   1. Recent events — last 200, newest first.
 *   2. Task completion summary — counts per task_name + result.
 *   3. Top error codes — top 20 (event_name, error_code) pairs by count.
 *
 * Intentionally NOT in v1:
 *   - Per-user drill-down (would need a join + careful labelling).
 *   - Chart rendering (the goal forbids fake charts; numbers are fine).
 *   - Mutating actions (no status flip, no delete — append-only).
 */
type EventRow = {
  id: string;
  created_at: string;
  profile_id: string | null;
  session_id: string;
  route: string;
  locale: string;
  event_name: string;
  task_name: string | null;
  task_step: string | null;
  duration_ms: number | null;
  result: "started" | "success" | "error" | "abandoned" | "info";
  error_code: string | null;
  metadata: Record<string, unknown>;
  app_version: string | null;
};

export default async function AdminTelemetryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireSuperadmin(locale);
  setRequestLocale(locale);
  const t = await getTranslations("telemetry");

  const supabase = await createClient();
  // The generated `Database` type doesn't include `pilot_events` until
  // `pnpm db:types` is re-run after 0020 — cast through `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (
    name: string,
  ) => {
    select: (cols: string) => {
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => Promise<{
          data: EventRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await fromAny("pilot_events")
    .select(
      "id, created_at, profile_id, session_id, route, locale, event_name, task_name, task_step, duration_ms, result, error_code, metadata, app_version",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: EventRow[] = error ? [] : ((data ?? []) as EventRow[]);

  // ── Derived: task completion summary ───────────────────────────────
  type TaskAggKey = string;
  const taskAgg = new Map<TaskAggKey, {
    task: string;
    started: number;
    success: number;
    error: number;
    abandoned: number;
    avgMs: number | null;
  }>();
  for (const r of rows) {
    if (!r.task_name) continue;
    const key = r.task_name;
    const cur = taskAgg.get(key) ?? {
      task: key,
      started: 0,
      success: 0,
      error: 0,
      abandoned: 0,
      avgMs: null,
    };
    if (r.result === "started") cur.started += 1;
    if (r.result === "success") cur.success += 1;
    if (r.result === "error") cur.error += 1;
    if (r.result === "abandoned") cur.abandoned += 1;
    taskAgg.set(key, cur);
  }
  // Compute avg duration for successful task_complete events per task.
  const durations = new Map<string, number[]>();
  for (const r of rows) {
    if (
      r.task_name &&
      r.result === "success" &&
      typeof r.duration_ms === "number"
    ) {
      const arr = durations.get(r.task_name) ?? [];
      arr.push(r.duration_ms);
      durations.set(r.task_name, arr);
    }
  }
  for (const [task, arr] of durations) {
    const cur = taskAgg.get(task);
    if (cur && arr.length > 0) {
      cur.avgMs = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
  }
  const taskRows = [...taskAgg.values()].sort((a, b) =>
    a.task.localeCompare(b.task),
  );

  // ── Derived: top error codes ───────────────────────────────────────
  const errorCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.result !== "error" || !r.error_code) continue;
    const key = `${r.event_name}|${r.error_code}`;
    errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
  }
  const topErrors = [...errorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k, n]) => {
      const [event_name, error_code] = k.split("|");
      return { event_name, error_code, count: n };
    });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {error && (
        <p
          role="alert"
          className="card-border bg-state-danger/5 p-4 text-sm text-state-danger"
        >
          {t("loadError", { msg: error.message ?? "unknown" })}
        </p>
      )}

      <section className="card-border flex flex-col gap-2 p-4">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("tasks.title")}
        </h2>
        <p className="text-[11px] text-text-muted">{t("tasks.help")}</p>
        {taskRows.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("tasks.empty")}</p>
        ) : (
          <table className="text-left text-xs">
            <thead className="border-b border-ink-600/60 text-text-muted">
              <tr>
                <th className="px-2 py-1 font-mono text-[10px] uppercase tracking-label">
                  {t("tasks.col.task")}
                </th>
                <th className="px-2 py-1 font-mono text-[10px] uppercase tracking-label">
                  {t("tasks.col.started")}
                </th>
                <th className="px-2 py-1 font-mono text-[10px] uppercase tracking-label">
                  {t("tasks.col.success")}
                </th>
                <th className="px-2 py-1 font-mono text-[10px] uppercase tracking-label">
                  {t("tasks.col.error")}
                </th>
                <th className="px-2 py-1 font-mono text-[10px] uppercase tracking-label">
                  {t("tasks.col.abandoned")}
                </th>
                <th className="px-2 py-1 font-mono text-[10px] uppercase tracking-label">
                  {t("tasks.col.avgMs")}
                </th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((r) => (
                <tr key={r.task} className="border-b border-ink-700/40">
                  <td className="px-2 py-1 font-mono text-[11px] text-text-primary">
                    {r.task}
                  </td>
                  <td className="px-2 py-1 text-text-secondary">{r.started}</td>
                  <td className="px-2 py-1 text-state-success">{r.success}</td>
                  <td className="px-2 py-1 text-state-danger">{r.error}</td>
                  <td className="px-2 py-1 text-state-warning">
                    {r.abandoned}
                  </td>
                  <td className="px-2 py-1 text-text-secondary">
                    {r.avgMs !== null ? `${r.avgMs} ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card-border flex flex-col gap-2 p-4">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("errors.title")}
        </h2>
        <p className="text-[11px] text-text-muted">{t("errors.help")}</p>
        {topErrors.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("errors.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {topErrors.map((e) => (
              <li
                key={`${e.event_name}|${e.error_code}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="font-mono text-text-secondary">
                  {e.event_name} · {e.error_code}
                </span>
                <span className="font-mono text-state-danger">{e.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-border overflow-x-auto p-0">
        <header className="flex items-center justify-between border-b border-ink-600/60 px-4 py-3">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {t("recent.title")}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("recent.count", { n: rows.length })}
          </span>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-text-secondary">
            {t("recent.empty")}
          </p>
        ) : (
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-ink-700/40 bg-ink-800/40 text-text-muted">
              <tr>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.when")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.result")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.event")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.task")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.route")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.duration")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.error")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("recent.col.metadata")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-ink-700/40 align-top"
                  data-testid={`pilot-event-${r.id}`}
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString(locale)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {r.result}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-primary">
                    {r.event_name}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary">
                    {r.task_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary break-all">
                    {r.route}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.duration_ms !== null ? `${r.duration_ms} ms` : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-state-danger">
                    {r.error_code ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-text-muted">
                    {Object.keys(r.metadata).length === 0
                      ? "—"
                      : JSON.stringify(r.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/admin/agent-os"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("links.agentOs")}
        </Link>
        <Link
          href="/dashboard/admin/language-feedback"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("links.languageFeedback")}
        </Link>
      </section>

      <p className="text-[11px] text-text-muted">{t("footnote")}</p>
    </div>
  );
}
