import { getTranslations, getLocale } from "next-intl/server";
import type { ManagerEvidence } from "@/lib/operations/manager-evidence";
import { formatUtcDate } from "@/lib/time/display";

/**
 * Manager / reviewer evidence card. Shows that leadership activity is backed by
 * the manager's own recorded review actions — explicitly framed as
 * "system-evidenced activity", never "verified manager" / "externally
 * confirmed". The honesty distinction (self-declared vs system-evidenced vs
 * externally confirmed) is spelled out in the footnote so the label can never
 * be read as an external verification it is not.
 */
export async function ManagerEvidenceCard({ evidence }: { evidence: ManagerEvidence }) {
  const t = await getTranslations("managerEvidence");
  const locale = await getLocale();

  const stats: { label: string; value: string }[] = [
    { label: t("entriesReviewed"), value: String(evidence.entriesReviewed) },
    { label: t("confirmations"), value: String(evidence.confirmations) },
    { label: t("correctionsRequested"), value: String(evidence.correctionsRequested) },
  ];
  if (evidence.lastActivity) {
    stats.push({
      label: t("lastActivity"),
      value: formatUtcDate(evidence.lastActivity, locale) ?? "",
    });
  }

  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="manager-evidence-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {t("title")}
        </h3>
        <span className="rounded-full bg-state-success/10 px-2 py-0.5 text-meta font-medium text-state-success">
          {t("systemEvidenced")}
        </span>
      </div>

      <p className="text-meta leading-relaxed text-text-secondary">
        {t("description")}
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="text-meta uppercase tracking-label text-text-muted">
              {s.label}
            </dt>
            <dd className="font-display text-lg font-semibold text-text-primary">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-meta leading-relaxed text-text-muted">
        {t("distinctionNote")}
      </p>
    </section>
  );
}
