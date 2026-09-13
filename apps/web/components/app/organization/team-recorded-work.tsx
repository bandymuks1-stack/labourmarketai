import { getTranslations } from "next-intl/server";
import { NotebookPen } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWorkIntelligence } from "@/lib/journal/work-intelligence-read";
import type { WorkPeriodKey } from "@/lib/journal/work-intelligence";
import {
  summarizeTeamWork,
  TEAM_ROLLUP_MAX,
  type TeamMemberInput,
  type TeamMemberWorkSummary,
  type TeamWorkSummary,
} from "@/lib/organization/team-work-summary";

/**
 * "UŽFIKSUOTAS DARBAS" — the organization's compact roll-up over its roster
 * (owner requirements 15–17, #1724 continuation; IA doc §4 last row:
 * organization surfaces KEEP, reuse the same readers).
 *
 * ONE reader, N calls. Each roster row below is `loadWorkIntelligence(
 * { supabase, userId }, workerId, { focus })` called AS THE MANAGER — the
 * very function the person's own "work in numbers", the Living CV, the
 * chat and the person page compose. RLS decides what each call returns
 * (`journal_entries_select`: own worker OR admin OR manager of the entry's
 * engagement organization; `work_hour_allocations_select`: own worker OR
 * manages the organization). No aggregate query, no team table, no admin
 * client, no second ledger.
 *
 * BOUNDED: at most `TEAM_ROLLUP_MAX` of the roster rows already on the
 * page, and the block says how many of how many. The person page carries
 * the full section for any one member (`#work-intelligence`).
 *
 * HONEST STATES (SEP-7 / SEP-8): a read that failed is "could not be
 * read"; a member the database showed no entries for is "no readable
 * records" — a manager's model holds only the entries logged against their
 * own organization's engagements, so an empty model is not "did no work".
 * Neither is ever a 0 h. The organization's own hour ledger (typed
 * timesheet lines, imported documents — with the source named) stands
 * BESIDE the journal figures and is added to nothing.
 */

const FOCUS: WorkPeriodKey = "month";

export type TeamRecordedWorkMember = {
  readonly workerId: string;
  readonly displayName: string | null;
  readonly email: string | null;
};

function fmtHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(hours);
}

function fmtShare(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
}

/**
 * Reads the roll-up. Exported apart from the rendering so the composition
 * (N × the one reader, as the caller) is visible in one place.
 */
export async function loadTeamRecordedWork(
  members: readonly TeamRecordedWorkMember[],
  opts: { readonly rosterTotal: number },
): Promise<TeamWorkSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const caller = { supabase, userId: user.id };
  const shown = members.slice(0, TEAM_ROLLUP_MAX);
  const inputs: TeamMemberInput[] = await Promise.all(
    shown.map(async (m) => ({
      workerId: m.workerId,
      name: m.displayName?.trim() || m.email || m.workerId.slice(0, 8),
      // THE reader — the same call, the same RLS scope, per member. A read
      // that throws is a failed read (null → UNKNOWN), never an empty model.
      wi: await loadWorkIntelligence(caller, m.workerId, { focus: FOCUS }).catch(
        () => null,
      ),
    })),
  );
  return summarizeTeamWork(inputs, { period: FOCUS, rosterTotal: opts.rosterTotal });
}

