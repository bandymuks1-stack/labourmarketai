"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  createTeamAction,
  inviteWorkerToTeamAction,
} from "@/lib/company/team-brigade-actions";
import type { TeamBrigade } from "@/lib/company/team-brigades";
import { TeamDetailsForm } from "@/components/app/team-details-form";
import { TeamEnquiryInbox } from "@/components/app/team-enquiry-inbox";

/**
 * Teams / brigades surface on the EXISTING company room (§8.3 + Trust
 * Connect Teams v1).
 *
 * - A brigade is an organizations row (organization_type='team') — no new
 *   dashboard, no parallel team system.
 * - CONSENT (gap 1): "add member" is GONE — the owner sends a canonical
 *   join_team invitation and the worker's own acceptance creates the
 *   membership. Provenance is shown honestly per member: joined by
 *   invitation vs added earlier without a recorded acceptance. Nothing is
 *   invented for pre-existing rows.
 * - DETAILS (gap 2) + ENQUIRIES (gap 3) are folded sections per team, each
 *   with an honest "prepared, not enabled" state until the owner applies the
 *   matching migration.
 * - The capability list (gap 4, beside availability) shows HONEST counts
 *   derived from members' existing worker_skills (declared vs
 *   manager-confirmed). It is not a team rating and never claims team-level
 *   verification.
 */
