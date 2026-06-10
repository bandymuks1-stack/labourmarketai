import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import {
  listWorkbench,
  type DemandRow,
  type SupplyWorkerRow,
} from "@/lib/admin/matching-workbench";
import {
  MatchingWorkbenchReview,
  type MatchingReviewLabels,
} from "@/components/app/matching-workbench-review";
import type { DarkListboxOption } from "@/components/ui/DarkListbox";

/**
 * Phase 3.2 — Human-Run Matching Workbench (Marketplace v1 heart, product
 * plan §8). Open demand (`customer_requests`, the one canonical intake) next
 * to the worker supply; a HUMAN joins them and records the decision + a
 * feedback note. No automatic matching, no scoring, no AI suggestions.
 *
 * Server-side gate: requireSuperadmin(locale) is the FIRST awaited call.
 * Reads + the match write both ride the EXISTING RLS (admin) — no migration,
 * no new table (decision lives in payload.match_log, append-only).
 *
 * UI: low-fidelity preview, bus pakeistas TASK 07 (living-arena UI po owner
 * vizualinio užrakto). Funkcija > grožis; mobile-first stack.
 */

const STATUS_TONE: Record<string, string> = {
  submitted: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  in_review: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  needs_followup:
    "border-state-warning/40 bg-state-warning/5 text-state-warning",
  approved: "border-state-success/40 bg-state-success/5 text-state-success",
};

const AVAILABILITY_KEYS = ["available", "busy", "unavailable"] as const;

export default async function AdminMatchingWorkbenchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("admin.matching");
  const tProf = await getTranslations("professions");
  const result = await listWorkbench();

  const demand: readonly DemandRow[] =
    result.kind === "ok" ? result.demand : [];
  const supply: readonly SupplyWorkerRow[] =
    result.kind === "ok" ? result.supply : [];
  const migrationNeeded = result.kind === "needs-migration";
  const loadError = result.kind === "error" ? result.message : null;

  const professionLabel = (slug: string): string => {
    try {
      return tProf(slug);
    } catch {
      return slug;
    }
  };

  const workerOptions: DarkListboxOption[] = supply.map((w) => ({
    value: w.id,
    label: `${w.displayName ?? t("supply.unnamed")} · ${
      w.professionSlugs.length > 0
        ? w.professionSlugs.map(professionLabel).join(", ")
        : t("supply.noProfession")
    }`,
  }));

  const reviewLabels: MatchingReviewLabels = {
    workerLabel: t("match.workerLabel"),
    workerPlaceholder: t("match.workerPlaceholder"),
    noteLabel: t("match.noteLabel"),
    notePlaceholder: t("match.notePlaceholder"),
    recordInReview: t("match.recordInReview"),
    recordFollowup: t("match.recordFollowup"),
    recordApproved: t("match.recordApproved"),
    statusSaved: t("result.saved"),
    statusNotAdmin: t("result.notAdmin"),
    statusInvalid: t("result.invalid"),
    statusNotFound: t("result.notFound"),
    statusNeedsMigration: t("result.needsMigration"),
    statusError: t("result.error"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="admin-matching-workbench">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        {/* Honest method statement — the match is a human decision. */}
        <p
          className="mt-1 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-text-secondary"
          data-testid="admin-matching-human-note"
        >
          {t("humanNote")}
        </p>
        <Link
          href={"/dashboard/admin" as "/dashboard"}
          className="mt-1 self-start text-xs text-text-secondary hover:underline"
        >
          ← {t("back")}
        </Link>
      </header>

      {migrationNeeded ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          data-testid="admin-matching-migration-blocker"
        >
          {t("migrationBlocker")}
        </p>
      ) : loadError ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
          {t("result.error")} {loadError}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* ── Demand side ────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3" data-testid="admin-matching-demand">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("demand.title")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("demand.count", { count: demand.length })}
            </p>
            {demand.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
                {t("demand.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {demand.map((r) => (
                  <li
                    key={r.id}
                    className="card-border flex flex-col gap-3 p-4"
                    data-testid={`matching-demand-row-${r.id}`}
                    data-status={r.status}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-text-primary">
                          {r.title}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                          {r.kind ? `${t(`kind.${r.kind}` as never)} · ` : ""}
                          {t("fields.created")}: {r.createdAt.slice(0, 10)}
                        </span>
                      </div>
                      <span
                        className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${
                          STATUS_TONE[r.status] ?? STATUS_TONE.submitted
                        }`}
                      >
                        {t(`status.${r.status}` as never)}
                      </span>
                    </div>

                    {r.needSummary ? (
                      <p className="text-xs text-text-secondary">{r.needSummary}</p>
                    ) : null}

                    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      <Field label={t("fields.country")} value={r.country} />
                      <Field label={t("fields.location")} value={r.location} />
                      <Field label={t("fields.role")} value={r.roleOrWorkType} />
                      <Field
                        label={t("fields.teamSize")}
                        value={r.teamSize !== null ? String(r.teamSize) : null}
                      />
                      <Field label={t("fields.startPeriod")} value={r.startPeriod} />
                      <Field label={t("fields.duration")} value={r.duration} />
                      <Field label={t("fields.language")} value={r.languageRequirement} />
                      <Field label={t("fields.notes")} value={r.notes} />
                    </dl>

                    {r.payloadFields.length > 0 ? (
                      <div className="rounded-md border border-ink-600 bg-ink-800/30 px-2 py-1">
                        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                          {t("fields.payload")}
                        </p>
                        <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
                          {r.payloadFields.map((f) => (
                            <div key={f.key} className="flex gap-1">
                              <dt className="font-mono text-text-muted">{f.key}:</dt>
                              <dd className="text-text-secondary">{f.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}

                    {r.matchLog.length > 0 ? (
                      <div
                        className="rounded-md border border-state-success/30 bg-state-success/5 px-2 py-1"
                        data-testid={`matching-log-${r.id}`}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                          {t("log.title")}
                        </p>
                        <ul className="mt-1 flex flex-col gap-1 text-[11px] text-text-secondary">
                          {r.matchLog.map((m, i) => (
                            <li key={`${m.worker_id}-${i}`}>
                              {m.decided_at.slice(0, 16).replace("T", " ")} ·{" "}
                              {m.worker_name ?? m.worker_id} →{" "}
                              {t(`status.${m.status_set}` as never)}
                              {m.note ? ` — ${m.note}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {r.manualReviewNote && r.matchLog.length === 0 ? (
                      <p className="rounded-md border border-ink-600 bg-ink-800/30 px-2 py-1 text-[11px] text-text-secondary">
                        <span className="font-mono uppercase tracking-label text-text-muted">
                          {t("fields.reviewNote")}:
                        </span>{" "}
                        {r.manualReviewNote}
                      </p>
                    ) : null}

                    <MatchingWorkbenchReview
                      requestId={r.id}
                      workers={workerOptions}
                      labels={reviewLabels}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Supply side (reference; recency order, no ranking) ──────── */}
          <section className="flex flex-col gap-3" data-testid="admin-matching-supply">
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {t("supply.title")}
            </h2>
            <p className="text-xs text-text-secondary">
              {t("supply.count", { count: supply.length })}
            </p>
            {supply.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
                {t("supply.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {supply.map((w) => (
                  <li
                    key={w.id}
                    className="card-border flex flex-col gap-1.5 p-3"
                    data-testid={`matching-supply-row-${w.id}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {w.displayName ?? t("supply.unnamed")}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {w.availabilityStatus &&
                        (AVAILABILITY_KEYS as readonly string[]).includes(
                          w.availabilityStatus,
                        )
                          ? t(`supply.availability.${w.availabilityStatus}` as never)
                          : t("supply.availability.unknown")}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      {w.professionSlugs.length > 0
                        ? w.professionSlugs.map(professionLabel).join(", ")
                        : t("supply.noProfession")}
                      {w.locationCountry ? ` · ${w.locationCountry}` : ""}
                      {w.experienceYears !== null
                        ? ` · ${t("supply.years", { count: w.experienceYears })}`
                        : ""}
                    </p>
                    {/* Honest signal counts — declared is NOT verified. */}
                    <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-label">
                      <span className="text-text-muted">
                        {t("supply.skillsDeclared")}: {w.skillsDeclared}
                      </span>
                      <span
                        className={
                          w.skillsConfirmed > 0
                            ? "text-state-success"
                            : "text-text-muted"
                        }
                      >
                        {t("supply.skillsConfirmed")}: {w.skillsConfirmed}
                      </span>
                      <span className="text-text-muted">
                        {t("supply.entries")}: {w.journalEntries}
                      </span>
                      <span
                        className={
                          w.managerConfirmations > 0
                            ? "text-state-success"
                            : "text-text-muted"
                        }
                      >
                        {t("supply.confirmations")}: {w.managerConfirmations}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value || value.length === 0) return null;
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
