import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import { canRequest } from "@/lib/education/cohort-join-model";
import type { CohortJoinRead } from "@/lib/education/cohort-join";

import { RequestCohortJoinForm, WithdrawCohortJoinButton, type CohortJoinLabels } from "./learner-cohort-join-forms";

/**
 * J-12 learner side (owner decision 2026-11-02): find a learning group an
 * institution has opened, ask to join it, see where the request stands.
 *
 * The owner's second rule is said in the section itself: the learner keeps
 * recording their own practice whether or not an institution has accepted
 * them, and that record reads as their own declaration until the
 * institution's authorised person confirms it (decision 0028).
 *
 * Renders nothing while this database has no join requests, and nothing for a
 * person who is not on the student path and has no group to find — an empty
 * card would only be noise on a worker's profile.
 */
export async function LearnerCohortJoinSection({
  read,
  student,
}: {
  readonly read: CohortJoinRead;
  readonly student: boolean;
}) {
  if (read.status === "not_available") return null;
  if (read.status === "ok" && read.cohorts.length === 0 && !student) return null;
  if (read.status === "unavailable" && !student) return null;
  const t = await getTranslations("learnerCohortJoin");
  const labels: CohortJoinLabels = {
    nameLabel: t("form.nameLabel"),
    nameHint: t("form.nameHint"),
    noteLabel: t("form.noteLabel"),
    send: t("form.send"),
    withdraw: t("form.withdraw"),
    saving: t("form.saving"),
    requested: t("form.requested"),
    alreadyMember: t("form.alreadyMember"),
    withdrawn: t("form.withdrawn"),
    closed: t("form.closed"),
    invalid: t("form.invalid"),
    error: t("form.error"),
  };
  const pending = read.status === "ok" && read.cohorts.some((c) => c.myStatus === "requested");

  return (
    <Card compact>
      <section className="flex flex-col gap-3" data-testid="learner-cohort-join" aria-labelledby="learner-cohort-join-title">
        <header className="flex flex-col gap-1">
          <h2 id="learner-cohort-join-title" className="font-display text-base font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary" data-testid="learner-cohort-join-declared">
            {t("declaredNote")}{" "}
            <Link href="/dashboard/journal" className="text-brand-blue hover:underline">
              {t("journalLink")} →
            </Link>
          </p>
        </header>
        {read.status === "unavailable" ? (
          <p className="text-xs text-text-muted" data-testid="learner-cohort-join-unavailable">{t("unavailable")}</p>
        ) : read.cohorts.length === 0 ? (
          <p className="text-xs text-text-muted" data-testid="learner-cohort-join-empty">{t("empty")}</p>
        ) : (
          <details className="rounded-md border border-ink-600 p-3" open={pending || student}>
            <summary className="cursor-pointer text-xs font-semibold text-text-primary">{t("find", { count: read.cohorts.length })}</summary>
            <ul className="mt-3 flex flex-col gap-3" data-testid="learner-cohort-join-list">
              {read.cohorts.map((c) => (
                <li key={c.cohortId} className="flex flex-col gap-2 rounded-md bg-ink-800/60 p-2" data-testid={`learner-cohort-${c.cohortId}`}>
                  <div className="flex flex-col text-xs">
                    <span className="font-semibold text-text-primary">{c.cohortName}</span>
                    <span className="text-text-secondary">
                      {c.programName}
                      {c.institutionName ? ` · ${c.institutionName}` : ""}
                      {c.startsOn ? ` · ${c.startsOn}${c.endsOn ? ` → ${c.endsOn}` : ""}` : ""}
                    </span>
                  </div>
                  {c.myStatus === "requested" ? (
                    <div className="flex flex-wrap items-center gap-2" data-testid={`learner-cohort-status-${c.cohortId}`} data-status="requested">
                      <span className="text-xs text-state-warning">{t("status.requested")}</span>
                      <WithdrawCohortJoinButton cohortId={c.cohortId} labels={labels} />
                    </div>
                  ) : c.myStatus === "declined" ? (
                    <p className="text-xs text-text-muted" data-testid={`learner-cohort-status-${c.cohortId}`} data-status="declined">
                      {t("status.declined")}
                    </p>
                  ) : null}
                  {canRequest(c) ? <RequestCohortJoinForm cohortId={c.cohortId} labels={labels} /> : null}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </Card>
  );
}