export function TeamBrigadesPanel({
  teams,
  locale,
  invitationsApplied,
  detailsApplied,
  enquiriesApplied,
}: {
  teams: readonly TeamBrigade[];
  locale: string;
  invitationsApplied: boolean;
  detailsApplied: boolean;
  enquiriesApplied: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("teamBrigades");
  const tSkill = useTranslations("skillNames");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});

  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMsg(null);
    startTransition(async () => {
      const res = await createTeamAction(trimmed);
      if (res.outcome === "created") {
        setName("");
        setMsg(t("outcome.created"));
      } else if (res.outcome === "invalid_team_name") {
        setMsg(t("outcome.invalidName"));
      } else if (res.outcome === "not_allowed") {
        setMsg(t("outcome.notAllowed"));
      } else if (res.outcome === "team_limit_reached") {
        setMsg(t("outcome.limitReached"));
      } else if (res.outcome === "needs_migration") {
        setMsg(t("outcome.needsMigration"));
      } else {
        setMsg(t("outcome.error"));
      }
      router.refresh();
    });
  }

  function invite(teamId: string) {
    const workerId = selected[teamId] ?? "";
    if (!workerId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await inviteWorkerToTeamAction({ teamId, workerId, locale });
      if (res.outcome === "sent") setMsg(t("inviteOutcome.sent"));
      else if (res.outcome === "created") setMsg(t("inviteOutcome.created"));
      else if (res.outcome === "delivery_failed")
        setMsg(t("inviteOutcome.deliveryFailed"));
      else if (res.outcome === "already_invited")
        setMsg(t("inviteOutcome.alreadyInvited"));
      else if (res.outcome === "rate_limited" || res.outcome === "limit_reached")
        setMsg(t("inviteOutcome.rateLimited"));
      else if (res.outcome === "not_authorized")
        setMsg(t("inviteOutcome.notAuthorized"));
      else if (res.outcome === "no_email") setMsg(t("inviteOutcome.noEmail"));
      else if (res.outcome === "needs_migration")
        setMsg(t("inviteOutcome.needsMigration"));
      else setMsg(t("inviteOutcome.error"));
      router.refresh();
    });
  }

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="team-brigades-panel"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
        <p className="text-meta leading-relaxed text-text-muted">
          {t("honestNote")}
        </p>
      </header>

      {teams.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="team-brigades-empty">
          {t("noTeams")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/40 p-4"
              data-testid={`team-brigade-${team.id}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-text-primary">
                  {team.name}
                </h3>
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("memberCount", { count: team.members.length })}
                </span>
              </div>

              {/* Dead-UI rule B: member names are plain data, not the
                  tappable-pill language used by real chips elsewhere. The
                  provenance suffix is honest ledger truth: joined by
                  invitation vs added earlier (no recorded acceptance). */}
              {team.members.length === 0 ? (
                <p className="text-xs text-text-muted">{t("noMembers")}</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {team.members.map((m) => (
                    <li key={m.engagementId} className="text-xs text-text-primary">
                      {m.name}
                      {m.provenance === "invited" && (
                        <span className="ml-1.5 text-meta text-state-success">
                          {t("provenance.invited")}
                        </span>
                      )}
                      {m.provenance === "direct" && (
                        <span className="ml-1.5 text-meta text-text-muted">
                          {t("provenance.direct")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Gap 4: availability + capability composition side by side. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("capabilityHeading")}
                  </span>
                  {team.capability === null || team.capability.length === 0 ? (
                    <p className="text-xs text-text-muted">{t("capabilityEmpty")}</p>
                  ) : (
                    <ul
                      className="flex flex-wrap gap-1.5"
                      data-testid={`team-capability-${team.id}`}
                    >
                      {team.capability.map((c) => (
                        <li
                          key={c.slug}
                          className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary"
                        >
                          <span className="text-text-primary">{skillLabel(c.slug)}</span>{" "}
                          · {t("declaredShort", { count: c.membersDeclared })}
                          {c.membersConfirmed > 0
                            ? ` · ${t("confirmedShort", { count: c.membersConfirmed })}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("availability.heading")}
                  </span>
                  {!detailsApplied ? (
                    <p
                      className="text-xs text-text-muted"
                      data-testid={`team-availability-not-enabled-${team.id}`}
                    >
                      {t("details.notEnabled")}
                    </p>
                  ) : team.details === null ? (
                    <p
                      className="text-xs text-text-muted"
                      data-testid={`team-availability-empty-${team.id}`}
                    >
                      {t("availability.notSet")}
                    </p>
                  ) : (
                    <ul
                      className="flex flex-wrap gap-1.5"
                      data-testid={`team-availability-${team.id}`}
                    >
                      <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-primary">
                        {team.details.availabilityStatus === "available_now"
                          ? t("details.status.availableNow")
                          : team.details.availabilityStatus === "available_from"
                            ? t("availability.from", {
                                date: team.details.availableFrom ?? "—",
                              })
                            : t("details.status.notAvailable")}
                      </li>
                      {team.details.accommodationNeeded && (
                        <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                          {t("availability.accommodationNeeded")}
                        </li>
                      )}
                      {team.details.transportOwn && (
                        <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                          {t("availability.ownTransport")}
                        </li>
                      )}
                      {team.details.maxTripDays != null && (
                        <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                          {t("availability.maxTripDays", {
                            count: team.details.maxTripDays,
                          })}
                        </li>
                      )}
                      {(team.details.deployableSizeMin != null ||
                        team.details.deployableSizeMax != null) && (
                        <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                          {t("availability.size", {
                            size:
                              team.details.deployableSizeMin != null &&
                              team.details.deployableSizeMax != null
                                ? team.details.deployableSizeMin ===
                                  team.details.deployableSizeMax
                                  ? String(team.details.deployableSizeMin)
                                  : `${team.details.deployableSizeMin}–${team.details.deployableSizeMax}`
                                : String(
                                    team.details.deployableSizeMin ??
                                      team.details.deployableSizeMax,
                                  ),
                          })}
                        </li>
                      )}
                      {team.details.destinationCountries &&
                        team.details.destinationCountries.length > 0 && (
                          <li className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary">
                            {t("availability.countries", {
                              list: team.details.destinationCountries.join(", "),
                            })}
                          </li>
                        )}
                    </ul>
                  )}
                </div>
              </div>

              {/* Folded: edit team details (gap 2). */}
              {detailsApplied && (
                <details className="rounded-md border border-ink-600 bg-ink-800/30 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-text-secondary">
                    {t("details.heading")}
                  </summary>
                  <div className="pt-3">
                    <TeamDetailsForm teamId={team.id} details={team.details} />
                  </div>
                </details>
              )}

              {/* Folded: enquiry inbox (gap 3). */}
              <details className="rounded-md border border-ink-600 bg-ink-800/30 p-3">
                <summary className="cursor-pointer text-xs font-medium text-text-secondary">
                  {t("enquiries.heading", {
                    count: team.enquiries.filter((e) => e.status === "created")
                      .length,
                  })}
                </summary>
                <div className="pt-3">
                  {enquiriesApplied ? (
                    <TeamEnquiryInbox teamId={team.id} enquiries={team.enquiries} />
                  ) : (
                    <p
                      className="text-xs text-text-muted"
                      data-testid={`team-enquiries-not-enabled-${team.id}`}
                    >
                      {t("enquiries.notEnabled")}
                    </p>
                  )}
                </div>
              </details>

              {/* Gap 1: membership by consent — send a join_team invitation;
                  the worker's own acceptance creates the membership. */}
              {!invitationsApplied ? (
                <p
                  className="text-meta text-text-muted"
                  data-testid={`team-invite-not-enabled-${team.id}`}
                >
                  {t("inviteNotEnabled")}
                </p>
              ) : team.addable.length === 0 ? (
                <p className="text-meta text-text-muted">{t("noAddable")}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className="text-xs text-text-secondary"
                      htmlFor={`team-add-${team.id}`}
                    >
                      {t("addLabel")}
                    </label>
                    <select
                      id={`team-add-${team.id}`}
                      className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                      value={selected[team.id] ?? ""}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [team.id]: e.target.value }))
                      }
                    >
                      <option value="">—</option>
                      {team.addable.map((w) => (
                        <option key={w.workerId} value={w.workerId}>
                          {w.invitePending
                            ? t("invitePendingOption", { name: w.name })
                            : w.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending || !(selected[team.id] ?? "")}
                      onClick={() => invite(team.id)}
                      data-testid={`team-invite-member-${team.id}`}
                    >
                      {t("addButton")}
                    </Button>
                  </div>
                  <p className="text-meta leading-relaxed text-text-muted">
                    {t("consentNote")}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-ink-600 pt-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary" htmlFor="team-create-name">
            {t("createLabel")}
          </label>
          <input
            id="team-create-name"
            type="text"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("createPlaceholder")}
            className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-sm text-text-primary"
            data-testid="team-create-name"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || name.trim().length < 2}
          onClick={create}
          data-testid="team-create-submit"
        >
          {pending ? t("creating") : t("createButton")}
        </Button>
      </div>

      {msg && (
        <p
          role="status"
          className="text-xs text-text-secondary"
          data-testid="team-brigades-msg"
        >
          {msg}
        </p>
      )}
    </section>
  );
}
