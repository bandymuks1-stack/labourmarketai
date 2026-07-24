import { redirect } from "next/navigation";

/**
 * Agency setup folded into the canonical COMPANY setup
 * (owner decision, Direction A, 2026-07-05).
 *
 * New agency signups were already closed (roles.ts: agency availability
 * "hidden", canBeAddedLater: false — "an agency is a COMPANY whose
 * company_type is 'staffing_agency'"). The one canonical setup path is
 * /dashboard/start/company, where 'staffing_agency' is a company TYPE
 * picked inside the single company profile. This legacy route is a
 * bookmark-preserving redirect stub; the legacy `agencies` table and the
 * add_role('agency') RPC are untouched at the DB layer.
 */
export default async function AgencyStartRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/start/company`);
}
