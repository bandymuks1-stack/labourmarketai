"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { addOrgMember } from "@/lib/operations/org-membership";
import { createTeamAction } from "@/lib/company/team-brigade-actions";
import type { TeamBrigade } from "@/lib/company/team-brigades";

/**
 * Teams / brigades minimum surface on the EXISTING company room (§8.3).
 *
 * - A brigade is an organizations row (organization_type='team') — no new
 *   dashboard, no parallel team system.
 * - "Add member" reuses the EXISTING canonical addOrgMember action
 *   (engagement_contexts 'employee'), exactly like the org-members panel.
 * - The capability list shows HONEST counts derived from members' existing
 *   worker_skills (declared vs manager-confirmed). It is not a team rating
 *   and never claims team-level verification.
 */
export function TeamBrigadesPanel({ teams }: { teams: readonly TeamBrigade[] }) {
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

  function addMember(teamId: string) {
    const workerId = selected[teamId] ?? "";
    if (!workerId) return;
    setMsg(null);
    startTransition(async () => {
      const res = await addOrgMember(teamId, workerId);
      setMsg(res.ok ? t("memberOutcome.added") : t("memberOutcome.error"));
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
        <p className="text-[11px] leading-relaxed text-text-muted">
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
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("memberCount", { count: team.members.length })}
                </span>
              </div>

              {team.members.length === 0 ? (
                <p className="text-xs text-text-muted">{t("noMembers")}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {team.members.map((m) => (
                    <li
                      key={m.engagementId}
                      className="rounded-full border border-ink-500 px-2 py-0.5 text-xs text-text-primary"
                    >
                      {m.name}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                        className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-[11px] text-text-secondary"
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

              {team.addable.length === 0 ? (
                <p className="text-[11px] text-text-muted">{t("noAddable")}</p>
              ) : (
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
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending || !(selected[team.id] ?? "")}
                    onClick={() => addMember(team.id)}
                    data-testid={`team-add-member-${team.id}`}
                  >
                    {t("addButton")}
                  </Button>
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
        <p className="text-xs text-text-secondary" data-testid="team-brigades-msg">
          {msg}
        </p>
      )}
    </section>
  );
}
