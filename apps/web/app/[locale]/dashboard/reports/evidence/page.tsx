import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PrintButton } from "@/components/app/print-button";
import { createClient } from "@/lib/supabase/server";
import { buildVerifiedCv } from "@/lib/cv-export/verified-cv";
import { buildEvidenceReport } from "@/lib/reports/evidence-report";

/**
 * Evidence Report v1 (PR #479) — a print-ready, honest evidence report built
 * ONLY from the worker's own RLS-scoped data (Verified CV tiers + signals).
 * Separates the evidence ladder (self-declared → work-supported → confirmed);
 * no scores, no fake verification, no matching. Print = the existing
 * window.print pattern (no new dependency).
 */
export default async function EvidenceReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("evidenceReport");
  const tSkill = await getTranslations("skillNames");
  const skillName = (slug: string): string => {
    try { const v = tSkill(slug); return v && v !== slug ? v : slug; } catch { return slug; }
  };

  const cvRes = await buildVerifiedCv();
  if (!cvRes.ok) {
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-3">
        <h1 className="font-display text-2xl font-bold text-text-primary">{t("title")}</h1>
        <p className="text-sm text-text-secondary" data-testid="evidence-report-not-worker">{t("notWorker")}</p>
        <Link href="/dashboard/profile" className="text-sm font-medium text-brand-blue hover:underline">{t("back")} →</Link>
      </div>
    );
  }
  const cv = cvRes.cv;
  const supported = cv.tiers.evidence.map(skillName);
  const unsupported = [...cv.tiers.declared.map(skillName), ...cv.declaredClaims];

  const report = buildEvidenceReport({
    tierCounts: {
      self_declared: cv.tiers.declared.length + cv.declaredClaims.length,
      work_supported: cv.tiers.evidence.length,
      manager_confirmed: cv.tiers.confirmed.length,
      verified: 0,
    },
    supportedSkills: supported,
    unsupportedSkills: unsupported,
    awaitingConfirmation: supported,
    journalEntries: cv.signals.journalEntries,
    confirmations: cv.signals.managerConfirmations,
    hasWorkNeedContext: false,
  });
  const byKey = Object.fromEntries(report.sections.map((s) => [s.key, s]));

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" data-testid="evidence-report">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <Link href="/dashboard/profile" className="self-start text-xs font-medium text-brand-blue hover:underline">← {t("back")}</Link>
          <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">{t("title")}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">{t("subtitle")}</p>
        </div>
        <PrintButton label={t("print")} className="border-ink-500 bg-ink-800 px-4 py-2 text-sm text-text-primary hover:border-brand-blue" />
      </header>

      <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary" data-testid="evidence-report-ladder">
        {t("ladderNote")}
      </p>

      {/* 1 — Profile evidence */}
      <section className="card-border flex flex-col gap-2 p-5" data-testid="report-section-profileEvidence">
        <h2 className="font-display text-base font-semibold text-text-primary">{t("s.profileEvidence")}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["total","total"],["selfDeclared","selfDeclared"],["workSupported","workSupported"],["confirmed","confirmed"]] as const).map(([k,label]) => (
            <div key={k} className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-center">
              <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">{t(`metric.${label}`)}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-text-primary">{byKey.profileEvidence.metrics[k] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 2 — Skills supported by work entries */}
      <section className="card-border flex flex-col gap-2 p-5" data-testid="report-section-skillsSupported">
        <h2 className="font-display text-base font-semibold text-text-primary">{t("s.skillsSupported")}</h2>
        {byKey.skillsSupported.items.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {byKey.skillsSupported.items.map((name, i) => (
              <li key={i} className="rounded-full border border-state-success/40 bg-state-success/5 px-2.5 py-1 text-xs text-text-secondary">{name}</li>
            ))}
          </ul>
        ) : <p className="text-xs text-text-muted">{t("emptySupported")}</p>}
      </section>

      {/* 3 — Work-entry summary */}
      <section className="card-border flex flex-col gap-2 p-5" data-testid="report-section-workEntrySummary">
        <h2 className="font-display text-base font-semibold text-text-primary">{t("s.workEntrySummary")}</h2>
        <p className="text-sm text-text-secondary">{t("entrySummary", { entries: byKey.workEntrySummary.metrics.entries, confirmations: byKey.workEntrySummary.metrics.confirmations })}</p>
      </section>

      {/* 4 — Missing evidence / confirmation needed */}
      <section className="card-border flex flex-col gap-2 p-5" data-testid="report-section-missingEvidence">
        <h2 className="font-display text-base font-semibold text-text-primary">{t("s.missingEvidence")}</h2>
        <p className="text-xs text-text-muted">{t("missingNote", { needEvidence: byKey.missingEvidence.metrics.needEvidence, needConfirmation: byKey.missingEvidence.metrics.needConfirmation })}</p>
        {byKey.missingEvidence.items.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {[...new Set(byKey.missingEvidence.items)].map((name, i) => (
              <li key={i} className="rounded-full border border-state-amber/40 bg-state-amber/5 px-2.5 py-1 text-xs text-text-secondary">{name}</li>
            ))}
          </ul>
        )}
      </section>

      {/* 5 — Company / work-need fit readiness */}
      <section className="card-border flex flex-col gap-2 p-5" data-testid="report-section-fitReadiness">
        <h2 className="font-display text-base font-semibold text-text-primary">{t("s.fitReadiness")}</h2>
        <p className="text-xs text-text-muted">{byKey.fitReadiness.state === "real" ? t("fitReal") : t("fitNotAvailable")}</p>
      </section>

      <p className="text-[11px] leading-relaxed text-text-muted">{t("footer")}</p>
    </div>
  );
}