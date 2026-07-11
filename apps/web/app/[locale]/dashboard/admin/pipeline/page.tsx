import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { getPipelineOverview } from "@/lib/crm/pipeline";
import {
  PIPELINE_SOURCE_TYPES,
  PIPELINE_STAGES,
  filterPipelineItems,
  isPipelineSourceType,
  isPipelineStage,
  type PipelineSourceType,
  type PipelineStage,
} from "@/lib/crm/pipeline-model";

/**
 * CRM / demand pipeline — operator read surface (control room PR F,
 * gap map §5 "read consolidation").
 *
 * ONE queue over ALL existing demand sources (customer_requests in
 * operator-review states, anonymous public company-need intakes, stored
 * leads, waitlist signups). Every row shows its STORED status verbatim next
 * to the mapped presentation stage — the stage is a read lens, never a
 * replacement. NO outbound action, NO status mutation here: each row links
 * to the REAL existing surface where it is worked today.
 *
 * Server-side gate: the admin layout runs `requireSuperadmin` for the whole
 * `/dashboard/admin/*` subtree; the per-page call is defense-in-depth. The
 * data layer composes ONLY the two existing gated read services (see
 * lib/crm/pipeline.ts) — no new service-role call site, no RLS change.
 *
 * Filtering is searchParams-driven (plain links + one GET form) — a pure
 * server component: keyboard accessible, mobile-safe, no client state.
 */

const CHIP_BASE =
  "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const CHIP_ACTIVE = "border-brand-blue bg-brand-blue/10 text-text-primary";
const CHIP_IDLE =
  "border-ink-700/60 text-text-secondary hover:border-brand-blue hover:text-text-primary";

/** Relative query-only href — keeps the locale-prefixed path untouched. */
function pipelineHref(
  stage: PipelineStage | null,
  source: PipelineSourceType | null,
  q: string,
): string {
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  if (source) params.set("source", source);
  if (q) params.set("q", q);
  const s = params.toString();
  return s.length > 0 ? `?${s}` : "?";
}

