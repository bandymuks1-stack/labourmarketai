import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import { getAcquisitionFunnel } from "@/lib/admin/conversion-funnel";
import { Card } from "@/components/ui/Card";
import {
  formatDurationMs,
  getTimeToValueSummary,
} from "@/lib/admin/pilot-metrics";
import { getTimeToFirstValueByActor } from "@/lib/admin/ttfv-by-actor";
import {
  formatEurCents,
  formatUsd,
  getAiRunsSummary,
  getUsageLedgerSummary,
} from "@/lib/admin/ai-cost";
import { formatUtcDateTime } from "@/lib/time/display";

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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ excludeAdmins?: string }>;
}) {
  const { locale } = await params;
  await requireSuperadmin(locale);
  setRequestLocale(locale);
  const t = await getTranslations("telemetry");
  const excludeAdmins = (await searchParams)?.excludeAdmins === "1";

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

  // Owner acquisition-funnel summary (Pre-Advertising Launch Readiness v1) —
  // first-party counts + conversion rates + first-touch campaign breakdown.
  const funnel = await getAcquisitionFunnel(supabase);

  // Time-to-first-value summary (Pilot Onboarding and Measurement v1) —
  // GLOBAL per-session timing from the same first-party event store. Honest
  // limits (per-tab sessions, no unique-visitor claims, no cohort slicing
  // without the pilots migration) are stated in the section copy.
  const ttv = await getTimeToValueSummary(supabase);

  // Time to FIRST REAL VALUE per actor (FIRST REAL ECOSYSTEM USE, 2026-09-03):
  // keyed by profile, actor from the first-run intent, start → first real
  // action → first real result. The owner's key pilot metric.
  const ttfv = await getTimeToFirstValueByActor(supabase);

  // AI cost & usage (W14 Pilot Analytics slice v1) — caller's RLS client
  // over ai_runs + usage_cost_events. Production has 0 rows while
  // AI_PROVIDER_MODE stays 'disabled'; the section states that honestly.
  const [aiRuns, usageLedger] = await Promise.all([
    getAiRunsSummary(supabase),
    getUsageLedgerSummary(supabase),
  ]);

  const { data, error } = await fromAny("pilot_events")
    .select(
      "id, created_at, profile_id, session_id, route, locale, event_name, task_name, task_step, duration_ms, result, error_code, metadata, app_version",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const allRows: EventRow[] = error ? [] : ((data ?? []) as EventRow[]);

  // "Exclude admins" (audit F-T3): the owner's own navigation dominates the
  // inbox and drowns real-user signal. Filtered in memory over the fetched
  // window; anon rows (profile_id null) always stay.
  let adminIds = new Set<string>();
  if (excludeAdmins) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [byRole, byActive] = await Promise.all([
      sb.from("profile_roles").select("profile_id").eq("role", "admin"),
      sb.from("profiles").select("id").eq("active_role", "admin"),
    ]);
    adminIds = new Set<string>([
      ...(byRole.data ?? []).map((r: { profile_id: string }) => r.profile_id),
      ...(byActive.data ?? []).map((r: { id: string }) => r.id),
    ]);
  }
  const rows: EventRow[] = excludeAdmins
    ? allRows.filter((r) => !r.profile_id || !adminIds.has(r.profile_id))
    : allRows;
  const hiddenCount = allRows.length - rows.length;

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

      <section
        className="card-border flex flex-col gap-3 p-4"
        data-testid="telemetry-acquisition-funnel"
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold text-text-primary">
            Acquisition funnel
          </h2>
          <p className="text-meta text-text-muted">
            First-party conversion counts for paid-ad readiness — landing →
            CTA → registration, and company-need submissions. Event
            occurrences over the last {funnel.windowDays} days, not unique
            visitors; no revenue attribution. Use the &ldquo;exclude
            admins&rdquo; filter below to remove owner/test navigation.
            {funnel.excludedPreview > 0
              ? ` ${funnel.excludedPreview} non-production (localhost/preview) event(s) excluded.`
              : ""}
            {funnel.excludedAdmin > 0
              ? ` ${funnel.excludedAdmin} platform-admin event(s) excluded.`
              : ""}
          </p>
          {/* W14 item 5 — the limit of the exclusion, stated where the numbers
              are read. Admin exclusion can only remove AUTHENTICATED internal
              activity; browsing the landing page while logged out is, in the
              data, identical to a real visitor. Saying so is what stops these
              counts being read as certified-clean. */}
          <p
            className="text-meta text-text-muted"
            data-testid="telemetry-funnel-contamination"
          >
            {funnel.historicalContaminationUnknown}
          </p>
          {/* The window returned more events than one read covers. Every share
              is withheld rather than computed from a partial population, and
              the counts below are floors — saying so is the difference between
              a cautious number and a wrong one. */}
          {funnel.truncated ? (
            <p
              className="rounded-md border border-state-warning/50 bg-state-warning/5 px-3 py-2 text-meta text-state-warning"
              data-testid="telemetry-funnel-truncated"
            >
              This window holds more events than a single read covers, so the
              counts below are lower bounds (&ldquo;at least&rdquo;) and no
              conversion share can be stated. Narrow the window to get exact
              figures.
            </p>
          ) : null}
        </div>
        {!funnel.available ? (
          <p className="text-sm text-text-secondary">
            No funnel events yet, or the event store is unavailable.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {funnel.counts.map((s) => (
                <div
                  key={s.key}
                  className="rounded-md border border-ink-600/60 px-3 py-2"
                >
                  <div className="font-mono text-lg text-text-primary">
                    {funnel.countsAreLowerBound ? `≥ ${s.count}` : s.count}
                  </div>
                  <div className="text-meta text-text-muted">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {/* W14 item 7 — THREE outcomes, three renderings. `pct === null`
                  covers two different facts, and one dash for both told the
                  reader nothing: "no landings yet" and "the read hit its cap so
                  no share can be stated" are different answers. A measured 0%
                  is a third thing again — an answer, not an absence. The note
                  under each rate has been computed since #1086 and was shown
                  nowhere. */}
              {funnel.rates.map((r) => (
                <div key={r.label} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-text-secondary">{r.label}</span>
                    <span
                      className={`font-mono ${
                        r.state === "ok" ? "text-text-primary" : "text-text-muted"
                      }`}
                      data-testid={`funnel-rate-${r.state}`}
                    >
                      {r.state === "ok"
                        ? `${r.pct}%`
                        : r.state === "truncated"
                          ? "not stated"
                          : "no data yet"}
                    </span>
                  </div>
                  <span className="text-meta text-text-muted">{r.note}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                First-touch source (conversions)
              </h3>
              {funnel.sources.length === 0 ? (
                <p className="text-xs text-text-secondary">
                  No attributed conversions yet.
                </p>
              ) : (
                funnel.sources.map((s) => (
                  <div
                    key={s.source}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-mono text-text-secondary">
                      {s.source}
                    </span>
                    <span className="font-mono text-text-primary">
                      {s.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* Folded per PR #773 doctrine: time-to-value is secondary detail
          behind the funnel. */}
      <details
        className="card-border p-4"
        data-testid="telemetry-time-to-value"
      >
        <summary className="cursor-pointer font-display text-base font-semibold text-text-primary">
          {t("ttv.title")}
        </summary>
        <div className="flex flex-col gap-3 pt-3">
          <p className="text-meta text-text-muted">
            {t("ttv.help")}
            {ttv.excludedPreview > 0
              ? ` ${t("ttv.excludedNote", { n: ttv.excludedPreview })}`
              : ""}
          </p>
          {!ttv.available ? (
            <p className="text-sm text-text-secondary">{t("ttv.unavailable")}</p>
          ) : ttv.sessionsReachedValue === 0 ? (
            <p className="text-sm text-text-secondary">{t("ttv.empty")}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-ink-600/60 px-3 py-2">
                  <div className="font-mono text-lg text-text-primary">
                    {formatDurationMs(ttv.medianMs)}
                  </div>
                  <div className="text-meta text-text-muted">
                    {t("ttv.median")}
                  </div>
                </div>
                <div className="rounded-md border border-ink-600/60 px-3 py-2">
                  <div className="font-mono text-lg text-text-primary">
                    {formatDurationMs(ttv.p75Ms)}
                  </div>
                  <div className="text-meta text-text-muted">
                    {t("ttv.p75")}
                  </div>
                </div>
                <div className="rounded-md border border-ink-600/60 px-3 py-2">
                  <div className="font-mono text-lg text-text-primary">
                    {ttv.sessionsWithStart}
                  </div>
                  <div className="text-meta text-text-muted">
                    {t("ttv.sessionsWithStart")}
                  </div>
                </div>
                <div className="rounded-md border border-ink-600/60 px-3 py-2">
                  <div className="font-mono text-lg text-text-primary">
                    {ttv.sessionsReachedValue}
                  </div>
                  <div className="text-meta text-text-muted">
                    {t("ttv.sessionsReachedValue")}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("ttv.firstValueEvent")}
                </h3>
                {ttv.byFirstValueEvent.map((v) => (
                  <div
                    key={v.event}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-mono text-text-secondary">
                      {v.event}
                    </span>
                    <span className="font-mono text-text-primary">
                      {v.sessions}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </details>

      <Card compact className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold text-text-primary">
            AI cost and usage
          </h2>
          <p className="text-meta text-text-muted">
            First-party AI accounting: per-run audit rows (ai_runs, USD from
            the reviewed pricing table) and the canonical EUR-cent usage
            ledger (usage_cost_events). While the AI provider mode stays
            disabled in production both tables hold 0 rows — the zeros below
            are real measurements, not placeholders. Unknown cost is shown as
            a dash, never as 0.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-ink-600/60 px-3 py-2">
            <div className="font-mono text-lg text-text-primary">
              {aiRuns.available ? aiRuns.totalRuns : "—"}
            </div>
            <div className="text-meta text-text-muted">
              AI runs (recent window)
            </div>
          </div>
          <div className="rounded-md border border-ink-600/60 px-3 py-2">
            <div className="font-mono text-lg text-text-primary">
              {usageLedger.available ? usageLedger.totalEvents : "—"}
            </div>
            <div className="text-meta text-text-muted">
              Usage ledger events
            </div>
          </div>
          <div className="rounded-md border border-ink-600/60 px-3 py-2">
            <div className="font-mono text-lg text-text-primary">
              {formatUsd(
                aiRuns.byDay.reduce<number | null>(
                  (acc, g) =>
                    g.actualCostUsd === null
                      ? acc
                      : (acc ?? 0) + g.actualCostUsd,
                  null,
                ),
              )}
            </div>
            <div className="text-meta text-text-muted">
              Actual run cost, USD (costed runs only)
            </div>
          </div>
          <div className="rounded-md border border-ink-600/60 px-3 py-2">
            <div className="font-mono text-lg text-text-primary">
              {formatEurCents(
                usageLedger.byDay.reduce<number | null>(
                  (acc, g) =>
                    g.actualCents === null ? acc : (acc ?? 0) + g.actualCents,
                  null,
                ),
              )}
            </div>
            <div className="text-meta text-text-muted">
              Ledger actual cost, EUR
            </div>
          </div>
        </div>
        {!aiRuns.available && (
          <p className="text-sm text-text-secondary">
            ai_runs is not readable from this session (missing table or no
            admin read) — reported as unavailable, not as zero.
          </p>
        )}
        {!usageLedger.available && (
          <p className="text-sm text-text-secondary">
            usage_cost_events is not readable from this session (missing
            table or no admin read) — reported as unavailable, not as zero.
          </p>
        )}
        {aiRuns.available && aiRuns.totalRuns === 0 &&
          usageLedger.available && usageLedger.totalEvents === 0 ? (
          <p className="text-sm text-text-secondary">
            No AI runs and no usage events recorded yet. This is the honest
            current state — breakdowns will appear with the first live run.
          </p>
        ) : (
          <details className="flex flex-col gap-2">
            <summary className="cursor-pointer text-sm font-medium text-text-secondary">
              Breakdowns by day, task type and provider
            </summary>
            <div className="flex flex-col gap-4 pt-3">
              {(
                [
                  { title: "ai_runs by day", groups: aiRuns.byDay },
                  { title: "ai_runs by task type", groups: aiRuns.byTaskType },
                  { title: "ai_runs by provider", groups: aiRuns.byProvider },
                ] as const
              ).map((b) => (
                <div key={b.title} className="flex flex-col gap-1">
                  <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {b.title}
                  </h3>
                  {b.groups.length === 0 ? (
                    <p className="text-xs text-text-secondary">No rows.</p>
                  ) : (
                    b.groups.map((g) => (
                      <div
                        key={g.key}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-mono text-text-secondary">
                          {g.key}
                        </span>
                        <span className="font-mono text-text-primary">
                          {g.runs} runs · {g.inputTokens}/{g.outputTokens} tok ·{" "}
                          {formatUsd(g.actualCostUsd)}
                          {g.actualCostUsd !== null
                            ? ` (${g.costedRuns} costed)`
                            : ""}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ))}
              {(
                [
                  { title: "usage ledger by day", groups: usageLedger.byDay },
                  { title: "usage ledger by service", groups: usageLedger.byService },
                  { title: "usage ledger by provider", groups: usageLedger.byProvider },
                ] as const
              ).map((b) => (
                <div key={b.title} className="flex flex-col gap-1">
                  <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {b.title}
                  </h3>
                  {b.groups.length === 0 ? (
                    <p className="text-xs text-text-secondary">No rows.</p>
                  ) : (
                    b.groups.map((g) => (
                      <div
                        key={g.key}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-mono text-text-secondary">
                          {g.key}
                        </span>
                        <span className="font-mono text-text-primary">
                          {g.events} events · actual{" "}
                          {formatEurCents(g.actualCents)} · est.{" "}
                          {formatEurCents(g.estimatedCents)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </Card>

      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="telemetry-admin-filter"
      >
        <Link
          href={
            (excludeAdmins
              ? "/dashboard/admin/telemetry"
              : "/dashboard/admin/telemetry?excludeAdmins=1") as "/dashboard"
          }
          className="rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {excludeAdmins ? t("filter.showAll") : t("filter.excludeAdmins")}
        </Link>
        {excludeAdmins && (
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("filter.hiddenNote", { n: hiddenCount })}
          </span>
        )}
      </div>

      <section className="card-border flex flex-col gap-2 p-4">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("tasks.title")}
        </h2>
        <p className="text-meta text-text-muted">{t("tasks.help")}</p>
        {taskRows.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("tasks.empty")}</p>
        ) : (
          <table className="text-left text-xs">
            <thead className="border-b border-ink-600/60 text-text-muted">
              <tr>
                <th className="px-2 py-1 font-mono text-meta uppercase tracking-label">
                  {t("tasks.col.task")}
                </th>
                <th className="px-2 py-1 font-mono text-meta uppercase tracking-label">
                  {t("tasks.col.started")}
                </th>
                <th className="px-2 py-1 font-mono text-meta uppercase tracking-label">
                  {t("tasks.col.success")}
                </th>
                <th className="px-2 py-1 font-mono text-meta uppercase tracking-label">
                  {t("tasks.col.error")}
                </th>
                <th className="px-2 py-1 font-mono text-meta uppercase tracking-label">
                  {t("tasks.col.abandoned")}
                </th>
                <th className="px-2 py-1 font-mono text-meta uppercase tracking-label">
                  {t("tasks.col.avgMs")}
                </th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((r) => (
                <tr key={r.task} className="border-b border-ink-700/40">
                  <td className="px-2 py-1 font-mono text-meta text-text-primary">
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

      <Card compact>
      <section
        className="flex flex-col gap-3"
        data-testid="telemetry-ttfv-by-actor"
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base font-semibold text-text-primary">
            Time to first real value — per actor
          </h2>
          <p className="text-meta text-text-muted">
            Keyed by person (not tab session). Start = signup or onboarding
            completed; first real action = the first state-changing event
            (journal entry, CV import, demand, service request, booking
            proposal, contact request, or the dedicated first_real_action);
            first real result = match preview, contact disclosed, booking
            accepted, engagement created, or first_real_result. Actor comes
            from the first-run intent (work / hire / agency / student /
            education), falling back to the coarse identity. Medians over the
            last {8000} events; preview-host and anonymous rows excluded
            {ttfv.excludedPreview > 0 ? ` (${ttfv.excludedPreview} excluded)` : ""}.
          </p>
        </div>
        {!ttfv.available ? (
          <p className="text-sm text-text-secondary">Not readable from this session.</p>
        ) : ttfv.usersWithStart === 0 ? (
          <p className="text-sm text-text-secondary">
            No person has completed signup or onboarding in the window yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm" data-testid="telemetry-ttfv-table">
            <thead className="text-meta uppercase tracking-label text-text-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">Actor</th>
                <th className="py-1 pr-3 font-normal">People</th>
                <th className="py-1 pr-3 font-normal">Reached action</th>
                <th className="py-1 pr-3 font-normal">Median to action</th>
                <th className="py-1 pr-3 font-normal">Reached result</th>
                <th className="py-1 pr-3 font-normal">Median to result</th>
              </tr>
            </thead>
            <tbody>
              {ttfv.byActor.map((b) => (
                <tr key={b.actor} className="border-t border-ink-600" data-testid={`ttfv-actor-${b.actor}`}>
                  <td className="py-1.5 pr-3 text-text-primary">{b.actor}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{b.users}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{b.reachedAction}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {b.medianToActionMs === null ? "—" : formatDurationMs(b.medianToActionMs)}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{b.reachedResult}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {b.medianToResultMs === null ? "—" : formatDurationMs(b.medianToResultMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      </Card>

      <section className="card-border flex flex-col gap-2 p-4">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("errors.title")}
        </h2>
        <p className="text-meta text-text-muted">{t("errors.help")}</p>
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
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
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
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
                  {t("recent.col.when")}
                </th>
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
                  {t("recent.col.result")}
                </th>
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
                  {t("recent.col.event")}
                </th>
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
                  {t("recent.col.task")}
                </th>
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
                  {t("recent.col.route")}
                </th>
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
                  {t("recent.col.duration")}
                </th>
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
                  {t("recent.col.error")}
                </th>
                <th className="px-3 py-2 font-mono text-meta uppercase tracking-label">
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
                  <td className="px-3 py-2 font-mono text-meta text-text-secondary whitespace-nowrap">
                    {formatUtcDateTime(r.created_at, locale)}
                  </td>
                  <td className="px-3 py-2 font-mono text-meta uppercase tracking-label text-text-muted">
                    {r.result}
                  </td>
                  <td className="px-3 py-2 font-mono text-meta text-text-primary">
                    {r.event_name}
                  </td>
                  <td className="px-3 py-2 font-mono text-meta text-text-secondary">
                    {r.task_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-meta text-text-secondary break-all">
                    {r.route}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.duration_ms !== null ? `${r.duration_ms} ms` : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-meta text-state-danger">
                    {r.error_code ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-meta text-text-muted">
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

      <p className="text-meta text-text-muted">{t("footnote")}</p>
    </div>
  );
}
