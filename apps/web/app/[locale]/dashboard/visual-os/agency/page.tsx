import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import {
  AgencyCard,
  AgencyNextActionsCard,
  CandidateAccessLimitCard,
  EarlyContributorPriorityCard,
  OwnedWorkersScopeCard,
  PaidSearchServiceLockedCard,
  type AgencyEntity,
} from "@/components/visual/agency-cards";
import { VISUAL_TOKENS } from "@/lib/visual/tokens";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperadmin } from "@/lib/auth/superadmin";

/**
 * Slice 4 — Agency / company operating surface.
 *
 * Lives under the Visual Dashboard OS subtree (the alternative
 * route from the sprint spec) because the canonical
 * /[locale]/dashboard/agency route is already in use by the
 * agency-role dashboard (pilot drafts + team roster + Tier-2
 * readiness). This sibling surface explains how an agency
 * participates in labourmarket.ai today when the full
 * marketplace is not yet live.
 *
 * Honesty rules:
 *   - The sample agency is the only entity rendered and is
 *     prefixed `Sample · ` so it cannot pass for a verified
 *     agency.
 *   - All counts default to 0; the page never invents a number.
 *   - All CTAs are visually disabled with explicit "preview"
 *     pills — no request is sent, no checkout is started, no
 *     publication happens.
 *   - The "Early contributor priority" card carries its
 *     no-guarantee disclaimer inline.
 */

const SAMPLE_AGENCY: AgencyEntity = {
  id: "sample-a-001",
  displayName: "Sample · Baltic Workforce Partner",
  agencyType: "staffing",
  countryOrMarket: "LT / EU",
  ownWorkerCount: 0,
  activeCandidateCount: 0,
  profileCompletenessPct: 35,
  ownerApprovedBy: null,
  isSample: true,
};

export default async function VisualOsAgencyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Owner-review visual-plan surface (sample data) — admin/owner-only
  // (action-first IA v1). Non-admins are redirected to the dashboard.
  await requireSuperadmin(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const uiLocale: "lt" | "en" = locale === "lt" ? "lt" : "en";
  const label = (lt: string, en: string) => (uiLocale === "lt" ? lt : en);

  return (
    <div className="flex flex-col gap-6" data-testid="visual-os-agency-page">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
          {label(
            "VIZUALINIS PLANAS · NE FUNKCIJOS KELIAS",
            "VISUAL PLAN · NOT A FEATURE PATH",
          )}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {label("Agentūros / įmonės korta · vizualinis planas", "Agency / company card · visual plan")}
        </h1>
        <p className="text-sm text-text-secondary">
          {label(
            "Šis puslapis yra dizaino / navigacijos sluoksnis. Tai NĖRA užbaigta agentūros funkcija. Realus agentūros nustatymas vyksta kitur — žiūrėk nuorodas žemiau.",
            "This page is a design / navigation layer. It is NOT a completed agency function. The real agency setup happens elsewhere — see the links below.",
          )}
        </p>
        <div
          className="card-border flex flex-col gap-2 p-3"
          data-testid="visual-os-agency-real-paths"
        >
          <p className="text-xs font-semibold text-text-primary">
            {label("Realūs agentūros keliai:", "Real agency paths:")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={"/dashboard/start/agency" as "/dashboard"}
              className="rounded-md border border-brand-blue px-3 py-1 text-xs text-brand-blue hover:bg-brand-blue/10"
              data-testid="visual-os-agency-cta-start"
            >
              {label(
                "→ Pradėti agentūros nustatymą (/dashboard/start/agency)",
                "→ Start agency setup (/dashboard/start/agency)",
              )}
            </Link>
            <Link
              href={"/dashboard/agency" as "/dashboard"}
              className="rounded-md border border-ink-500 px-3 py-1 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
              data-testid="visual-os-agency-cta-workspace"
            >
              {label(
                "→ Agentūros darbo erdvė (/dashboard/agency, jei vaidmuo turimas)",
                "→ Agency workspace (/dashboard/agency, if role held)",
              )}
            </Link>
          </div>
        </div>
        <div
          className="card-border inline-flex w-fit items-center gap-2 px-3 py-1 text-xs"
          data-testid="visual-os-agency-preview-banner"
        >
          <span>
            {label(
              "Šio puslapio kortelės naudoja Sample · pavyzdinius duomenis. Tai dizaino direkcija, ne tikras katalogas.",
              "Cards on this page use Sample · placeholder data. This is direction, not a real catalogue.",
            )}
          </span>
        </div>
        <Link
          href={"/dashboard/visual-os" as "/dashboard"}
          className={`inline-flex w-fit items-center gap-2 rounded-full ${VISUAL_TOKENS.chipSurface} px-3 py-1 text-xs font-medium ${VISUAL_TOKENS.chipText} hover:underline`}
          data-testid="visual-os-agency-back-link"
        >
          ← {label("Grįžti į Visual Dashboard OS", "Back to Visual Dashboard OS")}
        </Link>
      </header>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-testid="visual-os-agency-card-row"
      >
        <AgencyCard agency={SAMPLE_AGENCY} locale={uiLocale} />
        <OwnedWorkersScopeCard
          ownWorkerCount={SAMPLE_AGENCY.ownWorkerCount}
          locale={uiLocale}
        />
      </section>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-testid="visual-os-agency-access-row"
      >
        <CandidateAccessLimitCard
          ownWorkersAvailable={SAMPLE_AGENCY.ownWorkerCount}
          locale={uiLocale}
        />
        <PaidSearchServiceLockedCard status="manual_request" locale={uiLocale} />
      </section>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-testid="visual-os-agency-priority-row"
      >
        <EarlyContributorPriorityCard locale={uiLocale} />
        <AgencyNextActionsCard locale={uiLocale} />
      </section>

      <footer className="flex flex-col gap-1 text-xs text-text-secondary">
        <p>
          {label(
            "Sąžiningas preview · Be sintetinių veidų · Be sugalvotų skaičių · Be automatinio matching · Tai nėra darbo ar pasiūlymo garantija.",
            "Honest preview · No synthesised faces · No invented numbers · No automatic matching · This is not a job or offer guarantee.",
          )}
        </p>
      </footer>
    </div>
  );
}
