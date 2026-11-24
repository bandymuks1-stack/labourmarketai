import type { ReactNode } from "react";

import { Eyebrow, LevelMark, RegionHead, Reveal, Stamp, type EvidenceLevel } from "@/components/app/premium/grammar";
import { Card } from "@/components/ui/Card";
import { buttonLinkClassName } from "@/components/ui/Button";
import {
  seasonPeriodLabel,
  type AthleteConfirmedBehind,
  type AthleteProfile,
  type AthleteSeason,
  type AthleteSeasonEvidence,
  type AthleteSkill,
  type AthleteSkillState,
  type AthleteStat,
} from "@/lib/cv/athlete-profile";
import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";
import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * THE ATHLETE-PROFILE FORM OF THE LIVING CV, phone first. Pure over the
 * view-model: every word comes from a translator and every fact from
 * `AthleteProfile`. Existing tokens, Card and grammar only; the visual direction
 * awaits the owner's verdict, so it restyles nothing and is linked from nowhere.
 *
 * Words carry every state, and a mark only repeats them. No bar, meter or rating
 * of the person exists here (doctrine §19).
 */

export type AthleteTranslator = (key: string, values?: Record<string, string | number>) => string;

export type AthleteProfileCopy = {
  /** `cvExport.athlete` */
  readonly a: AthleteTranslator;
  /** `cvExport` */
  readonly cv: AthleteTranslator;
  /** `cvExport.premium` */
  readonly premium: AthleteTranslator;
  /** `cvOrganizationHistory` */
  readonly orgHistory: AthleteTranslator;
  /** `evidenceTier` */
  readonly tier: AthleteTranslator;
  /** `careerJourney` */
  readonly journey: AthleteTranslator;
  /** A reveal's label for the whole list, with its total. */
  readonly showAll: (count: number) => string;
};

const SEASONS_SHOWN = 6;
const SKILLS_SHOWN = 10;

const SEASON_LEVEL: Record<AthleteSeasonEvidence, EvidenceLevel> = {
  confirmed: "confirmed",
  client_accepted: "confirmed",
  organization_record: "recorded",
  own_record: "recorded",
  stated: "declared",
};

const SKILL_LEVEL: Record<AthleteSkillState, EvidenceLevel> = {
  confirmed: "confirmed",
  certified: "confirmed",
  recorded: "recorded",
  declared: "declared",
  potential: "declared",
};

function namedList(names: readonly string[], manyLabel: (count: number) => string): string | null {
  if (names.length === 0) return null;
  return names.length <= 2 ? names.join(", ") : manyLabel(names.length);
}

