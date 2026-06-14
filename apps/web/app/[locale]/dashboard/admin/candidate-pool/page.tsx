import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { loadCandidatePool } from "@/lib/staffing/candidate-pool";
import {
  CandidatePoolBoard,
  type CandidatePoolLabels,
} from "@/components/app/candidate-pool-board";

/**
 * Operator candidate pool (Staffing Operating Model v1, PR7). READ-ONLY,
 * admin-gated (requireSuperadmin first). Reuses the existing worker supply
 * (matching-workbench loader, admin-RLS). Filter by trade / country /
 * availability / evidence; honest statuses (confirmed evidence vs self-declared
 * vs missing info), never "verified". No write, no migration, no publishing.
 */
const TRADE_SLUGS = [
  "general_laborer",
  "carpenter",
  "concrete_worker",
  "drywaller",
  "electrician",
  "mason",
  "painter",
  "plumber",
  "rebar_worker",
  "roofer",
  "tiler",
  "welder",
] as const;

export default async function CandidatePoolPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("candidatePool");
  const tp = await getTranslations("professions");
  const result = await loadCandidatePool(locale);

  const labels: CandidatePoolLabels = {
    title: t("title"),
    subtitle: t("subtitle"),
    notVerifiedNote: t("notVerifiedNote"),
    filterProfession: t("filterProfession"),
    filterCountry: t("filterCountry"),
    filterAvailableBy: t("filterAvailableBy"),
    filterEvidence: t("filterEvidence"),
    search: t("search"),
    any: t("any"),
    evidenceConfirmed: t("evidenceConfirmed"),
    evidenceSelfDeclared: t("evidenceSelfDeclared"),
    evidenceMissing: t("evidenceMissing"),
    count: t("count"),
    colName: t("colName"),
    colTrade: t("colTrade"),
    colCountry: t("colCountry"),
    colAvailable: t("colAvailable"),
    colExperience: t("colExperience"),
    colEvidence: t("colEvidence"),
    colMissing: t("colMissing"),
    expYears: t("expYears"),
    none: t("none"),
    empty: t("empty"),
  };

  const professionLabels = Object.fromEntries(
    TRADE_SLUGS.map((s) => [s, tp(s)]),
  );

  return (
    <div className="mx-auto max-w-container px-6 py-10 sm:px-10" id="main-content">
      {result.kind === "needs-migration" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 p-4 text-sm text-state-warning">
          {t("needsMigration")}
        </p>
      ) : result.kind === "error" ? (
        <p className="rounded-md border border-state-warning bg-state-warning/10 p-4 text-sm text-state-warning">
          {t("error")}
        </p>
      ) : (
        <CandidatePoolBoard
          candidates={result.candidates}
          labels={labels}
          professionLabels={professionLabels}
        />
      )}
    </div>
  );
}
