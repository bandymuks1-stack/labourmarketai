import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

import { FeatureNote } from "@/components/app/feature-note";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { loadWorkerOpportunities } from "@/lib/opportunities/load-worker-opportunities";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import type {
  OpportunityGap,
  OpportunityStatus,
} from "@/lib/opportunities/opportunity-fit";

/**
 * Worker-facing opportunities board ("Man tinkamos galimybės"). Shows the
 * worker their OWN matching readiness (real, own-data) and — once the
 * owner-gated worker-visibility RPC is applied — open employer needs scored by
 * an honest, deterministic heuristic (neutral statuses, NO score, NO fake AI).
 * Until then it shows an honest "opportunities will appear here" state and the
 * concrete profile steps to be ready. No fake needs, no fake interest button.
 */

const STATUS_TONE: Record<OpportunityStatus, string> = {
  possible_match: "border-state-success/40 bg-state-success/10 text-state-success",
  check_conditions: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  needs_documents: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  missing_profile_info: "border-ink-500 bg-ink-800/40 text-text-muted",
};

export default async function OpportunitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "worker");

  const t = await getTranslations("opportunities");
  const tlm = await getTranslations("labourMarket");
  const result = await loadWorkerOpportunities();

  const workLabels = buildWorkTypeLabelMap(locale);
  const profileHref = `/${locale}/dashboard/profile`;
  const statusLabel = (s: OpportunityStatus) => t(`status.${s}`);
  const gapLabel = (g: OpportunityGap) => t(`gap.${g}`);
  // role_text is a work-type slug → localized label; country is ISO-2 → name;
  // start_period is the urgency enum → localized timing label. All from closed
  // sets the RPC exposes — never free text.
  const roleLabel = (slug: string | null) =>
    (slug && workLabels[slug]) || t("fieldRoleUnknown");
  const countryLabel = (code: string | null) =>
    code && tlm.has(`countryNames.${code}`) ? tlm(`countryNames.${code}`) : (code ?? "—");
  const startLabel = (val: string | null) =>
    val && t.has(`urgency.${val}`) ? t(`urgency.${val}`) : (val ?? "—");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>

      <FeatureNote testId="feature-note-opportunities">
        {(await getTranslations("featureNotes"))("opportunities")}
      </FeatureNote>

      {result.kind === "no-worker" ? (
        <section className="rounded-lg border border-dashed border-ink-500 px-4 py-6">
          <p className="text-sm text-text-secondary">{t("noWorkerBody")}</p>
          <Link
            href={profileHref}
            className="mt-3 inline-block rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80"
          >
            {t("ctaProfile")} →
          </Link>
        </section>
      ) : (
        <>
          {/* ── Your readiness (real own-data) ─────────────────────────── */}
          <section
            className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-800/40 p-4"
            data-testid="opportunities-readiness"
          >
            <div className="flex flex-col gap-0.5">
              <h2 className="font-display text-base font-semibold text-text-primary">
                {t("readinessTitle")}
              </h2>
              <p className="text-xs leading-relaxed text-text-secondary">
                {t("readinessIntro")}
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {(
                [
                  ["workType", result.readiness.hasWorkType],
                  ["skills", result.readiness.hasSkills],
                  ["country", result.readiness.countries.length > 0],
                  ["documents", result.readiness.documentsCount > 0],
                  ["availability", result.readiness.availabilitySet],
                ] as const
              ).map(([key, ok]) => (
                <li
                  key={key}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    ok
                      ? "border-state-success/40 bg-state-success/10 text-state-success"
                      : "border-state-amber/40 bg-state-amber/5 text-state-amber"
                  }`}
                  data-ready={ok ? "yes" : "no"}
                >
                  {t(`ready.${key}`)} · {ok ? t("ready.set") : t("ready.missing")}
                </li>
              ))}
            </ul>
            <Link
              href={profileHref}
              className="inline-block w-fit rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue/80"
            >
              {t("ctaProfile")} →
            </Link>
          </section>

          {/* Trust note — workers first see only approved / safely-managed
              opportunities (Worker Opportunities v1). */}
          <p
            className="rounded-md border border-brand-blue/25 bg-brand-blue/5 px-4 py-3 text-xs leading-relaxed text-text-secondary"
            data-testid="opportunities-trust-note"
          >
            {t("trustNote")}
          </p>

          {/* ── Opportunities (approved supply routes only) ────────────── */}
          {result.needsDataAccess ? (
            <section
              className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
              data-testid="opportunities-pending"
            >
              <h2 className="font-display text-base font-semibold text-text-primary">
                {t("needsAccessTitle")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {t("needsAccessBody")}
              </p>
            </section>
          ) : result.opportunities.length === 0 ? (
            <section
              className="rounded-lg border border-dashed border-ink-500 px-4 py-6"
              data-testid="opportunities-empty"
            >
              <h2 className="font-display text-base font-semibold text-text-primary">
                {t("approvedEmptyTitle")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {t("approvedEmptyBody")}
              </p>
            </section>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="opportunities-list">
              {result.opportunities.map(({ need, fit }) => (
                <li
                  key={need.id}
                  className="card-border flex flex-col gap-3 p-4"
                  data-status={fit.status}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-display text-base font-bold text-text-primary">
                      {roleLabel(need.roleText)}
                    </p>
                    <span
                      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[fit.status]}`}
                    >
                      {statusLabel(fit.status)}
                    </span>
                  </div>
                  {need.companyName ? (
                    <p className="text-xs text-text-secondary" data-testid="opportunity-company">
                      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {t("fieldCompany")}:
                      </span>{" "}
                      {need.companyName}
                    </p>
                  ) : null}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <div className="min-w-0">
                      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {t("fieldCountry")}
                      </dt>
                      <dd className="truncate text-xs text-text-primary">
                        {countryLabel(need.country)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {t("fieldStart")}
                      </dt>
                      <dd className="truncate text-xs text-text-primary">
                        {startLabel(need.startPeriod)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {t("fieldTeam")}
                      </dt>
                      <dd className="truncate text-xs text-text-primary">
                        {need.teamSize ?? "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {t("fieldAccommodation")}
                      </dt>
                      <dd className="truncate text-xs text-text-primary">
                        {need.accommodation
                          ? t.has(`accommodation.${need.accommodation}`)
                            ? t(`accommodation.${need.accommodation}`)
                            : need.accommodation
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  {fit.gaps.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {fit.gaps.map((g) => (
                        <span
                          key={g}
                          className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-[11px] text-state-amber"
                        >
                          {gapLabel(g)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={profileHref}
                      className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-primary hover:border-brand-blue"
                    >
                      {t("ctaProfile")} →
                    </Link>
                    {fit.status === "possible_match" ? (
                      <span className="text-[11px] text-text-muted">{t("possibleNote")}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] leading-relaxed text-text-muted">{t("footnote")}</p>
        </>
      )}
    </main>
  );
}
