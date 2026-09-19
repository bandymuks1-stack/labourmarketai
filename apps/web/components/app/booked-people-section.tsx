import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import type { BookedPeopleResult } from "@/lib/company/booked-people";

/**
 * BOOKED PEOPLE — the GREEN half of R-2 on the employer's people page.
 *
 * ─── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 * A worker the company booked directly (OFFER → COMMITMENT) holds a
 * `company_worker_engagements` row and nothing else. The people page listed
 * the roster, the invitations and the organization members — and never the
 * booked person. The employer could assign them to a project from /projects
 * and still had no place that said "this person works with you" or, more
 * importantly, WHY their journal is not in the review queue.
 *
 * ─── WHAT THIS IS ───────────────────────────────────────────────────────────
 * The relationship, made visible, with its honest evidence state:
 *
 *   isMember = false  → "Journal not reviewable — a booking on its own does
 *                        not open a journal. Invite them to join as an
 *                        employee; the moment THEY accept, the context exists
 *                        and you can enable review."
 *   isMember = true   → "Organization member — journal review is governed in
 *                        the members panel below."
 *
 * The exit is the ONE canonical invitation surface (/dashboard/network,
 * type=join_as_employee). Acceptance provisions the `employee` engagement
 * context (`accept_invitation_apply_v2`) — the WORKER's act, never the
 * employer's. No new relationship model, no new write, no authority widened.
 *
 * ─── ONLY REAL DATA ─────────────────────────────────────────────────────────
 * Name and start date are stored columns. Nothing is estimated, scored or
 * inferred. A failed read is its own sentence — never "nobody is booked".
 */
export async function BookedPeopleSection({
  result,
}: {
  result: BookedPeopleResult;
}) {
  const t = await getTranslations("organizationDoors.pages.people.booked");

  // Nothing to say when the table is absent (owner-gated environment) or
  // there is genuinely nobody booked — the roster section already covers
  // the empty people page; an extra empty box would be noise.
  if (result.kind === "needs-migration") return null;
  if (result.kind === "ok" && result.rows.length === 0) return null;

  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="booked-people"
      aria-labelledby="booked-people-title"
    >
      <header className="flex flex-col gap-1">
        <h2 id="booked-people-title" className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {result.kind === "error" ? (
        <p className="text-sm text-state-danger" role="status" data-testid="booked-people-error">
          {t("error")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40" data-testid="booked-people-list">
          {result.rows.map((row) => (
            <li
              key={row.engagementId}
              className="flex flex-col gap-1 py-3"
              data-testid={`booked-person-${row.engagementId}`}
              data-member={row.isMember ? "true" : "false"}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-base font-semibold text-text-primary">
                  {row.name ?? t("unnamed")}
                </span>
                <span className="font-mono text-meta tabular-nums text-text-muted">
                  {t("since", { date: row.startedAt.slice(0, 10) })}
                </span>
              </div>
              {row.isMember ? (
                <p className="text-sm text-text-secondary" data-testid="booked-person-member">
                  {t("memberState")}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p
                    className="text-sm text-text-secondary"
                    data-testid="booked-person-not-reviewable"
                  >
                    {t("notReviewableState")}
                  </p>
                  <Link
                    href={"/dashboard/network?type=join_as_employee" as "/dashboard"}
                    className="w-fit text-sm font-medium text-brand-blue underline-offset-2 hover:underline"
                    data-testid="booked-person-invite-link"
                  >
                    {t("inviteExit")}
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