function StatCell({
  stat,
  wide,
  hours,
  formatCount,
  copy,
}: {
  readonly stat: AthleteStat;
  readonly wide: boolean;
  readonly hours: (h: number) => string;
  readonly formatCount: (n: number) => string;
  readonly copy: AthleteProfileCopy;
}) {
  const { a, tier } = copy;
  const manyOrgs = (count: number) => a("stats.organizationCount", { count });
  const confirmedLine = (b: AthleteConfirmedBehind | null): string[] => {
    if (!b) return [];
    if (b.selfOnly) return [a("stats.confirmedSelfOnly")];
    const who = [namedList(b.organizations, manyOrgs), b.roles.join(", ") || null].filter(Boolean).join(" · ");
    return [
      who ? a("stats.confirmedBy", { who }) : a("stats.confirmedBySomeone"),
      ...(b.selfConfirmed ? [a("stats.someSelfConfirmed", { qualifier: tier("selfConfirmQualifier") })] : []),
      ...(b.automatic ? [tier("autoConfirmQualifier")] : []),
    ];
  };
  const behind: string[] =
    stat.state !== "value"
      ? [stat.state === "unknown" ? a("stats.unknown") : a(`stats.${stat.key}.none`)]
      : stat.key === "confirmed"
        ? confirmedLine(stat.behind)
        : stat.key === "organization" && stat.organizations.length > 0
          ? [namedList(stat.organizations, manyOrgs) ?? ""]
          : [a(`stats.${stat.key}.behind`)];
  const value =
    stat.state === "value" ? (stat.key === "projects" ? formatCount(stat.value) : hours(stat.value)) : "—";
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 border-l border-t border-text-primary/10 p-4 sm:min-w-[11rem] sm:flex-1 ${wide ? "col-span-2" : ""}`}
      data-testid={`athlete-stat-${stat.key}`}
      data-state={stat.state}
    >
      <dt className="order-2 mt-1 text-support font-medium leading-snug text-text-primary">{a(`stats.${stat.key}.label`)}</dt>
      <dd className="order-1 font-display text-[clamp(1.75rem,7vw,2.25rem)] font-semibold leading-none tracking-[-0.03em] text-text-primary [font-feature-settings:'tnum']">
        {value}
      </dd>
      {behind.map((line) => (
        <dd key={line} className="order-3 text-meta leading-snug text-text-muted">
          {line}
        </dd>
      ))}
    </div>
  );
}

function seasonHoursText(
  season: AthleteSeason,
  fmt: (h: number) => string,
  copy: AthleteProfileCopy,
): string | null {
  const { a } = copy;
  const h = season.hours;
  if (!h) return season.hoursNotStated ? a("seasons.hoursNotStated") : null;
  if (h.kind === "journal") {
    return h.confirmed !== null
      ? a("seasons.hoursConfirmed", { confirmed: fmt(h.confirmed), recorded: fmt(h.recorded) })
      : a("seasons.hoursRecorded", { hours: fmt(h.recorded) });
  }
  if (h.kind === "entity") return a("seasons.hoursRecorded", { hours: fmt(h.hours) });
  return [
    h.dayHours !== null ? a("seasons.orgDayHours", { hours: fmt(h.dayHours), count: h.dayRecords }) : null,
    h.periodHours !== null ? a("seasons.orgPeriodHours", { hours: fmt(h.periodHours) }) : null,
  ]
    .filter((x): x is string => !!x)
    .join(" · ");
}

function SeasonCard({
  season,
  locale,
  fmt,
  copy,
}: {
  readonly season: AthleteSeason;
  readonly locale: string;
  readonly fmt: (h: number) => string;
  readonly copy: AthleteProfileCopy;
}) {
  const { a, premium, orgHistory, tier } = copy;
  const period = seasonPeriodLabel(season.period, locale, premium("present"));
  const hours = seasonHoursText(season, fmt, copy);
  const title = season.title ?? premium("untitled");
  const bandText = !season.band
    ? null
    : season.band.kind === "former_name"
      ? orgHistory("periodBand", { label: season.band.label })
      : season.source === "earlier_entity" && !season.band.administeredBy
        ? null
        : orgHistory("legalEntityBand", { label: season.band.label, org: season.band.administeredBy ?? "—" });
  const who = season.confirmedByRoles.join(", ");
  return (
    <div data-testid="athlete-season" data-evidence={season.evidence} data-source={season.source}>
    <Card compact className="overflow-hidden">
      {season.photoUrl ? (
        // A short-lived signed URL of a private bucket, as the avatar does it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={season.photoUrl}
          alt={a("seasons.photoAlt", { name: season.project ?? title })}
          loading="lazy"
          className="-mx-4 -mt-4 mb-3 aspect-[16/9] w-[calc(100%+2rem)] max-w-none object-cover"
          data-testid="athlete-season-photo"
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-1.5">
        <Stamp>{period ?? a("seasons.undated")}</Stamp>
        <h3 className="font-display text-card-title font-semibold leading-snug text-text-primary">{title}</h3>
        {season.role ? <p className="text-support text-text-secondary">{season.role}</p> : null}
        {season.subtitle ? <p className="text-support text-text-secondary">{season.subtitle}</p> : null}
        {bandText ? <p className="text-meta text-text-muted">{bandText}</p> : null}
        {season.project && season.project !== title ? (
          <p className="text-meta text-text-muted">{season.project}</p>
        ) : null}
        {season.description ? (
          <p className="whitespace-pre-wrap text-support leading-relaxed text-text-secondary">{season.description}</p>
        ) : null}
        {hours ? (
          <p className="text-support font-medium text-text-primary [font-feature-settings:'tnum']" data-testid="athlete-season-hours">
            {hours}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
          <LevelMark level={SEASON_LEVEL[season.evidence]} />
          <span data-testid="athlete-season-evidence">
            {season.evidence === "confirmed" && who
              ? a("seasons.confirmedBy", { who })
              : a(`seasons.evidence.${season.evidence}`)}
          </span>
          {season.placement ? <span>· {a("seasons.placement")}</span> : null}
          {season.selfConfirmed ? <span>· {tier("selfConfirmQualifier")}</span> : null}
          {season.reconstructed ? <span>· {a("seasons.reconstructed")}</span> : null}
          {season.contested ? <span>· {orgHistory("contested")}</span> : null}
        </p>
      </div>
    </Card>
    </div>
  );
}

function skillTimeText(skill: AthleteSkill, fmt: (h: number) => string, copy: AthleteProfileCopy): string | null {
  const { a, cv } = copy;
  if (skill.state === "potential") return a("skills.potentialFrom", { skills: skill.from.join(", ") });
  if (skill.level) return skill.level;
  if (skill.unverifiedDocument) return a("skills.documentUnverified");
  if (skill.validUntil) return `${cv("validUntil")}: ${skill.validUntil}`;
  const time = skill.time;
  if (time.kind === "attributed") {
    return time.confirmedHours > 0
      ? a("seasons.hoursConfirmed", { confirmed: fmt(time.confirmedHours), recorded: fmt(time.attributedHours) })
      : a("seasons.hoursRecorded", { hours: fmt(time.attributedHours) });
  }
  if (time.kind === "involvement_only") return a("skills.involved", { hours: fmt(time.involvedHours) });
  return null;
}

function EmptyLine({
  text,
  action,
}: {
  readonly text: string;
  readonly action?: { readonly href: string; readonly label: string };
}) {
  return (
    <div data-testid="athlete-empty">
    <Card variant="empty" className="flex flex-col items-start gap-3">
      <p className="text-support leading-relaxed text-text-secondary">{text}</p>
      {action ? (
        <Link href={action.href} className={buttonLinkClassName("secondary", "sm")}>
          {action.label}
        </Link>
      ) : null}
    </Card>
    </div>
  );
}

function Region({
  id,
  testId,
  eyebrow,
  title,
  privateRegion = false,
  children,
}: {
  readonly id: string;
  readonly testId: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly privateRegion?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-4 ${privateRegion ? "print:hidden" : ""}`}
      data-testid={testId}
    >
      <div id={id}>
        <RegionHead eyebrow={eyebrow} title={title} />
      </div>
      {children}
    </section>
  );
}

