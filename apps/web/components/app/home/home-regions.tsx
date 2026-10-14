import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { HomeRetry } from "@/components/app/home/home-retry";
import { LevelMark } from "@/components/app/premium/grammar";
import { StatusChip } from "@/components/app/status-chip";
import { buttonLinkClassName } from "@/components/ui/Button";
import {
  loadHomeBecause,
  loadHomeOutside,
  loadHomeRunning,
  loadHomeWaiting,
} from "@/lib/home/home-server";
import type {
  BecauseRegion,
  HomeChange,
  OutsideRegion,
  RunningRegion,
  WaitingRegion,
} from "@/lib/home/home-state";
import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import type { GrowthDirection } from "@/lib/journal/growth-reading";
import { FIT_BAND_ORDER } from "@/lib/opportunities/fit-band";
import { formatUtcDate } from "@/lib/time/display";
import {
  isTodayGrowthShown,
  isTodayOpportunityShown,
  type TodayDoorKind,
  type TodayOpenItem,
} from "@/lib/today/today-model";
import { TODAY_STATIONS, type TodayStationId } from "@/lib/today/today-route";
import { cn } from "@/lib/utils";

/**
 * THE FOUR REGIONS of the worker's home — the owner-frozen design class
 * (4e695e261, branch feat/cc/visual-language-proof, commits 6207e9642 +
 * 487d3b5b9) re-ported onto main's own readers and primitives, and REWORKED
 * after the owner's D1 visual review (2026-10-14):
 *
 *   01 Laukia tavęs      WAITING  — the ONE next action + what waits on the
 *                                   person (offers, invitations, unread,
 *                                   journal items)
 *   02 Kas pasikeitė     TRACE    — the consequence trace (`home-trace.tsx`,
 *                                   Future Experience A, 2026-10-14): what the
 *                                   person did → what changed → what it opened
 *   03 Vyksta dabar      RUNNING  — recorded work as figures and a recorded /
 *                                   confirmed bar, assigned projects as
 *                                   tiles, one growth sentence
 *   04 Tavo galimybės    OUTSIDE  — the market as a fit-band bar
 *   05 Naujausi įvykiai  BECAUSE  — what happened; on the home only the PLAIN
 *                                   events (the causal chains moved to 02)
 *
 * Desktop uses its width: two columns (01+02 | 03+04) from `lg`. The phone
 * reads 01→04 in DOM order, titles sit inside the card head (no separate
 * title band), and the event list is short — everything else is one tap away.
 *
 * RESTRAINT (owner directions 2026-10-09/10): ONE gold action on the whole
 * screen (`today-next-cta`), structure over colour, sentence case — mono
 * only for numbers. Green appears ONLY for hours a manager/client approved
 * (a second party stands behind them); a state is a word in a shape.
 *
 * HONESTY (SEP-7): a reader that FAILED is named ("could not be read") with a
 * way to read again, never an empty list and never a zero; an EMPTY real
 * answer is calm and said once or left out. Every figure is a reader's own.
 *
 * Every direct action and test id the old ŠIANDIEN sections carried is kept.
 */

const stationHref = (id: TodayStationId): string => TODAY_STATIONS.find((s) => s.id === id)!.href;

/** At most this many projects are named on the home; the rest are one link away. */
export const HOME_PROJECTS_SHOWN = 4;
/** At most this many happenings on the home; the activity page keeps the rest. */
export const HOME_EVENTS_SHOWN = 3;
/** On a phone the list stops at two; the rest are one tap away. */
const HOME_EVENTS_SHOWN_PHONE = 2;

/** A whole row that is one door — the 44 px floor is part of the constant. */
const ROW_LINK =
  "flex min-h-11 group items-center justify-between gap-4 rounded-control px-3 -mx-3 py-2 text-support text-text-primary sm:py-2.5 sm:text-body transition-colors hover:bg-ink-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const ARROW = "shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5";