export async function TeamRecordedWork({
  members,
  locale,
}: {
  readonly members: readonly TeamRecordedWorkMember[];
  readonly locale: string;
}) {
  if (members.length === 0) return null;
  const t = await getTranslations("teamRecordedWork");
  // The period words and the ledger's provenance sentences are the journal
  // section's own — one vocabulary for the same fact on every surface.
  const tIntel = await getTranslations("journal.intelligence");
  const tSkillNames = await getTranslations("skillNames");
  const skillName = (slug: string): string =>
    tSkillNames.has(slug) ? tSkillNames(slug) : slug;

  const team = await loadTeamRecordedWork(members, { rosterTotal: members.length });
  if (team === null) return null;
  const periodLabel = tIntel(`period.${team.period}`);

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="team-recorded-work"
      data-period={team.period}
      data-measured={team.measured}
      data-unknown={team.unknown}
      data-no-readable={team.noReadableRecords}
    >
      <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
        <NotebookPen className="h-3.5 w-3.5" aria-hidden />
        {t("title")} · {periodLabel}
      </h2>
      <p className="text-meta leading-relaxed text-text-muted">
        {t("intro", { period: periodLabel })}
        {team.bound.shown < team.bound.total
          ? ` ${t("bound", { shown: team.bound.shown, total: team.bound.total })}`
          : ""}
      </p>

      {/* The roll-up line: one figure per ledger, each naming its base.
          UNKNOWN members are counted here and are in neither figure. */}
      <p className="text-sm leading-relaxed text-text-secondary" data-testid="team-recorded-work-totals">
        {team.journalHours
          ? t("journalTotal", {
              hours: fmtHours(team.journalHours.hours, locale),
              members: team.journalHours.members,
            })
          : t("journalTotalNone")}
        {team.organizationHours
          ? ` · ${t("organizationTotal", {
              hours: fmtHours(team.organizationHours.hours, locale),
              members: team.organizationHours.members,
            })}`
          : ""}
        {team.unknown > 0 ? ` · ${t("unknownCount", { count: team.unknown })}` : ""}
        {team.noReadableRecords > 0
          ? ` · ${t("noReadableCount", { count: team.noReadableRecords })}`
          : ""}
      </p>

      <ul className="flex flex-col gap-2">
        {team.members.map((m) => (
          <li key={m.workerId} data-testid={`team-recorded-work-row-${m.workerId}`}>
            <MemberRow
              m={m}
              locale={locale}
              periodLabel={periodLabel}
              t={t}
              tIntel={tIntel}
              skillName={skillName}
            />
          </li>
        ))}
      </ul>

      <p className="text-meta leading-relaxed text-text-muted">{t("rule")}</p>
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"teamRecordedWork">>>;
type TIntel = Awaited<ReturnType<typeof getTranslations<"journal.intelligence">>>;

function MemberRow({
  m,
  locale,
  periodLabel,
  t,
  tIntel,
  skillName,
}: {
  m: TeamMemberWorkSummary;
  locale: string;
  periodLabel: string;
  t: T;
  tIntel: TIntel;
  skillName: (slug: string) => string;
}) {
  const j = m.journal;
  const o = m.organization;
  return (
    <Card compact className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/dashboard/people/${m.workerId}#work-intelligence`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-text-primary hover:text-brand-blue"
          data-testid={`team-recorded-work-open-${m.workerId}`}
        >
          {m.name}
        </Link>
        <span
          className="font-mono text-meta text-text-secondary"
          data-testid={`team-recorded-work-journal-${m.workerId}`}
          data-state={j.state}
        >
          {j.state === "unknown"
            ? t("memberUnknown")
            : j.state === "no_readable_records"
              ? t("memberNoReadable")
              : t("memberFigures", {
                  hours: fmtHours(j.hours, locale),
                  entries: j.entries,
                  days: j.daysWorked,
                })}
        </span>
      </div>

      {j.state === "measured" && (
        <>
          {j.dayUnits > 0 ? (
            <span className="text-meta text-text-secondary">
              {t("memberDayUnits", { days: fmtHours(j.dayUnits, locale) })}
            </span>
          ) : null}
          <span className="text-meta leading-relaxed text-text-secondary" data-testid={`team-recorded-work-confirmed-${m.workerId}`}>
            {j.confirmedShare === null
              ? t("confirmedNoHours")
              : j.confirmedHours > 0
                ? t("confirmedShare", {
                    share: fmtShare(j.confirmedShare, locale),
                    hours: fmtHours(j.confirmedHours, locale),
                  })
                : t("confirmedNone")}
          </span>
          <span className="text-meta leading-relaxed text-text-secondary" data-testid={`team-recorded-work-skills-${m.workerId}`}>
            {j.topSkills.length > 0
              ? t("topSkills", {
                  list: j.topSkills
                    .map((s) => `${skillName(s.slug)} ${fmtShare(s.share, locale)}`)
                    .join(" · "),
                })
              : t("topSkillsNone")}
          </span>
          {j.coverageTruncated ? (
            <span className="text-meta text-text-muted">
              {t("coverageTruncated", { count: j.entriesRead })}
            </span>
          ) : null}
        </>
      )}

      {/* The organization's own ledger — the same period, beside, never added. */}
      <span
        className="text-meta leading-relaxed text-text-muted"
        data-testid={`team-recorded-work-ledger-${m.workerId}`}
        data-state={o.state}
      >
        {tIntel("orgRecords.title")}:{" "}
        {o.state === "unknown"
          ? t("ledgerUnknown")
          : o.state === "none"
            ? t("ledgerNone", { period: periodLabel })
            : [
                t("ledgerFigures", {
                  hours: fmtHours(o.hours, locale),
                  rows: o.rows,
                  days: o.daysWorked,
                }),
                o.importedHours > 0
                  ? tIntel("orgRecords.imported", { hours: fmtHours(o.importedHours, locale) })
                  : null,
                o.approvedHours > 0
                  ? tIntel("orgRecords.approved", { hours: fmtHours(o.approvedHours, locale) })
                  : null,
                o.linkedHours > 0
                  ? tIntel("orgRecords.linked", { hours: fmtHours(o.linkedHours, locale) })
                  : null,
                o.rejectedHours > 0
                  ? tIntel("orgRecords.rejected", { hours: fmtHours(o.rejectedHours, locale) })
                  : null,
              ]
                .filter((x): x is string => x !== null)
                .join(" · ")}
      </span>
    </Card>
  );
}
