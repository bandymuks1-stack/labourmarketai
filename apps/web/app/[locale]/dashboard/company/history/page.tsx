import { setRequestLocale, getTranslations } from "next-intl/server";
import { FileSpreadsheet, ClipboardList } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { EvidenceImportSection } from "@/components/app/evidence-import-section";

/**
 * ISTORIJA — the historical import door (owner IA correction 2026-09-16,
 * design/final/03 §2, §3 P0).
 *
 * THE canonical destination of "noriu įkelti istorinius duomenis". One
 * import engine (`lib/organization-evidence/import-core.ts`) stands behind
 * it: upload → inspect → detect structure → identify people / sites / dates /
 * hours / work → match what exists → PREPARE what is missing → detect
 * duplicates and contradictions → one preview → the human decides only the
 * real ambiguities → explicit commit → canonical records with provenance.
 *
 * The monthly hours grid (person × day) is a FORMAT this same engine reads
 * (`rowsFromTimesheetProposals`), so the operator's day-to-day hours surface
 * is linked from here as a neighbour, never as a second importer.
 *
 * `?evidenceSession=` keeps a staged source bookmarkable, exactly as the hub
 * did — the section itself decides everything else.
 */
export default async function CompanyHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");
  const sp = (await searchParams) ?? {};
  const evidenceSession =
    typeof sp.evidenceSession === "string" && sp.evidenceSession.trim() !== ""
      ? sp.evidenceSession.trim()
      : undefined;
  const t = await getTranslations("organizationDoors.pages.history");

  return (
    <div className="flex flex-col gap-6" data-testid="company-history">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      <div id="evidence-import-zone" className="scroll-mt-20">
        <EvidenceImportSection locale={locale} sessionId={evidenceSession} />
      </div>

      {/* Neighbouring doors of the same evidence: the hours surface (whose
          grid this engine also reads) and the evidence reports. */}
      <nav
        aria-label={t("hoursGridTitle")}
        className="grid gap-2 sm:grid-cols-2"
        data-testid="company-history-neighbours"
      >
        <Link
          href="/dashboard/hours"
          data-testid="company-history-hours-door"
          className="flex items-start gap-3 rounded-card border border-ink-600 bg-ink-800/40 px-4 py-3 transition-colors hover:border-brand-blue"
        >
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-brand-cyan" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold text-text-primary">{t("hoursDoor")} →</span>
            <span className="text-xs leading-relaxed text-text-secondary">
              {t("hoursGridNote")}
            </span>
          </span>
        </Link>
        <Link
          href="/dashboard/reports/evidence"
          data-testid="company-history-evidence-reports-door"
          className="flex items-start gap-3 rounded-card border border-ink-600 bg-ink-800/40 px-4 py-3 transition-colors hover:border-brand-blue"
        >
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-brand-cyan" aria-hidden />
          <span className="font-semibold text-text-primary">
            {t("evidenceReportsDoor")} →
          </span>
        </Link>
      </nav>
    </div>
  );
}