const LABEL = "text-support font-medium text-text-muted";
const NOTE = "text-support text-text-secondary";
const NUMERAL = "font-display font-semibold tabular-nums tracking-tightest text-text-primary";
/** A secondary action: quiet bordered button, never gold. */
const SECONDARY = `${buttonLinkClassName("secondary")} shrink-0 max-md:w-full`;

function Reading({ label }: { readonly label: string }) {
  return (
    <p role="status" aria-live="polite" className="text-support text-text-muted">
      {label}
    </p>
  );
}

/** The streaming placeholder a region shows while its reader is read. */
export function HomeRegionPending({ label }: { readonly label: string }) {
  return (
    <div className="rounded-card border border-ink-600/70 bg-ink-800/40 p-5">
      <Reading label={label} />
    </div>
  );
}

/**
 * One region: a surface with its title INSIDE the head (number · title ·
 * optional aside), so the phone does not pay a separate title band per
 * region. `featured` is the region that carries the one gold action — it
 * gets the brand hairline, nothing else does.
 */
export function Region({
  id,
  index,
  title,
  state,
  testId,
  extra,
  aside,
  featured = false,
  children,
}: {
  readonly id: "waiting" | "running" | "because" | "outside" | "trace";
  /** The region number — the one mono line (a number, not a label). */
  readonly index: string;
  readonly title: string;
  readonly state: string;
  readonly testId?: string;
  readonly extra?: Record<string, string | undefined>;
  readonly aside?: ReactNode;
  readonly featured?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId ?? `home-${id}`}
      data-region={id}
      data-state={state}
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-card border p-4 sm:gap-4 sm:p-6",
        featured
          ? "border-brand-blue/35 bg-gradient-to-b from-ink-800 to-ink-800/60 shadow-card"
          : "border-ink-600/70 bg-ink-800/50",
      )}
      {...extra}
    >
      {featured ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/70 to-transparent" />
      ) : null}
      <header className="flex items-baseline gap-3">
        <span className="font-mono text-meta tabular-nums text-text-muted">{index}</span>
        <h2 className="min-w-0 font-display text-body font-semibold tracking-tightest text-text-primary sm:text-title">
          {title}
        </h2>
        {aside ? <div className="ml-auto shrink-0">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export type RetryLabels = { readonly retry: string; readonly retrying: string };

/** A failed read: named, with a way to read again. */
export function Unreadable({ text, testid, labels }: { readonly text: string; readonly testid: string; readonly labels: RetryLabels }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" role="status">
      <p className={NOTE} data-testid={testid}>
        {text}
      </p>
      <HomeRetry label={labels.retry} pendingLabel={labels.retrying} testid={`${testid}-retry`} />
    </div>
  );
}

export async function retryLabels(): Promise<RetryLabels> {
  const t = await getTranslations("homeRegions");
  return { retry: t("retry"), retrying: t("retrying") };
}

// ───────────────────────── 01 · WAITING ─────────────────────────

export async function HomeWaiting({ locale }: { readonly locale: ActiveLocale }) {
  const { region, unknownDoors } = await loadHomeWaiting();
  return <HomeWaitingView locale={locale} region={region} unknownDoors={unknownDoors} />;
}

/** Data-driven view, so every state is provable without a database
 *  (`lib/home/home-regions-render.test.ts`). */
