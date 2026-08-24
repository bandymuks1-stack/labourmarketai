import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type {
  WeeklyIntelligenceSignal,
  WeeklyPersonalIntelligence,
} from "@/lib/worker/weekly-intelligence-model";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * WEEKLY PERSONAL INTELLIGENCE — the render half (value train 2+, wagon C-r1).
 *
 * The B1 view-model has been merged and emitting weekly_digest bell rows
 * since B2, but nothing RENDERED it — the digest's href landed the worker on
 * this page with no weekly summary in sight. This section closes that loop:
 * it localizes the codes-only signal list, nothing more. All honesty rules
 * live in the model (tested there): unavailable ≠ zero, "new since last
 * week" omitted while the seen store is absent, every count with its §19
 * basis. This component adds no derivation of its own.
 *
 * Renders nothing when neither the journal nor the market could be read —
 * the same rule the digest emitter applies (no signal, no surface).
 */
export async function WeeklyIntelligenceSection({
  intel,
  locale,
}: {
  intel: WeeklyPersonalIntelligence;
  locale: string;
}) {
  if (!intel.journal.available && !intel.opportunities.available) return null;

  const t = await getTranslations("opportunities");
  const tSkill = await getTranslations("skillNames");
  const workLabels = buildWorkTypeLabelMap(locale);
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });
  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const roleLabel = (slug: string | null) =>
    (slug && workLabels[slug]) || t("fieldRoleUnknown");

  const line = (signal: WeeklyIntelligenceSignal): ReactNode => {
    switch (signal.code) {
      case "journal_active":
        return t("weekly.journalActive", {
          entries: signal.entries,
          confirmed: signal.confirmed,
        });
      case "journal_inactive":
        return (
          <>
            {t("weekly.journalInactive")}{" "}
            <Link
              href={`/${locale}/dashboard/journal`}
              className="font-medium text-brand-blue hover:text-brand-cyan"
              data-testid="weekly-journal-cta"
            >
              {t("weekly.journalCta")} →
            </Link>
          </>
        );
      case "journal_unavailable":
        return t("weekly.journalUnavailable");
      case "matching_opportunities":
        return (
          <>
            {t("weekly.matching", { count: signal.count })}
            {signal.exemplar ? (
              <span className="text-text-muted">
                {" "}
                {t("weekly.matchingExemplar", {
                  role: roleLabel(signal.exemplar.roleSlug),
                  matched: signal.exemplar.basis.matchedTotal,
                  total: signal.exemplar.basis.needTotal,
                  confirmed: signal.exemplar.basis.matchedConfirmed,
                })}
              </span>
            ) : null}
          </>
        );
      case "no_matching_opportunities":
        return t("weekly.noMatching");
      case "opportunities_unavailable":
        return t("weekly.opportunitiesUnavailable");
      case "new_opportunities":
        return t("weekly.newOpportunities", { count: signal.count });
      case "appeared_this_week":
        return t("weekly.appearedThisWeek", { count: signal.count });
      case "missing_evidence":
        return t("weekly.skillsToAdd", {
          skills: signal.skillSlugs.map(skillLabel).join(", "),
        });
    }
  };

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-ink-600 bg-ink-800/40 p-4"
      data-testid="opportunities-weekly"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("weekly.title")}
        </h2>
        {/* Locale-formatted date range — punctuation only, no i18n key. */}
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {dateFmt(intel.window.startIso) ?? intel.window.startIso} –{" "}
          {dateFmt(intel.window.endIso) ?? intel.window.endIso}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {intel.signals.map((signal) => (
          <li
            key={signal.code}
            className="text-sm leading-relaxed text-text-secondary"
            data-testid={`weekly-signal-${signal.code}`}
          >
            {line(signal)}
          </li>
        ))}
      </ul>
    </section>
  );
}
