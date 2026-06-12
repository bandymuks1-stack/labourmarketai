import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { listCompanyDemands, runScouting, type ShortlistStatus } from "@/lib/scouting/scouting";
import { ScoutingShortlistButtons } from "@/components/app/scouting-shortlist-buttons";

/**
 * Company scouting (Full Cycle Sprint v1, Slice 3). The company picks one of
 * its OWN structured demands; the deterministic match-v1 engine runs over the
 * employer-discoverable worker supply; ranked candidates show status + the
 * §19 skill-fit basis + why/gaps; the company shortlists. Honest empty and
 * needs-structuring states — no fake candidates, no fake scores.
 */

export default async function CompanyScoutingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const { locale } = await params;
  const { request } = await searchParams;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("scouting");
  const demands = await listCompanyDemands();
  const selected = request ?? demands.find((d) => d.structured)?.id ?? null;
  const result = selected ? await runScouting(selected) : null;

  const statusLabels = {
    strong: t("status.strong"),
    possible: t("status.possible"),
    weak: t("status.weak"),
    insufficient_data: t("status.insufficient_data"),
  } as const;
  const shortlistLabels: Record<ShortlistStatus, string> = {
    saved: t("shortlist.saved"),
    interested: t("shortlist.interested"),
    not_fit: t("shortlist.not_fit"),
    reviewed: t("shortlist.reviewed"),
  };
  const reason = (code: string): string =>
    t.has(`reason.${code}`) ? t(`reason.${code}`) : code;
  const gap = (code: string): string => (t.has(`gap.${code}`) ? t(`gap.${code}`) : code);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>

      {/* Demand picker */}
      {demands.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-500 px-4 py-6 text-sm text-text-secondary">
          {t("noDemands")}
        </p>
      ) : (
        <nav className="flex flex-wrap gap-2" aria-label={t("pickDemand")}>
          {demands.map((d) => (
            <Link
              key={d.id}
              href={`/${locale}/dashboard/company/scouting?request=${d.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                selected === d.id
                  ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
              }`}
            >
              {d.title}
              {!d.structured ? (
                <span className="ml-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("unstructuredTag")}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      )}

      {/* Results */}
      {result?.kind === "not-structured" ? (
        <p
          className="rounded-md border border-state-warning/30 bg-state-warning/5 px-4 py-6 text-sm leading-relaxed text-text-secondary"
          data-testid="scouting-not-structured"
        >
          {t("notStructured")}
        </p>
      ) : null}
      {result?.kind === "needs-migration" ? (
        <p className="rounded-md border border-ink-500 px-4 py-6 text-sm text-text-secondary">
          {t("needsSetup")}
        </p>
      ) : null}
      {result?.kind === "ok" && result.candidates.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 px-4 py-6 text-sm text-text-secondary"
          data-testid="scouting-empty"
        >
          {t("noCandidates")}
        </p>
      ) : null}

      {result?.kind === "ok" && result.candidates.length > 0 ? (
        <ul className="flex flex-col gap-3" data-testid="scouting-results">
          {result.candidates.map((c) => {
            const fit = c.match.skillFit;
            return (
              <li
                key={c.workerId}
                className="card-border flex flex-col gap-3 p-4"
                data-testid={`scout-candidate-${c.workerId}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold text-text-primary">
                      {c.displayName ?? t("namePlaceholder")}
                    </p>
                    {c.headline ? (
                      <p className="truncate text-xs text-text-secondary">{c.headline}</p>
                    ) : null}
                  </div>
                  <span
                    className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary"
                    data-testid={`scout-status-${c.workerId}`}
                  >
                    {statusLabels[c.match.status]}
                  </span>
                </div>

                {/* §19 skill-fit basis line — always with its basis, confirmed split */}
                {fit ? (
                  <p className="text-xs text-text-secondary">
                    {t("skillFit", {
                      pct: fit.pct,
                      matched: fit.matchedTotal,
                      total: fit.needTotal,
                      confirmed: fit.matchedConfirmed,
                    })}
                  </p>
                ) : null}
                {/* Evidence ladder counts for the matched skills */}
                <p className="font-mono text-[11px] text-text-muted">
                  {t("evidence", {
                    confirmed: c.match.evidence.matchedManagerConfirmed,
                    journal: c.match.evidence.matchedJournalSupported,
                    self: c.match.evidence.matchedSelfDeclared,
                  })}
                </p>

                {/* Why */}
                {c.match.reasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.match.reasons
                      .filter((r) => r.code !== "skill_fit")
                      .map((r, i) => (
                        <span
                          key={`${r.code}-${i}`}
                          className="rounded-md border border-state-success/30 bg-state-success/10 px-2 py-0.5 text-[11px] text-state-success"
                        >
                          {reason(r.code)}
                        </span>
                      ))}
                  </div>
                ) : null}
                {/* Gaps */}
                {c.match.gaps.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.match.gaps.map((g, i) => (
                      <span
                        key={`${g.code}-${i}`}
                        className="rounded-md border border-state-warning/30 bg-state-warning/5 px-2 py-0.5 text-[11px] text-state-warning"
                      >
                        {gap(g.code)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <ScoutingShortlistButtons
                  locale={locale}
                  requestId={result.demand.id}
                  workerId={c.workerId}
                  current={c.shortlistStatus}
                  labels={{ statuses: shortlistLabels, error: t("shortlistError") }}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="text-[11px] leading-relaxed text-text-muted">{t("footnote")}</p>
    </main>
  );
}