export async function HomeWaitingView({
  locale,
  region,
  unknownDoors,
}: {
  readonly locale: ActiveLocale;
  readonly region: WaitingRegion;
  readonly unknownDoors: readonly TodayDoorKind[];
}) {
  const [t, tRegion, tCard, tJournal, tUnits] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("homeRegions.waiting"),
    getTranslations("auth.dashboard.workCard"),
    getTranslations("journal.intelligence"),
    getTranslations("productivityUnits"),
  ]);
  const rl = await retryLabels();
  const fmtHours = (h: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const unitName = (slug: string) => (tUnits.has(slug) ? tUnits(slug) : slug);

  /** A door carries its own route; the journal's own items open the journal. */
  const openItemHref = (item: TodayOpenItem): string => ("href" in item ? item.href : "/dashboard/journal");
  const openItemText = (item: TodayOpenItem): string => {
    switch (item.kind) {
      case "offers":
        return t("open.offers", { n: item.count });
      case "invitations":
        return t("open.invitations", { n: item.count });
      case "unread":
        return t("open.unread", { n: item.count });
      case "untimed":
        return t("open.untimed", { n: item.entries });
      case "unlabelled":
        return t("open.unlabelled", { n: item.entries });
      case "check": {
        const c = item.check;
        return (
          tJournal(`checks.${c.code}`, {
            hours: fmtHours(c.hours),
            day: c.day,
            entries: c.entryIds.length,
            title: c.title ?? tJournal("checks.untitled"),
            ignored: c.ignored ? `${fmtHours(c.ignored.value)} ${unitName(c.ignored.unit)}` : "",
          }) +
          (c.organizationHours > 0
            ? ` ${tJournal("checks.organizationHours", { hours: fmtHours(c.organizationHours) })}`
            : "")
        );
      }
    }
  };

  if (region.kind === "unknown") {
    return (
      <Region id="waiting" index="01" title={tRegion("title")} state="unknown">
        <Unreadable text={tRegion("unknown")} testid="today-next-unknown" labels={rl} />
      </Region>
    );
  }

  const next = region.items.find((i) => i.kind === "next");
  const open = region.items.filter((i): i is Extract<typeof i, { kind: "open" }> => i.kind === "open");
  const openUnknown = region.openUnknown || unknownDoors.length > 0;
  const count = open.length + (next ? 1 : 0);

  return (
    <Region
      id="waiting"
      index="01"
      title={tRegion("title")}
      state="known"
      featured={Boolean(next)}
      aside={
        count > 0 ? (
          <span className="rounded-full border border-ink-500 px-2.5 py-0.5 font-mono text-meta tabular-nums text-text-secondary" data-testid="home-waiting-count">
            {count}
          </span>
        ) : null
      }
    >
      {next ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between" data-testid="today-next">
          <div className="min-w-0">
            <p className="font-display text-body font-semibold text-text-primary sm:text-card-title">{tCard(`next.${next.next.dim}`)}</p>
            <p className={`mt-1 ${NOTE}`}>{tCard(next.next.whyKey)}</p>
            {next.next.stale ? (
              <p className={`mt-1 ${NOTE}`} data-testid="today-next-stale">
                {tCard("stale.body")}
              </p>
            ) : null}
          </div>
          {/* THE ONE GOLD ACTION on the whole home. */}
          <Link
            href={next.next.href as "/dashboard"}
            data-testid="today-next-cta"
            className={`${buttonLinkClassName("primary")} shrink-0 max-md:w-full`}
          >
            {tCard(`next.${next.next.dim}`)}
          </Link>
        </div>
      ) : null}

      {region.nextUnknown ? (
        <p className={NOTE} data-testid="today-next-unknown" role="status">
          {t("next.unknown")}
        </p>
      ) : null}

      {open.length > 0 ? (
        <ul
          className={cn("flex flex-col", next && "border-t border-ink-600/60 pt-2")}
          data-testid="today-open"
          data-attention-unknown={unknownDoors.length > 0 ? unknownDoors.join(" ") : undefined}
        >
          {open.map(({ item }, i) => (
            <li key={item.kind === "check" ? item.check.key : `${item.kind}-${i}`}>
              <Link href={openItemHref(item) as "/dashboard"} data-testid={`today-open-${item.kind}`} className={ROW_LINK}>
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted" />
                  <span className="min-w-0">{openItemText(item)}</span>
                </span>
                <span aria-hidden className={ARROW}>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {openUnknown ? (
        <div className={cn(open.length > 0 || next ? "border-t border-ink-600/60 pt-3" : "")}>
          <Unreadable text={t("open.unknown")} testid="today-open-unknown" labels={rl} />
        </div>
      ) : null}

      {!next && open.length === 0 && !openUnknown && !region.nextUnknown ? (
        <p className={NOTE} data-testid="home-waiting-clear">
          {tRegion("clear")}
        </p>
      ) : null}
    </Region>
  );
}

// ───────────────────────── 02 · RUNNING ─────────────────────────

export async function HomeRunning({ locale }: { readonly locale: ActiveLocale }) {
  return <HomeRunningView locale={locale} running={await loadHomeRunning()} />;
}

export async function HomeRunningView({
  locale,
  running,
}: {
  readonly locale: ActiveLocale;
  readonly running: RunningRegion;
}) {
  const [t, tRegion, tSkill, tProf] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("homeRegions.running"),
    getTranslations("skillNames"),
    getTranslations("professions"),
  ]);
  const rl = await retryLabels();
  const fmtHours = (h: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const fmtPct = (share: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
  const skillName = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const professionName = (id: string) => (tProf.has(id) ? tProf(id) : id);
  const journalLink = (
    <Link href="/dashboard/journal" data-testid="today-work-open" className={`${buttonLinkClassName("secondary")} shrink-0`}>
      {t("stations.journal")}
    </Link>
  );

  if (running.kind === "unknown") {
    return (
      <Region id="running" index="03" title={tRegion("title")} state="unknown" aside={journalLink}>
        <Unreadable text={t("work.unknown")} testid="today-work-unknown" labels={rl} />
      </Region>
    );
  }

  const { work, projects, growth } = running;
  const growthShown = isTodayGrowthShown(growth);
  const growthText = (d: GrowthDirection): string => {
    switch (d.kind) {
      case "core_strength":
        return t("growth.core_strength", {
          skill: skillName(d.slug),
          hours: fmtHours(d.why.attributedHours),
          percent: fmtPct(d.why.share),
        });
      case "growing":
        return t("growth.growing", { skill: skillName(d.slug), hours: fmtHours(d.why.attributedHours) });
      case "underused":
        return t("growth.underused", { skill: skillName(d.slug), days: d.why.dormantDays });
      case "self_stated":
        return t("growth.self_stated", { skill: skillName(d.slug) });
      case "adjacent_opportunity":
        return t("growth.adjacent_opportunity", {
          profession: professionName(d.professionId),
          shared: d.why.sharedCount,
          total: d.why.sharedSkills.length + d.why.missingSkills.length,
        });
    }
  };

  return (
    <Region id="running" index="03" title={tRegion("title")} state="known" aside={journalLink}>
      {/* RECORDED WORK — the journal model's own period figures, drawn as
          figures and one recorded/confirmed bar; a failed journal read is
          named, never "0 h". */}
      <div data-testid="today-work" data-state={work.kind}>
        {work.kind === "known" ? (
          <div className="flex flex-col gap-3 sm:gap-4">
            <dl className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="rounded-control border border-ink-600/60 bg-ink-900/40 px-3 py-2.5 sm:px-4 sm:py-3" data-testid="today-work-today">
                <dt className={`${LABEL} truncate`}>{tRegion("today")}</dt>
                <dd className={`mt-1 text-title leading-none sm:text-title-lg ${NUMERAL}`}>{tRegion("hours", { hours: fmtHours(work.today.hours) })}</dd>
                <dd className="mt-1.5 text-meta text-text-muted">
                  {work.today.entries === 0 ? tRegion("noEntriesToday") : tRegion("entries", { n: work.today.entries })}
                </dd>
              </div>
              <div className="rounded-control border border-ink-600/60 bg-ink-900/40 px-3 py-2.5 sm:px-4 sm:py-3" data-testid="today-work-week">
                <dt className={`${LABEL} truncate`}>{tRegion("week")}</dt>
                <dd className={`mt-1 text-title leading-none sm:text-title-lg ${NUMERAL}`}>{tRegion("hours", { hours: fmtHours(work.week.hours) })}</dd>
                <dd className="mt-1.5 text-meta text-text-muted">{tRegion("entries", { n: work.week.entries })}</dd>
              </div>
            </dl>
            <ConfirmedBar
              recorded={work.week.hours}
              confirmed={work.week.confirmedHours}
              labels={{
                bar: tRegion("barLabel"),
                confirmed: (h) => tRegion("confirmed", { hours: fmtHours(h) }),
                none: tRegion("confirmedNone"),
              }}
            />
            {work.today.untimed > 0 ? (
              <p className="text-meta text-text-muted" data-testid="today-work-untimed">
                {t("work.untimed", { n: work.today.untimed })}
              </p>
            ) : null}
            {work.truncated ? (
              <p className="text-meta text-text-muted" data-testid="today-work-truncated">
                {t("work.truncated")}
              </p>
            ) : null}
          </div>
        ) : (
          <Unreadable text={t("work.unknown")} testid="today-work-unknown" labels={rl} />
        )}
      </div>

      {/* WHERE I WORK — the active assignments as tiles, one tap each to the
          SAME project page; a FAILED read is named, never "no projects". */}
      {projects === null ? (
        <div className="border-t border-ink-600/60 pt-4">
          <Unreadable text={tRegion("projectsUnknown")} testid="home-projects-unknown" labels={rl} />
        </div>
      ) : projects.length > 0 ? (
        <div className="border-t border-ink-600/60 pt-3 sm:pt-4">
          <p className={LABEL}>{t("projects.title")}</p>
          <ul data-testid="today-projects" className="mt-1 grid gap-0 sm:mt-2 sm:grid-cols-2 sm:gap-2">
            {projects.slice(0, HOME_PROJECTS_SHOWN).map((p) => (
              <li key={p.projectId}>
                <Link
                  href={`/dashboard/projects/${p.projectId}` as "/dashboard"}
                  data-testid={`today-project-${p.projectId}`}
                  className="group -mx-3 flex min-h-11 h-full items-center justify-between gap-3 rounded-control px-3 py-2 transition-colors sm:mx-0 sm:items-start sm:border sm:border-ink-600/60 sm:bg-ink-900/30 sm:px-3.5 sm:py-3 hover:border-ink-500 hover:bg-ink-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  <span className="flex min-w-0 items-baseline gap-2 sm:flex-col sm:gap-0">
                    <span className="truncate text-support font-medium text-text-primary sm:text-body">{p.title?.trim() || t("projects.untitled")}</span>
                    {p.city ? <span className="truncate text-meta text-text-muted">{p.city}</span> : null}
                  </span>
                  <span aria-hidden className={ARROW}>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {projects.length > HOME_PROJECTS_SHOWN ? (
            <Link href="/dashboard/projects" data-testid="today-projects-all" className={`${ROW_LINK} mt-1 text-support text-text-secondary`}>
              <span>{t("projects.all", { count: projects.length })}</span>
              <span aria-hidden className={ARROW}>
                →
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* ONE GROWTH SENTENCE — a reading of the person's own rows, said so.
          An EMPTY reading is left out; a FAILED read is still named. */}
      {growthShown && (
        <div className="flex flex-col gap-3 border-t border-ink-600/60 pt-4 sm:flex-row sm:items-center sm:justify-between" data-testid="today-growth" data-state={growth.kind}>
          <div className="min-w-0">
            <p className={LABEL}>{t("growth.title")}</p>
            {growth.kind === "direction" ? (
              <>
                <p className="mt-1 text-body text-text-primary" data-kind={growth.direction.kind}>
                  {growthText(growth.direction)}
                </p>
                <p className="text-meta text-text-muted">{t("growth.derived")}</p>
              </>
            ) : (
              <p className={`mt-1 ${NOTE}`}>{t("growth.unknown")}</p>
            )}
          </div>
          <Link href={stationHref("numbers")} data-testid="today-growth-open" className={SECONDARY}>
            {t("stations.numbers")}
          </Link>
        </div>
      )}
    </Region>
  );
}

/**
 * The last 7 days as one bar: all recorded hours, and — in green, the only
 * green on the home — the part a manager/client APPROVED. Recorded is the
 * person's own statement (neutral); confirmed is a second party's.
 */
function ConfirmedBar({
  recorded,
  confirmed,
  labels,
}: {
  readonly recorded: number;
  readonly confirmed: number | undefined;
  readonly labels: { readonly bar: string; readonly confirmed: (h: number) => string; readonly none: string };
}) {
  if (recorded <= 0) return null;
  const c = Math.max(0, Math.min(confirmed ?? 0, recorded));
  const share = c / recorded;
  // Nothing confirmed yet: a full neutral bar would read as "100 % of
  // something" — say it in one line instead.
  if (c === 0) {
    return (
      <p className="text-meta text-text-muted" data-testid="home-work-bar" data-confirmed-share="0.00">
        {labels.none}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="home-work-bar" data-confirmed-share={share.toFixed(2)}>
      <div
        role="img"
        aria-label={`${labels.bar}: ${labels.confirmed(c)}`}
        className="h-2 w-full overflow-hidden rounded-full bg-ink-600/70"
      >
        <div className="h-full rounded-full bg-text-muted/70" style={{ width: "100%" }}>
          <div className="h-full rounded-full bg-state-success" style={{ width: `${Math.max(share * 100, 3)}%` }} />
        </div>
      </div>
      <p className="text-meta text-text-muted">{labels.confirmed(c)}</p>
    </div>
  );
}

// ───────────────────────── 03 · OUTSIDE (Tavo galimybės) ─────────────────────────

export async function HomeOutside() {
  return <HomeOutsideView outside={await loadHomeOutside()} />;
}

/** Fit bands as luminance steps — strongest brightest; never gold, never green. */
const BAND_TONE: Record<string, string> = {
  strong: "bg-text-primary",
  possible: "bg-text-secondary/70",
  missing_requirement: "bg-text-muted/60",
  conflict: "bg-state-warning/60",
  not_assessed: "bg-ink-500",
};

export async function HomeOutsideView({ outside }: { readonly outside: OutsideRegion }) {
  const [t, tResults, tRegion] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("conversation.results"),
    getTranslations("homeRegions.outside"),
  ]);
  const rl = await retryLabels();

  // A FAILED read is the region's "unknown" state — named, not dropped.
  const o = outside.kind === "unknown" ? ({ kind: "unknown" } as const) : outside.opportunity;
  // none / no-worker are EMPTY answers: left out, not stated.
  if (!isTodayOpportunityShown(o)) return null;

  const openLink = (
    <Link href="/dashboard/opportunities" data-testid="today-opportunity-open" className={`${buttonLinkClassName("secondary")} shrink-0`}>
      {t("opportunity.open")}
    </Link>
  );

  let body: ReactNode;
  switch (o.kind) {
    case "bands": {
      const bands = FIT_BAND_ORDER.filter((band) => o.counts[band] > 0);
      const total = bands.reduce((s, b) => s + o.counts[b], 0);
      const parts = bands.map((band) => t(`opportunity.band.${band}`, { n: o.counts[band] }));
      if (o.more > 0) parts.push(t("opportunity.more", { n: o.more }));
      body = (
        <div className="flex flex-col gap-3">
          {o.discoveryOnly ? <p className={LABEL}>{tResults("opportunities.titleDiscovery")}</p> : null}
          {total > 0 ? (
            <div role="img" aria-label={`${tRegion("barLabel")}: ${parts.join(", ")}`} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" data-testid="home-opportunity-bar">
              {bands.map((band) => (
                <span key={band} className={cn("h-full first:rounded-l-full last:rounded-r-full", BAND_TONE[band] ?? "bg-ink-500")} style={{ flexGrow: o.counts[band] }} />
              ))}
            </div>
          ) : null}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 sm:flex-col sm:gap-1.5" data-testid="today-opportunity-line">
            {bands.map((band) => (
              <li key={band} className="flex items-center gap-2 text-support text-text-primary sm:gap-2.5 sm:text-body">
                <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", BAND_TONE[band] ?? "bg-ink-500")} />
                {t(`opportunity.band.${band}`, { n: o.counts[band] })}
              </li>
            ))}
            {o.more > 0 ? <li className="text-support text-text-muted sm:pl-5">{t("opportunity.more", { n: o.more })}</li> : null}
          </ul>
        </div>
      );
      break;
    }
    case "unavailable":
      body = (
        <p className="text-body text-text-primary" data-testid="today-opportunity-line">
          {t("opportunity.unavailable")}
        </p>
      );
      break;
    case "unknown":
      body = (
        <div data-testid="today-opportunity-line">
          <Unreadable text={t("opportunity.unknown")} testid="home-opportunity-unknown" labels={rl} />
        </div>
      );
      break;
  }

  return (
    <Region
      id="outside"
      index="04"
      title={tRegion("title")}
      state={o.kind}
      testId="today-opportunity"
      aside={openLink}
      extra={{ "data-discovery-only": o.kind === "bands" && o.discoveryOnly ? "true" : undefined }}
    >
      {body}
    </Region>
  );
}

// ───────────────────────── 04 · BECAUSE (Naujausi įvykiai) ─────────────────────────

/** On the home the causal chains live in the consequence trace ("Kas
 *  pasikeitė", `home-trace.tsx`); this region then keeps only the PLAIN
 *  events (messages, alerts, decisions without a stated consequence), so no
 *  fact is drawn twice. */
export async function HomeBecause({ locale, plainOnly = false }: { readonly locale: ActiveLocale; readonly plainOnly?: boolean }) {
  return <HomeBecauseView locale={locale} because={await loadHomeBecause()} plainOnly={plainOnly} />;
}

export async function HomeBecauseView({
  locale,
  because,
  plainOnly = false,
}: {
  readonly locale: ActiveLocale;
  readonly because: BecauseRegion;
  /** The trace draws the causal chains — list only the plain events. */
  readonly plainOnly?: boolean;
}) {
  const [tRegion, tChain, tTypes] = await Promise.all([
    getTranslations("homeRegions.because"),
    getTranslations("homeRegions.chain"),
    getTranslations("auth.notifications.types"),
  ]);
  const rl = await retryLabels();
  const allLink = (
    <Link href="/dashboard/activity" data-testid="home-because-all" className="inline-flex min-h-11 items-center text-support text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
      {tRegion("all")}
    </Link>
  );

  if (because.kind === "unknown") {
    return (
      <Region id="because" index="05" title={tRegion("title")} state="unknown" aside={allLink}>
        <Unreadable text={tRegion("unknown")} testid="home-because-unknown" labels={rl} />
      </Region>
    );
  }
  // Nothing happened that the feed carries → the region is left out.
  if ((plainOnly || because.causes.length === 0) && because.events.length === 0) return null;

  // The SAME label the bell and the activity page use — never a second wording.
  const label = (c: HomeChange) => (tTypes.has(c.renderedType) ? tTypes(c.renderedType) : tTypes("generic"));
  const when = (c: HomeChange) => formatUtcDate(c.occurredAt.slice(0, 10), locale) ?? "—";
  const causes = plainOnly ? [] : because.causes.slice(0, HOME_EVENTS_SHOWN);
  const events = because.events.slice(0, Math.max(0, HOME_EVENTS_SHOWN - causes.length));

  return (
    <Region id="because" index="05" title={tRegion("title")} state="known" aside={allLink}>
      <ol className="relative flex flex-col gap-1 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-ink-600" data-testid="home-causes">
        {causes.map((c, i) => (
          <li key={c.id} className={cn("relative pl-6", i >= HOME_EVENTS_SHOWN_PHONE && "max-sm:hidden")}>
            <span aria-hidden className="absolute left-0 top-3.5 h-[11px] w-[11px] rounded-full border-2 border-ink-800 bg-text-secondary" />
            <Link href={c.href as "/dashboard"} data-testid={`home-cause-${c.eventType}`} className={`${ROW_LINK} items-start`}>
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="font-medium">{label(c)}</span>
                {/* EVENT → CONSEQUENCE → STATE — drawn only because the
                    event's own fact IS this state change. */}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-support text-text-secondary">
                  <span data-testid="home-cause-consequence">{tChain(`consequence.${c.chain.consequenceKey}`)}</span>
                  <span aria-hidden className="text-text-muted">
                    →
                  </span>
                  <StatusChip variant="neutral" testid="home-cause-state">
                    {tChain(`state.${c.chain.stateKey}`)}
                  </StatusChip>
                </span>
              </span>
              <span className="shrink-0 pt-0.5 font-mono text-meta tabular-nums text-text-muted">{when(c)}</span>
            </Link>
          </li>
        ))}
        {events.map((c, i) => (
          <li key={c.id} className={cn("relative pl-6", causes.length + i >= HOME_EVENTS_SHOWN_PHONE && "max-sm:hidden")} data-testid="home-events">
            <Link href={c.href as "/dashboard"} className={`${ROW_LINK} text-support`}>
              <span className="flex min-w-0 items-center gap-2">
                {/* A journal entry someone else confirmed: the grammar's
                    solid mark (a second party stands behind it). */}
                {c.renderedType === "event_journal_review_decided_approved" ? <LevelMark level="confirmed" /> : null}
                {label(c)}
              </span>
              <span className="shrink-0 font-mono text-meta tabular-nums text-text-muted">{when(c)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Region>
  );
}

// ───────────────────────── AVAILABILITY (partial vs total) ─────────────────────────

/**
 * One line ABOVE the regions that tells partial from total unavailability:
 * every reader failed → "we could not read your data right now" with one
 * retry; some failed → "part of your data is temporarily unavailable (n of 4)".
 * All readers answered → nothing. Uses the SAME request-cached loaders the
 * regions stream, so it adds no reads.
 */
export async function HomeAvailability() {
  const [waiting, running, because, outside] = await Promise.all([
    loadHomeWaiting(),
    loadHomeRunning(),
    loadHomeBecause(),
    loadHomeOutside(),
  ]);
  return (
    <HomeAvailabilityView
      unknown={[waiting.region.kind, running.kind, because.kind, outside.kind].filter((k) => k === "unknown").length}
    />
  );
}

export async function HomeAvailabilityView({ unknown }: { readonly unknown: number }) {
  if (unknown === 0) return null;
  const t = await getTranslations("homeRegions");
  const total = unknown >= 4;
  return (
    <div
      role="status"
      data-testid="home-availability"
      data-availability={total ? "none" : "partial"}
      className={cn(
        "flex flex-col gap-3 rounded-card border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        total ? "border-state-warning/40 bg-state-warning/5" : "border-ink-600/70 bg-ink-800/40",
      )}
    >
      <div className="min-w-0">
        <p className="text-body font-semibold text-text-primary">
          {total ? t("availability.totalTitle") : t("availability.partial", { count: unknown })}
        </p>
        {total ? <p className={`mt-0.5 ${NOTE}`}>{t("availability.totalBody")}</p> : null}
      </div>
      <HomeRetry label={t("retry")} pendingLabel={t("retrying")} testid="home-availability-retry" prominent />
    </div>
  );
}
