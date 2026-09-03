import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { readInstitutionLearners } from "@/lib/education/institution-learners";

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
  const read = await readInstitutionLearners(organizationId);

  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
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
        <p className="text-xs text-text-muted" data-testid="institution-learners-unavailable">
          —
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

      <Link
        href="/dashboard/network"
        className="inline-flex w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 py-1.5 text-xs font-semibold text-ink-900 transition-opacity hover:opacity-90"
        data-testid="institution-learners-invite"
      >
        {t("invite")} →
      </Link>
    </section>
  );
}
