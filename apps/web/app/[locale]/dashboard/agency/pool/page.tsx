import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ClipboardCheck,
  Globe2,
  Lock,
  NotebookPen,
  ShieldCheck,
  Users,
} from "lucide-react";

import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getAgencyPool } from "@/lib/agency/pool";
import { CanOfferButton } from "@/components/app/agency/can-offer-button";
import { CountUp } from "@/components/app/today/count-up";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * S5 — Agency Worker Pool (TASK 07 estetika, galutinis lygis iškart).
 * The agency sees ONLY its own pool (owns_agency RLS + getOwnAgency gate);
 * journal evidence appears ONLY through the provisioned engagement bridge
 * (locked hint otherwise — never a fake zero); country readiness is an
 * AGGREGATE of availability + declared countries (documents stay owner-only
 * until the consent switch passes the gate); demand positioning is a
 * PROPOSAL marker, never a match (doctrine §4/§7/§19).
 */
export default async function AgencyPoolPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "agency");

  const t = await getTranslations("agencyPool");
  const tProf = await getTranslations("professions");
  const pool = await getAgencyPool();

  const professionLabel = (slug: string) =>
    tProf.has(slug) ? tProf(slug) : slug.replace(/-/g, " ");
  const initialsOf = (name: string | null) => {
    if (!name) return "•";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "•";
  };

  if (pool.kind !== "ok") {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p
          className="card-border p-4 text-sm leading-relaxed text-text-secondary"
          data-testid="pool-unavailable"
        >
          {pool.kind === "no-agency"
            ? t("noAgency")
            : pool.kind === "needs-migration"
              ? t("needsMigration")
              : t("loadError")}
        </p>
        <Link
          href={`/${locale}/dashboard/agency`}
          className="w-fit text-xs font-medium text-brand-blue hover:underline"
        >
          ← {t("backToAgency")}
        </Link>
      </div>
    );
  }

  const { agency, workers, readiness, demand } = pool;

  return (
    <div className="flex max-w-4xl flex-col gap-6" data-testid="agency-pool">
      <header className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {agency.legalName ?? t("title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
        <Link
          href={`/${locale}/dashboard/agency`}
          className="mt-1 w-fit text-xs font-medium text-brand-blue hover:underline"
          data-testid="pool-manage-link"
        >
          {t("manageLink")} →
        </Link>
      </header>

      {/* ── 1 · POOL — the agency's own people as arena cards ── */}
      <section className="flex flex-col gap-3" data-testid="pool-cards">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("poolTitle")}
        </h2>
        {workers.length === 0 ? (
          <div className="card-border flex flex-col items-start gap-3 p-6" data-testid="pool-empty">
            <p className="text-sm leading-relaxed text-text-secondary">
              {t("empty")}
            </p>
            <Link
              href={`/${locale}/dashboard/agency`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-3 text-sm font-semibold text-ink-900 transition-transform duration-fast ease-out hover:-translate-y-0.5"
            >
              {t("emptyCta")} →
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {workers.map((w) => {
              const confirmed = w.managerConfirmations ?? 0;
              return (
                <li
                  key={w.workerId}
                  className="card-border glow-hover rise-in flex flex-col gap-3 p-4"
                  data-testid="pool-worker-card"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-ink-700 font-display text-sm font-bold text-text-primary",
                        confirmed > 0 ? "border-trust-accent/50" : "border-ink-500",
                      )}
                    >
                      {initialsOf(w.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold tracking-tightest text-text-primary">
                        {w.name ?? w.email ?? t("unnamed")}
                      </p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {w.professionSlugs.length > 0
                          ? w.professionSlugs.map(professionLabel).join(", ")
                          : t("noProfession")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
                      {w.availabilityStatus === "available" ? (
                        <span className="live-dot" aria-hidden />
                      ) : null}
                      {w.availabilityStatus
                        ? t(`availability.${w.availabilityStatus}` as never)
                        : t("availability.unknown")}
                    </span>
                    {[w.locationCountry, ...w.preferredCountries]
                      .filter((c): c is string => !!c)
                      .slice(0, 4)
                      .map((c) => (
                        <span
                          key={c}
                          className="inline-flex min-h-7 items-center gap-1 rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted"
                        >
                          <Globe2 className="h-3 w-3" aria-hidden />
                          {c.toUpperCase()}
                        </span>
                      ))}
                  </div>

                  {/* Evidence through the bridge — locked is locked, not zero. */}
                  {w.engagementContextLinked && w.journalEntries !== null ? (
                    <div className="flex flex-wrap gap-2" data-testid="pool-evidence">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1 font-mono text-[11px] text-text-secondary">
                        <NotebookPen className="h-3 w-3" aria-hidden />
                        <CountUp text={String(w.journalEntries)} />
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]",
                          confirmed > 0
                            ? "border-state-success/30 bg-state-success/10 text-state-success"
                            : "border-ink-600 bg-ink-800/40 text-text-secondary",
                        )}
                      >
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        <CountUp text={String(confirmed)} />
                      </span>
                      {!w.journalReviewEnabled ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
                          {t("reviewOff")}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p
                      className="flex items-center gap-2 rounded-md border border-dashed border-ink-500 px-3 py-2 text-[11px] leading-relaxed text-text-muted"
                      data-testid="pool-evidence-locked"
                    >
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("evidenceLocked")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 2 · READINESS — aggregates only, honest documents note ── */}
      <section className="card-border flex flex-col gap-3 p-5" data-testid="pool-readiness">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("readiness.title")}
        </h2>
        {readiness.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("readiness.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {readiness.map((r) => (
              <li
                key={r.country}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
                data-testid="readiness-row"
              >
                <span className="font-display text-sm font-semibold text-text-primary">
                  {r.country}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
                  <Users className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
                  {r.workers}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
                  <span className="live-dot" aria-hidden />
                  {r.availableNow} {t("readiness.availableNow")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* Documents stay owner-only: aggregates require the consent switch
            (draft + gate) — said honestly, never silently faked. */}
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-[11px] leading-relaxed text-text-muted"
          data-testid="readiness-docs-note"
        >
          {t("readiness.docsNote")}
        </p>
      </section>

      {/* ── 3 · POSITIONING — open demand, proposal ≠ match ── */}
      <section className="card-border flex flex-col gap-3 p-5" data-testid="pool-demand">
        <h2 className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
          {t("demand.title")}
        </h2>
        <p className="text-[11px] leading-relaxed text-text-secondary" data-testid="demand-human-note">
          {t("demand.humanNote")}
        </p>
        {demand.kind === "needs-gate" ? (
          <p
            className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted"
            data-testid="demand-needs-gate"
          >
            {t("demand.needsGate")}
          </p>
        ) : demand.rows.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-secondary" data-testid="demand-empty">
            {t("demand.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {demand.rows.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2.5"
                data-testid="demand-row"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {d.roleText ?? t("demand.noRole")}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {[d.country, d.teamSize ? t("demand.teamSize", { n: d.teamSize }) : null, d.startPeriod]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {d.canOfferMarked ? (
                  <span
                    className="w-fit rounded-md border border-state-success/40 bg-state-success/10 px-3 py-1.5 text-xs font-medium text-state-success"
                    data-testid="can-offer-done"
                  >
                    {t("demand.marked")}
                  </span>
                ) : (
                  <CanOfferButton requestId={d.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
