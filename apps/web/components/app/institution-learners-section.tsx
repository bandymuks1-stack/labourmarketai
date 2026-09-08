import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import { readInstitutionLearners } from "@/lib/education/institution-learners";
import { OUTCOMES_K_ANONYMITY_FLOOR, readInstitutionLearnerOutcomes } from "@/lib/education/institution-outcomes";

/**
 * Institution learners — participation state for an education institution
 * (Track C slice 1, FIRST REAL ECOSYSTEM USE 2026-09-03). Server component;
 * renders on the company workspace ONLY for organisations that declared the
 * `training_provider` capability.
 *
 * Shows exactly what the institution may see (least-privilege ruling
 * 2026-08-27): how many learners are connected, and the student invitations
 * it sent with their state — the names/e-mails it typed itself. Never a
 * learner's journal, skills or profile. Honest degradation: an unavailable
 * read says so instead of showing "no learners".
 */
export async function InstitutionLearnersSection({
  organizationId,
}: {
  readonly organizationId: string;
}) {
  const t = await getTranslations("roleDashboards.company.learners");
  const [read, outcomes] = await Promise.all([
    readInstitutionLearners(organizationId),
    readInstitutionLearnerOutcomes(organizationId),
  ]);

  return (
    <Card compact>
    <section
      className="flex flex-col gap-3"
      data-testid="institution-learners"
      aria-labelledby="institution-learners-title"
    >
      <header className="flex flex-col gap-1">
        <h2 id="institution-learners-title" className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{t("subtitle")}</p>
      </header>

      {read.status === "unavailable" ? (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="institution-learners-unavailable">
          {t("unavailable")}
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2 text-xs" data-testid="institution-learners-counts">
            <li className="rounded-full border border-state-success/40 bg-state-success/10 px-2.5 py-1 text-text-primary">
              {t("connected", { count: read.connectedCount })}
            </li>
            <li className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-text-secondary">
              {t("pending", { count: read.counts.pending })}
            </li>
            {read.counts.declined + read.counts.expired + read.counts.revoked > 0 ? (
              <li className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-text-muted">
                {t("declined", {
                  count: read.counts.declined + read.counts.expired + read.counts.revoked,
                })}
              </li>
            ) : null}
          </ul>

          {/* OUTCOMES — a report from real state (owner contract §19), through
              the ONE aggregate function. Counts only; below the k-anonymity
              floor the function suppresses them and the section SAYS so —
              never zeros pretending to be an answer. Unavailable stays
              silent here: the participation read above already carries the
              honest unavailable line for the section. */}
          {outcomes.status === "ok" ? (
            <div className="flex flex-col gap-1" data-testid="institution-learner-outcomes">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("outcomesTitle")}</h3>
              {outcomes.outcomes.suppressed ? (
                <p className="text-xs leading-relaxed text-text-muted" data-testid="institution-learner-outcomes-suppressed">
                  {t("outcomesSuppressed", { count: outcomes.outcomes.learnersConnected, floor: OUTCOMES_K_ANONYMITY_FLOOR })}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2 text-xs" data-testid="institution-learner-outcomes-counts">
                  <li className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-text-secondary">
                    {t("outcomesActive", { count: outcomes.outcomes.activeLast30d ?? 0 })}
                  </li>
                  <li className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-text-secondary">
                    {t("outcomesInterest", { count: outcomes.outcomes.withInterestSignals ?? 0 })}
                  </li>
                  <li className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-text-secondary">
                    {t("outcomesBookings", { count: outcomes.outcomes.withAcceptedBookings ?? 0 })}
                  </li>
                  <li className="rounded-full border border-state-success/40 bg-state-success/10 px-2.5 py-1 text-text-primary">
                    {t("outcomesEngagements", { count: outcomes.outcomes.withActiveEngagements ?? 0 })}
                  </li>
                </ul>
              )}
            </div>
          ) : null}

          {read.invitations.length === 0 ? (
            <p className="text-xs leading-relaxed text-text-muted" data-testid="institution-learners-empty">
              {t("none")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-600" data-testid="institution-learners-list">
              {read.invitations.slice(0, 50).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2 text-xs"
                  data-testid={`institution-learner-${row.status}`}
                >
                  <span className="min-w-0 truncate text-text-primary">
                    {row.invitedName ?? row.invitedEmail}
                  </span>
                  <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
                    {t(
                      row.status === "accepted"
                        ? "statusAccepted"
                        : row.status === "pending"
                          ? "statusPending"
                          : row.status === "declined"
                            ? "statusDeclined"
                            : row.status === "revoked"
                              ? "statusRevoked"
                              : "statusExpired",
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Deep link straight into the ONE invitation panel with the right
          type, organisation and relationship pre-selected (`join_organization`
          + `student`), so inviting a learner is one click, not four
          collapsed-panel steps. Same pattern the chat home uses. */}
      <Link
        href={`/dashboard/network?type=join_organization&org=${organizationId}&relationship=student` as "/dashboard/network"}
        className="inline-flex w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 py-1.5 text-xs font-semibold text-ink-900 transition-opacity hover:opacity-90"
        data-testid="institution-learners-invite"
      >
        {t("invite")} →
      </Link>
    </section>
    </Card>
  );
}
