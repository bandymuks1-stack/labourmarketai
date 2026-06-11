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
import {
  buildMatchSuggestions,
  filterSupply,
} from "@/lib/admin/match-suggestions";
import { computeContextFit } from "@/lib/market/fit";
import { StructureNeedForm } from "@/components/app/structure-need-form";
import { openDirectConversationAction } from "@/lib/communication/open-conversation-action";
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
 * UI: TASK 07.4 final skin — the DRAFT board (living-arena, FUT draft
 * energy): demand and supply as arena cards, supply rows as mini player
 * cards. The decision stays 100% human — no scoring, no ranking, no
 * auto-pick; mobile-first stack.
 */

function initialsOf(name: string | null): string {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "•";
}

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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    country?: string;
    availability?: string;
    confirmed?: string;
    profession?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);
  const {
    country: filterCountry,
    availability: filterAvailability,
    confirmed: filterConfirmedRaw,
    profession: filterProfession,
  } = await searchParams;
  // Trust→visibility (S4 item 5): a FACTUAL signal filter — workers with ≥1
  // manager-confirmed skill. Never an invented numeric rating.
  const filterConfirmed = filterConfirmedRaw === "1";

  const t = await getTranslations("admin.matching");
  const tProf = await getTranslations("professions");
  const result = await listWorkbench(locale);

  const demand: readonly DemandRow[] =
    result.kind === "ok" ? result.demand : [];
  const supply: readonly SupplyWorkerRow[] =
    result.kind === "ok" ? result.supply : [];
  const escoLabel = (uri: string): string =>
    (result.kind === "ok" ? result.escoLabelsByUri[uri] : undefined) ??
    uri.split("/").pop() ??
    uri;
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
                    className="card-border glow-hover rise-in flex flex-col gap-3 p-4"
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

                    {/* Workstream B entry point: conversation FROM a
                        customer_request — message the requester directly. */}
                    {r.profileId ? (
                      <form action={openDirectConversationAction} className="self-start">
                        <input type="hidden" name="profileId" value={r.profileId} />
                        <input type="hidden" name="locale" value={locale} />
                        <input
                          type="hidden"
                          name="fallback"
                          value={`/${locale}/dashboard/admin/matching`}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-ink-500 px-2 py-1 text-[11px] text-text-secondary hover:border-brand-blue hover:text-brand-blue"
                          data-testid={`matching-message-requester-${r.id}`}
                        >
                          {t("demand.messageRequester")}
                        </button>
                      </form>
                    ) : null}

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

                    {/* Rule-based shortlist — evidence reasons only (§7),
                        the human decides; "start conversation" reuses the
                        canonical messaging entry (B entry point). */}
                    {(() => {
                      const suggestions = buildMatchSuggestions(r, supply);
                      if (suggestions.length === 0) return null;
                      return (
                        <div
                          className="rounded-md border border-brand-blue/20 bg-brand-blue/5 p-2"
                          data-testid={`matching-suggestions-${r.id}`}
                        >
                          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                            {t("suggestions.title")}
                          </p>
                          <p className="text-[11px] text-text-secondary">
                            {t("suggestions.humanRule")}
                          </p>
                          <ul className="mt-1 flex flex-col gap-1.5">
                            {suggestions.map((s) => (
                              <li
                                key={s.worker.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-ink-600 bg-ink-800/40 px-2 py-1.5"
                              >
                                <span className="flex min-w-0 flex-col">
                                  <span className="text-xs font-semibold text-text-primary">
                                    {s.worker.displayName ?? t("supply.unnamed")}
                                  </span>
                                  <span className="flex flex-wrap gap-1">
                                    {s.reasons.map((reason) => (
                                      <span
                                        key={reason}
                                        className="rounded-sm border border-brand-blue/30 px-1 py-0.5 font-mono text-[9px] uppercase tracking-label text-brand-blue"
                                      >
                                        {t(`suggestions.reasons.${reason}` as never)}
                                      </span>
                                    ))}
                                  </span>
                                </span>
                                {s.worker.profileId ? (
                                  <form action={openDirectConversationAction}>
                                    <input type="hidden" name="profileId" value={s.worker.profileId} />
                                    <input type="hidden" name="locale" value={locale} />
                                    <input
                                      type="hidden"
                                      name="fallback"
                                      value={`/${locale}/dashboard/admin/matching`}
                                    />
                                    <button
                                      type="submit"
                                      className="rounded-md border border-brand-blue/50 px-2 py-1 text-[11px] font-semibold text-brand-blue hover:border-brand-blue"
                                      data-testid={`matching-start-conversation-${r.id}-${s.worker.id}`}
                                    >
                                      {t("suggestions.start")}
                                    </button>
                                  </form>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {/* ── S6 §19: contextual fit — ONLY inside this need's
                        context, ONLY with the full basis, never persisted.
                        Unstructured need = NO percentage + the one-click
                        human structuring path. ── */}
                    {r.structuredNeed ? (
                      (() => {
                        const need = r.structuredNeed.escoSkillUris;
                        const fits = supply
                          .map((w) => ({
                            w,
                            fit: computeContextFit(need, w.escoSkills),
                          }))
                          .filter(
                            (x): x is { w: SupplyWorkerRow; fit: NonNullable<ReturnType<typeof computeContextFit>> } =>
                              x.fit !== null && x.fit.matchedTotal > 0,
                          )
                          // Fit ordering is allowed ONLY here — inside one
                          // need's context (§19 d); never a people ranking.
                          .sort(
                            (a, b) =>
                              b.fit.pct - a.fit.pct ||
                              b.fit.matchedConfirmed - a.fit.matchedConfirmed,
                          )
                          .slice(0, 8);
                        return (
                          <div
                            className="rounded-md border border-brand-cyan/20 bg-brand-cyan/5 p-2.5"
                            data-testid={`matching-fit-${r.id}`}
                          >
                            <p className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
                              {t("fit.title")}
                            </p>
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                              {t("fit.needLine", { n: r.structuredNeed.escoSkillUris.length })}{" "}
                              {r.structuredNeed.escoSkillUris.map(escoLabel).join(", ")}
                            </p>
                            {fits.length === 0 ? (
                              <p
                                className="mt-1 text-[11px] text-text-muted"
                                data-testid="fit-no-overlap"
                              >
                                {t("fit.noOverlap")}
                              </p>
                            ) : (
                              <ul className="mt-1.5 flex flex-col gap-1.5">
                                {fits.map(({ w, fit }) => (
                                  <li
                                    key={w.id}
                                    className="flex flex-col gap-0.5 rounded-sm border border-ink-600 bg-ink-800/40 px-2 py-1.5"
                                    data-testid="fit-row"
                                  >
                                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                                      <span className="text-xs font-semibold text-text-primary">
                                        {w.displayName ?? t("supply.unnamed")}
                                      </span>
                                      <span className="font-mono text-sm font-bold text-brand-cyan">
                                        {fit.pct}%
                                      </span>
                                    </span>
                                    {/* §19 b/c: the basis, with the confirmed
                                        share always separated. */}
                                    <span className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
                                      {t("fit.basis", {
                                        matched: fit.matchedTotal,
                                        total: fit.needTotal,
                                        confirmed: fit.matchedConfirmed,
                                      })}
                                    </span>
                                    {fit.missingUris.length > 0 ? (
                                      <span className="text-[11px] text-text-muted">
                                        {t("fit.missing")}:{" "}
                                        {fit.missingUris.map(escoLabel).join(", ")}
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted">
                              {t("fit.humanNote")}
                            </p>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex flex-col gap-1.5" data-testid={`fit-unstructured-${r.id}`}>
                        <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-[11px] leading-relaxed text-text-muted">
                          {t("fit.unstructured")}
                        </p>
                        <StructureNeedForm requestId={r.id} />
                      </div>
                    )}

                    {/* S5/S6: agency proposal marks — visible NEXT TO fit;
                        the decision stays the human's below. */}
                    {r.agencyOffers.length > 0 ? (
                      <div
                        className="rounded-md border border-state-success/20 bg-state-success/5 px-2 py-1.5"
                        data-testid={`agency-offers-${r.id}`}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                          {t("agencyOffers.title")}
                        </p>
                        <ul className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-text-secondary">
                          {r.agencyOffers.map((o, i) => (
                            <li key={`${o.agencyName ?? "x"}-${i}`}>
                              {o.agencyName ?? t("agencyOffers.unnamed")}
                              {o.markedAt ? ` · ${o.markedAt.slice(0, 10)}` : ""}
                              {o.note ? ` — ${o.note}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
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
            {/* Server-rendered filters (searchParams links — themed, no
                native OS controls). */}
            {(() => {
              const countries = [
                ...new Set(
                  supply
                    .flatMap((w) => [w.locationCountry, ...w.preferredCountries])
                    .filter((c): c is string => !!c)
                    .map((c) => c.toUpperCase()),
                ),
              ].sort();
              const link = (
                c: string | null,
                a: string | null,
                conf: boolean = filterConfirmed,
                prof: string | null = filterProfession ?? null,
              ): string => {
                const q = new URLSearchParams();
                if (c) q.set("country", c);
                if (a) q.set("availability", a);
                if (conf) q.set("confirmed", "1");
                if (prof) q.set("profession", prof);
                const qs = q.toString();
                return `/dashboard/admin/matching${qs ? `?${qs}` : ""}`;
              };
              const professions = [
                ...new Set(supply.flatMap((w) => w.professionSlugs)),
              ].sort();
              const chip = (active: boolean): string =>
                `rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-label ${
                  active
                    ? "border-brand-blue text-brand-blue"
                    : "border-ink-500 text-text-secondary hover:border-brand-blue"
                }`;
              return (
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  data-testid="matching-supply-filters"
                >
                  <Link
                    href={link(null, filterAvailability ?? null) as "/dashboard"}
                    className={chip(!filterCountry)}
                  >
                    {t("filters.all")}
                  </Link>
                  {countries.map((c) => (
                    <Link
                      key={c}
                      href={link(c, filterAvailability ?? null) as "/dashboard"}
                      className={chip(filterCountry?.toUpperCase() === c)}
                    >
                      {c}
                    </Link>
                  ))}
                  <span className="mx-1 text-ink-500">·</span>
                  {(["available", "busy", "unavailable"] as const).map((a) => (
                    <Link
                      key={a}
                      href={
                        link(
                          filterCountry ?? null,
                          filterAvailability === a ? null : a,
                        ) as "/dashboard"
                      }
                      className={chip(filterAvailability === a)}
                    >
                      {t(`supply.availability.${a}` as never)}
                    </Link>
                  ))}
                  <span className="mx-1 text-ink-500">·</span>
                  <Link
                    href={
                      link(
                        filterCountry ?? null,
                        filterAvailability ?? null,
                        !filterConfirmed,
                      ) as "/dashboard"
                    }
                    className={chip(filterConfirmed)}
                    data-testid="matching-filter-confirmed"
                  >
                    {t("filters.confirmedOnly")}
                  </Link>
                  {professions.length > 0 ? (
                    <>
                      <span className="mx-1 text-ink-500">·</span>
                      {professions.map((p) => (
                        <Link
                          key={p}
                          href={
                            link(
                              filterCountry ?? null,
                              filterAvailability ?? null,
                              filterConfirmed,
                              filterProfession === p ? null : p,
                            ) as "/dashboard"
                          }
                          className={chip(filterProfession === p)}
                          data-testid="matching-filter-profession"
                        >
                          {professionLabel(p)}
                        </Link>
                      ))}
                    </>
                  ) : null}
                </div>
              );
            })()}
            {supply.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted">
                {t("supply.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {filterSupply(supply, {
                  country: filterCountry ?? null,
                  availability: filterAvailability ?? null,
                })
                  // Factual visibility signal — never a score (doctrine §7).
                  .filter((w) => !filterConfirmed || w.skillsConfirmed > 0)
                  // Factual profession filter (slug membership, no ranking).
                  .filter(
                    (w) =>
                      !filterProfession ||
                      w.professionSlugs.includes(filterProfession),
                  )
                  .map((w) => (
                  <li
                    key={w.id}
                    className="card-border glow-hover rise-in flex flex-col gap-1.5 p-3"
                    data-testid={`matching-supply-row-${w.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-ink-700 font-display text-xs font-bold text-text-primary ${
                            w.skillsConfirmed > 0
                              ? "border-trust-accent/50"
                              : "border-ink-500"
                          }`}
                        >
                          {initialsOf(w.displayName)}
                        </span>
                        <span className="truncate text-sm font-semibold text-text-primary">
                          {w.displayName ?? t("supply.unnamed")}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {w.availabilityStatus === "available" ? (
                          <span className="live-dot" aria-hidden />
                        ) : null}
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
