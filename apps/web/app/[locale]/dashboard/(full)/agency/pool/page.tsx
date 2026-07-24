import { redirect } from "next/navigation";

/**
 * Agency worker pool folded into the canonical COMPANY workspace
 * (owner decision, Direction A, 2026-07-05).
 *
 * The real, canonical roster surface is the company room's worker section
 * (company_workers + invitations, #company-team anchor on
 * /dashboard/company). The legacy pool over the separate `agencies` /
 * `agency_workers` tables stays untouched at the DB layer; this route is a
 * bookmark-preserving redirect stub only (marketplace / player-card
 * precedent). No data deleted, no fake merge claimed.
 */
export default async function AgencyPoolRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/company#company-team`);
}
