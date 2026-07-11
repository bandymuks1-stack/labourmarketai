import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import {
  CONSENTED_PROFILE_TARGET,
  getLaunchReadiness,
} from "@/lib/admin/launch-readiness";

/**
 * Operator launch-readiness view (launch repair Scope E).
 *
 * Answers ONE question before any marketing spend: how much REAL supply and
 * demand does the platform hold today? Every number is a live count over
 * existing production data (see lib/admin/launch-readiness.ts). Unknown
 * reads render "—". No percentages, no "ready" badges, no fabricated
 * fullness — the honest gap analysis lives in
 * docs/launch/real-supply-readiness-gap-v1.md.
 */
export default async function AdminLaunchReadinessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("adminLaunchReadiness");
  const result = await getLaunchReadiness();
  if (result.kind === "not-admin") {
    // requireSuperadmin already redirected; this is unreachable belt-and-braces.
    return null;
  }
  const r = result.readiness;
  const show = (n: number | null) => (n === null ? "—" : String(n));

  const consentKnown = r.profilesConsented !== null;
  const consentMet =
    consentKnown && r.profilesConsented! >= CONSENTED_PROFILE_TARGET.min;

  const supplyTiles: Array<[string, number | null]> = [
    [t("supply.total"), r.workersTotal],
    [t("supply.withProfession"), r.workersWithProfession],
    [t("supply.withLocation"), r.workersWithLocation],
    [t("supply.available"), r.workersAvailable],
    [t("supply.withSalary"), r.workersWithSalary],
    [t("supply.withJournal"), r.workersWithJournalEvidence],
    [t("supply.withReadyDocs"), r.workersWithReadyDocs],
    [t("supply.teams"), r.teamsTotal],
  ];

  const demandTiles: Array<[string, number | null]> = [
    [t("demand.companies"), r.companiesTotal],
    [t("demand.intakesNew"), r.intakesNew],
    [t("demand.intakesContacted"), r.intakesContacted],
    [t("demand.intakesQualified"), r.intakesQualified],
    [t("demand.intakesRejected"), r.intakesRejected],
    [t("demand.requestsSubmitted"), r.customerRequestsSubmitted],
  ];

  return (
    <div className="flex flex-col gap-6" data-testid="admin-launch-readiness">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Pre-marketing consent target — a real count against the owner's
          15–25 goal. No percentage, no progress theatre. */}
      <section
        className={`flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 ${
          consentMet
            ? "border-state-success/40 bg-state-success/10"
            : "border-state-amber/40 bg-state-amber/10"
        }`}
        data-testid="consent-target"
      >
        <span className="font-display text-2xl font-bold text-text-primary">
          {show(r.profilesConsented)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-text-primary">
            {t("consent.label", {
              min: CONSENTED_PROFILE_TARGET.min,
              max: CONSENTED_PROFILE_TARGET.max,
            })}
          </span>
          <span className="text-xs leading-relaxed text-text-secondary">
            {consentMet ? t("consent.met") : t("consent.notMet")}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("supply.title")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {supplyTiles.map(([label, value]) => (
            <Tile key={label} label={label} value={show(value)} />
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t("supply.note")}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("demand.title")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {demandTiles.map(([label, value]) => (
            <Tile key={label} label={label} value={show(value)} />
          ))}
        </div>
        <Link
          href="/dashboard/admin/company-need-intakes"
          className="text-sm font-semibold text-brand-blue hover:underline"
          data-testid="launch-readiness-intakes-link"
        >
          {t("demand.queueLink")} →
        </Link>
      </section>

      <p className="text-[11px] leading-relaxed text-text-muted">
        {t("gapNote")}
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-border flex flex-col gap-1 p-3">
      <span className="font-display text-xl font-bold text-text-primary">
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </span>
    </div>
  );
}
