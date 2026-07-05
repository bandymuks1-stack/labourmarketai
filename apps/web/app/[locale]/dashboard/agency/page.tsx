import { redirect } from "next/navigation";

/**
 * Agency workspace folded into the canonical COMPANY workspace
 * (owner decision, Direction A, 2026-07-05).
 *
 * An agency is a COMPANY whose `companies.company_type = 'staffing_agency'`
 * (lib/config/roles.ts pins this; migration 20260612090000 provides the
 * enum value) — never a separate persona, dashboard, or duplicate
 * candidate/demand system. The staffing-agency operating mode renders
 * INSIDE /dashboard/company (typed chip + agency-mode actions), so this
 * legacy route is now a bookmark-preserving redirect stub, following the
 * marketplace → market-map and player-card → journal precedent.
 *
 * Honest data note: the legacy `public.agencies` table and lib/agency/*
 * read paths are untouched at the DB layer (data migration agencies →
 * companies is a separate owner-gated task). A legacy agency-role holder
 * who lands here follows the canonical chain: /dashboard/company gates on
 * the company role — without it the user reaches the /dashboard overview
 * (role switcher), with it but without a company row they see
 * CompanyNoProfileGuide. Never a dead end, nothing deleted.
 */
export default async function AgencyRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/company`);
}
