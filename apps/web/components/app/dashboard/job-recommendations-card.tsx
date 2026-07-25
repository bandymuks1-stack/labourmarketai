import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";
import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";

/**
 * "Man tinkantys darbai" — compact worker-overview card (Job Recommendation
 * Engine surfacing, Sprint v2 §4). Top 3 recommendations from the ONE
 * request-cached read model (lib/opportunities/recommendations.ts — the same
 * PR4 engine the board runs, never a second engine).
 *
 * §19: every row's fit line is the canonical basis form — matched/total
 * counts WITH the confirmed share ("12 iš 15 įgūdžių, 8 patvirtinti") — a
 * bare % never renders. §18: the empty state is honest ("no matching
 * listings — add skills"), and while the owner-gated worker-visibility RPC
 * is unapplied the card renders NOTHING (no fake emptiness about data that
 * cannot exist yet). Rendering marks the shown rows seen (anti-spam: the
 * aggregate "new matches" signal clears because the worker actually saw
 * these). Deliberately NO apply/contact CTA — the rows link the board, where
 * the platform workflow lives.
 *
 * Placement note: the PR #751 configurable module grid is a registry of
 * link-tile shortcuts (route + label + spine badge) — the registry carries
 * this feature's ATTENTION (the opportunities module badges the
 * new-job-matches spine signal); this card is the content surface next to
 * it, mounted once on the worker overview like the other content cards
 * (invitations, privacy status).
 */
export async function JobRecommendationsCard({ locale }: { locale: string }) {
  const result = await loadWorkerOpportunityMatches({
    surface: "dashboard_recommendations",
    limit: 3,
  });
  if (result.kind !== "ready") return null;
  // Honest invisibility while the gated worker-visibility RPC is unapplied:
  // there is no demand data at all, so "no matches" would be a false claim.
  if (!result.capabilities.boardAvailable) return null;

  const t = await getTranslations("auth.dashboard.jobsCard");
  const tRec = await getTranslations("opportunities.recommendations");
  const tOpp = await getTranslations("opportunities");
  const tlm = await getTranslations("labourMarket");
  const tSkill = await getTranslations("skillNames");
  const workLabels = buildWorkTypeLabelMap(locale);

  const roleLabel = (slug: string | null) =>
    (slug && workLabels[slug]) || tOpp("fieldRoleUnknown");
  const countryLabel = (code: string | null) =>
    code && tlm.has(`countryNames.${code}`)
      ? tlm(`countryNames.${code}`)
      : (code ?? null);
  const startLabel = (val: string | null) =>
    val && tOpp.has(`urgency.${val}`) ? tOpp(`urgency.${val}` as never) : null;
  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);

  const rows = result.matches;
  const boardHref = "/dashboard/opportunities" as "/dashboard";

  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="dashboard-jobs-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight text-text-primary">
          {t("title")}
        </h2>
        <Link
          href={boardHref}
          data-testid="dashboard-jobs-card-view-all"
          className="shrink-0 text-xs font-medium text-brand-blue hover:underline"
        >
          {t("viewAll")} →
        </Link>
      </div>

      {rows.length === 0 ? (
        // Honest empty state (§18) with the ONE concrete next step.
        <p
          className="text-sm leading-relaxed text-text-secondary"
          data-testid="dashboard-jobs-card-empty"
        >
          {t("empty")}{" "}
          <Link
            href={"/dashboard/profile" as "/dashboard"}
            className="font-medium text-brand-blue hover:underline"
          >
            {t("emptyCta")} →
          </Link>
        </p>
      ) : (
        <>
          {/* Rendering IS the read event: the rows below — and only those —
              stop being "new". `rows` is already the displayed slice. */}
          <OpportunitiesShownMarker
            surface="dashboard_recommendations"
            requestIds={rows.map((r) => r.requestId)}
          />
          <ul className="flex flex-col divide-y divide-border/40">
            {rows.map((r) => {
              const location = [r.locationLabel, countryLabel(r.country)]
                .filter((x): x is string => !!x)
                .join(" · ");
              const start = startLabel(r.startPeriod);
              const missingShown = r.missingSkillSlugs.slice(0, 2);
              const missingMore = r.missingSkillSlugs.length - missingShown.length;
              return (
                <li key={r.requestId} className="py-2 first:pt-0 last:pb-0">
                  <Link
                    href={boardHref}
                    data-testid={`dashboard-jobs-card-row-${r.requestId}`}
                    className="flex flex-col gap-1 rounded-md p-1 transition-colors hover:bg-ink-800/40"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-text-primary">
                        {roleLabel(r.roleSlug)}
                      </span>
                      {r.isNew && (
                        <span
                          className="rounded-full bg-brand-cyan/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-cyan"
                          data-testid="dashboard-jobs-card-new"
                        >
                          {tRec("newBadge")}
                        </span>
                      )}
                      {r.salary === "within" && (
                        <span
                          className="rounded-full border border-state-success/40 bg-state-success/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-success"
                          data-testid="dashboard-jobs-card-salary"
                        >
                          {tRec("salaryWithin")}
                        </span>
                      )}
                      {r.salary === "negotiable" && (
                        <span
                          className="rounded-full border border-state-amber/40 bg-state-amber/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-amber"
                          data-testid="dashboard-jobs-card-salary"
                        >
                          {tRec("salaryNegotiable")}
                        </span>
                      )}
                    </span>
                    {(location || start) && (
                      <span className="text-xs text-text-muted">
                        {[location || null, start].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {/* §19 canonical basis — counts + confirmed share, always
                        together, never a bare %. */}
                    <span
                      className="text-xs text-text-secondary"
                      data-testid="dashboard-jobs-card-basis"
                    >
                      {tRec("basisCompact", {
                        matched: r.basis.matchedTotal,
                        total: r.basis.needTotal,
                        confirmed: r.basis.matchedConfirmed,
                      })}
                    </span>
                    {missingShown.length > 0 && (
                      <span
                        className="flex flex-wrap items-center gap-1"
                        data-testid="dashboard-jobs-card-missing"
                      >
                        {missingShown.map((slug) => (
                          <span
                            key={slug}
                            className="rounded-md border border-state-amber/30 bg-state-amber/5 px-1.5 py-0.5 text-[11px] text-state-amber"
                          >
                            {tOpp("skillMatch.missingPrefix")} {skillLabel(slug)}
                          </span>
                        ))}
                        {missingMore > 0 && (
                          <span className="text-[11px] text-text-muted">
                            {tRec("moreSkills", { n: missingMore })}
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