export function AthleteProfileView({
  profile,
  locale,
  formatHours,
  copy,
}: {
  readonly profile: AthleteProfile;
  readonly locale: string;
  /** Hours in the reader's unit ("8 ч" in RU, "8 val." in LT). */
  readonly formatHours: (hours: number) => string;
  readonly copy: AthleteProfileCopy;
}) {
  const { a, cv, journey } = copy;
  const { hero, stats, seasons, skills, nextMove } = profile;
  const name = hero.name ?? cv("nameNotProvided");
  const formatCount = (n: number) => new Intl.NumberFormat(locale).format(n);
  // The strip fills its grid: the lead stat takes a phone row of its own when
  // the rest pair up evenly.
  const leadWide = stats.length % 2 === 1;
  const anySeasonHours = seasons.some((s) => s.hours !== null);
  const total = stats.some((s) => s.key === "total" && s.state === "value");

  return (
    <article className="flex min-w-0 flex-col gap-10 sm:gap-12" data-testid="athlete-profile">
      <p className="text-meta text-text-muted print:hidden" data-testid="athlete-early-note">
        {a("earlyNote")}
      </p>

      <header className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-end gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6" data-testid="athlete-hero">
        {hero.portraitUrl ? (
          // A short-lived signed URL of a private bucket, as the avatar does it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hero.portraitUrl}
            alt={a("hero.portraitAlt", { name })}
            className="aspect-[4/5] w-full rounded-card object-cover"
            data-testid="athlete-portrait"
          />
        ) : (
          <div
            aria-hidden
            className="flex aspect-[4/5] w-full items-center justify-center rounded-card bg-ink-700 font-display text-[clamp(1.75rem,8vw,3.25rem)] font-semibold text-text-secondary"
            data-testid="athlete-monogram"
          >
            {personMonogram(hero.name)}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          {hero.roles.length > 0 ? (
            <Eyebrow>{hero.roles.join(" · ")}</Eyebrow>
          ) : (
            <Eyebrow>{a("hero.noRole")}</Eyebrow>
          )}
          <h1 className="break-words font-display text-[clamp(2rem,8.5vw,3.75rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-text-primary">
            {name}
          </h1>
          {hero.place ? <p className="text-support text-text-secondary">{hero.place}</p> : null}
          {hero.availability ? (
            <p className="text-support font-medium text-text-primary print:hidden" data-testid="athlete-availability">
              {cv(`privateDetails.status.${hero.availability.status}`)}
              {hero.availability.from
                ? ` · ${a("hero.availableFrom", { date: formatUtcDate(hero.availability.from, locale) ?? hero.availability.from })}`
                : ""}
              <span className="block text-meta font-normal text-text-muted">{a("hero.onlyYou")}</span>
            </p>
          ) : null}
        </div>
      </header>

      <section aria-label={a("stats.aria")} data-testid="athlete-stats" className="flex flex-col gap-2">
        <Card className="overflow-hidden !p-0">
          <dl className="-ml-px -mt-px grid grid-cols-2 sm:flex sm:flex-wrap">
            {stats.map((s, i) => (
              <StatCell
                key={s.key}
                stat={s}
                wide={leadWide && i === 0}
                hours={formatHours}
                formatCount={formatCount}
                copy={copy}
              />
            ))}
          </dl>
        </Card>
        {profile.journalTruncated ? (
          <p className="text-meta text-text-muted" data-testid="athlete-truncated">
            {a("stats.truncated")}
          </p>
        ) : null}
      </section>

      <Region id="athlete-seasons" testId="athlete-seasons" eyebrow={a("seasons.eyebrow")} title={a("seasons.title")}>
        {seasons.length === 0 ? (
          <EmptyLine text={a("seasons.empty")} action={{ href: "/dashboard/journal", label: a("seasons.emptyAction") }} />
        ) : (
          <>
            <Reveal
              limit={SEASONS_SHOWN}
              showAllLabel={copy.showAll(seasons.length)}
              listClassName="flex flex-col gap-3"
              className="gap-3"
              items={seasons.map((s) => (
                <SeasonCard key={s.key} season={s} locale={locale} fmt={formatHours} copy={copy} />
              ))}
            />
            {anySeasonHours && total ? (
              <p className="text-meta leading-relaxed text-text-muted" data-testid="athlete-seasons-note">
                {a("seasons.note")}
              </p>
            ) : null}
          </>
        )}
      </Region>

      <Region id="athlete-skills" testId="athlete-skills" eyebrow={a("skills.eyebrow")} title={a("skills.title")}>
        {skills.length === 0 ? (
          <EmptyLine text={a("skills.empty")} action={{ href: "/dashboard/profile", label: a("skills.emptyAction") }} />
        ) : (
          <Reveal
            limit={SKILLS_SHOWN}
            showAllLabel={copy.showAll(skills.length)}
            listAs="ul"
            listClassName="flex flex-col"
            items={skills.map((s) => {
              const detail = skillTimeText(s, formatHours, copy);
              return (
                <li
                  key={s.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-t border-text-primary/10 py-3"
                  data-testid="athlete-skill"
                  data-state={s.state}
                >
                  <span className="min-w-0 text-[1rem] font-medium text-text-primary">{s.name}</span>
                  <span className="flex items-center gap-2 text-meta font-medium text-text-secondary">
                    <LevelMark level={SKILL_LEVEL[s.state]} />
                    {a(`skills.state.${s.state}`)}
                  </span>
                  {detail ? <span className="col-span-2 text-meta text-text-muted">{detail}</span> : null}
                </li>
              );
            })}
          />
        )}
        {profile.skillTimeUnknown && skills.length > 0 ? (
          <p className="text-meta text-text-muted">{a("skills.timeUnknown")}</p>
        ) : null}
        <p className="text-meta leading-relaxed text-text-muted" data-testid="athlete-no-score">
          {a("skills.noScore")}
        </p>
      </Region>

      {nextMove ? (
        <Region id="athlete-next" testId="athlete-next" eyebrow={a("next.eyebrow")} title={a("next.title")} privateRegion>
          {nextMove.state === "items" ? (
            <ul className="flex flex-col gap-3">
              {nextMove.items.map((item) => (
                <li key={item.key} data-testid="athlete-next-item">
                  <Card compact className="flex flex-col gap-1.5">
                    <h3 className="font-display text-card-title font-semibold text-text-primary">{item.name}</h3>
                    {item.confirmed.length > 0 ? (
                      <p className="text-support text-text-secondary">{a("next.confirmed", { list: item.confirmed.join(", ") })}</p>
                    ) : null}
                    {item.inRecords.length > 0 ? (
                      <p className="text-support text-text-secondary">{a("next.inRecords", { list: item.inRecords.join(", ") })}</p>
                    ) : null}
                    {item.missing.length > 0 ? (
                      <p className="text-support text-text-secondary">{a("next.missing", { list: item.missing.join(", ") })}</p>
                    ) : null}
                    <Stamp className="mt-1">{journey("derived")}</Stamp>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine text={a(nextMove.state === "unknown" ? "next.unknown" : "next.none")} />
          )}
          <p className="text-meta text-text-muted">{a("hero.onlyYou")}</p>
        </Region>
      ) : null}

      <footer className="print:hidden">
        <Link href="/cv" className={buttonLinkClassName("secondary", "sm")} data-testid="athlete-full-cv">
          {a("fullCv")}
        </Link>
      </footer>
    </article>
  );
}