export default async function AdminPipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stage?: string; source?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const sp = await searchParams;
  const stage = isPipelineStage(sp.stage) ? sp.stage : null;
  const source = isPipelineSourceType(sp.source) ? sp.source : null;
  const q = (sp.q ?? "").slice(0, 120);

  const t = await getTranslations("crmPipeline");
  const overview = await getPipelineOverview();
  const visible = filterPipelineItems(overview.items, { stage, source, q });
  const degraded = overview.sources.filter((s) => s.state !== "ok");

  return (
    <div className="flex flex-col gap-6" data-testid="admin-pipeline">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        <Link
          href={"/dashboard/admin" as "/dashboard"}
          className="mt-1 self-start text-xs text-text-secondary hover:underline"
        >
          ← {t("back")}
        </Link>
      </header>

      {/* Honesty banner: read view only — stored statuses verbatim, stage is
          presentation-only, statuses change on each row's own surface. */}
      <p
        className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs text-text-muted"
        data-testid="pipeline-honest-note"
      >
        {t("honestNote")}
      </p>

      {/* Stage summary — real counts over the fetched window, per stage. */}
      <section className="flex flex-col gap-2" data-testid="pipeline-summary">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("summaryHeading")}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PIPELINE_STAGES.map((s) => (
            <a
              key={s}
              href={pipelineHref(stage === s ? null : s, source, q)}
              aria-current={stage === s ? "true" : undefined}
              data-testid={`pipeline-stage-card-${s}`}
              className={`card-border block p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                stage === s ? "border-brand-blue" : ""
              }`}
            >
              <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t(`stages.${s}`)}
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-text-primary tabular-nums">
                {overview.stageCounts[s]}
              </p>
            </a>
          ))}
        </div>
        {/* Per-source breakdown — real fetched counts, honest states. */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted"
          data-testid="pipeline-source-breakdown"
        >
          {overview.sources.map((s) => (
            <span key={s.sourceType} className="font-mono uppercase tracking-label">
              {t(`sources.${s.sourceType}`)}:{" "}
              {s.state === "ok" ? s.count : t(`sourceStates.${s.state}`)}
            </span>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t("windowNote")}
        </p>
      </section>

      {/* Honest notes for degraded sources — never a false zero. */}
      {degraded.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="pipeline-degraded-notes">
          {degraded.map((s) => (
            <p
              key={s.sourceType}
              className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs text-text-muted"
              data-testid={`pipeline-degraded-${s.sourceType}`}
            >
              {t(`sources.${s.sourceType}`)} — {t(`sourceStates.${s.state}`)}
            </p>
          ))}
        </div>
      ) : null}

      {/* Filters — plain searchParams links + one GET form (no client state). */}
      <nav
        className="flex flex-col gap-3"
        aria-label={t("filters.stageLabel")}
        data-testid="pipeline-filters"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("filters.sourceLabel")}
          </span>
          <a
            href={pipelineHref(stage, null, q)}
            aria-current={source === null ? "true" : undefined}
            data-testid="pipeline-filter-source-all"
            className={`${CHIP_BASE} ${source === null ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {t("filters.all")}
          </a>
          {PIPELINE_SOURCE_TYPES.map((s) => (
            <a
              key={s}
              href={pipelineHref(stage, s, q)}
              aria-current={source === s ? "true" : undefined}
              data-testid={`pipeline-filter-source-${s}`}
              className={`${CHIP_BASE} ${source === s ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {t(`sources.${s}`)}
            </a>
          ))}
        </div>
        <form
          method="get"
          className="flex flex-wrap items-center gap-2"
          data-testid="pipeline-search-form"
        >
          {/* Preserve active chips across a text search (GET form). */}
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          {source ? <input type="hidden" name="source" value={source} /> : null}
          <label
            htmlFor="pipeline-q"
            className="font-mono text-[10px] uppercase tracking-label text-text-muted"
          >
            {t("filters.searchLabel")}
          </label>
          <input
            id="pipeline-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            placeholder={t("filters.searchPlaceholder")}
            className="min-h-9 w-full max-w-xs rounded-md border border-ink-700/60 bg-ink-800/30 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          />
          <button
            type="submit"
            className={`${CHIP_BASE} ${CHIP_IDLE}`}
            data-testid="pipeline-search-submit"
          >
            {t("filters.searchSubmit")}
          </button>
          {stage || source || q ? (
            <a
              href="?"
              className={`${CHIP_BASE} ${CHIP_IDLE}`}
              data-testid="pipeline-filter-reset"
            >
              {t("filters.reset")}
            </a>
          ) : null}
        </form>
      </nav>

      {/* The consolidated queue. Each row: source badge, STORED status
          verbatim, mapped stage, created date, link to its real surface. */}
      {visible.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="pipeline-empty"
        >
          {overview.items.length === 0 ? t("empty") : t("noMatches")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="pipeline-list">
          {visible.map((item) => (
            <li
              key={`${item.sourceType}-${item.id}`}
              className="card-border flex flex-col gap-2 p-3"
              data-testid={`pipeline-row-${item.id}`}
              data-stage={item.stage}
              data-source={item.sourceType}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="break-all text-sm font-semibold text-text-primary">
                    {item.title.trim().length > 0 ? item.title : "—"}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded-sm border border-ink-700/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
                      {t(`sources.${item.sourceType}`)}
                    </span>
                    {overview.duplicateIds.has(item.id) ? (
                      <span
                        className="rounded-sm border border-state-warning/40 bg-state-warning/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-warning"
                        data-testid={`pipeline-duplicate-${item.id}`}
                      >
                        {t("duplicateChip")}
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="rounded-sm border border-brand-blue/40 bg-brand-blue/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-blue">
                    {t(`stages.${item.stage}`)}
                  </span>
                  {/* The stored lifecycle value VERBATIM — the underlying
                      truth, never hidden behind the mapped stage. */}
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {t("storedStatusLabel")}: {item.storedStatus ?? "—"}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                <span>
                  {t("createdLabel")}: {item.createdAt.slice(0, 10)}
                </span>
                {item.country ? <span>{item.country}</span> : null}
                <Link
                  href={item.href as "/dashboard"}
                  className="text-brand-blue hover:underline"
                  data-testid={`pipeline-open-${item.id}`}
                >
                  {t("openSurface")} →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
