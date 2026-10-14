import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { LevelMark, RegionHead } from "@/components/app/premium/grammar";
import { StatusChip } from "@/components/app/status-chip";
import { Card } from "@/components/ui/Card";
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

/**
 * THE FOUR REGIONS of the worker's home — the owner-frozen design class
 * (4e695e261, branch feat/cc/visual-language-proof, commits 6207e9642 +
 * 487d3b5b9) re-ported onto main's own readers and primitives:
 *
 *   01 Laukia jūsų        WAITING  — the ONE next action + what waits on the
 *                                    person (offers, invitations, unread,
 *                                    journal items)
 *   02 Vyksta dabar       RUNNING  — recorded work, assigned projects, one
 *                                    growth sentence
 *   03 Dėl to, kas įvyko  BECAUSE  — what happened; event → consequence →
 *                                    state ONLY for the closed causal set
 *   04 Už jūsų sienų      OUTSIDE  — the market, one opportunity sentence
 *
 * They render INSIDE the conversation's opening slot (owner decision 0017) —
 * the composer stays directly under them. Each region is its own async
 * server component with its own loader (`lib/home/home-server.ts`), so each
 * streams independently; what each may say is decided by the pure model
 * (`lib/home/home-state.ts`).
 *
 * RESTRAINT (owner directions after the freeze, 2026-10-09/10): no coloured
 * accent words (titles go through `RegionHead` → `Accented`, plain text), ONE
 * gold action on the whole screen (`today-next-cta`), structure over colour,
 * sentence case — the only mono line is the region NUMBER. A state is a word
 * in a shape (`StatusChip`, neutral); green is never used here, because
 * nothing on this screen is a second party's confirmation drawn by us — a
 * confirmed journal entry is marked by the grammar's solid `LevelMark`.
 *
 * HONESTY (SEP-7, product vocabulary): a reader that FAILED is named
 * ("could not be read"), never an empty list and never a zero; an EMPTY real
 * answer is calm and said once (waiting) or left out ("Tuščia = tvarkinga":
 * growth, opportunity, because).
 *
 * Every direct action and test id the old ŠIANDIEN sections carried is kept.
 */

const stationHref = (id: TodayStationId): string => TODAY_STATIONS.find((s) => s.id === id)!.href;

/** At most this many projects are named on the home; the rest are one link away. */
export const HOME_PROJECTS_SHOWN = 3;

/** One row of a region: statement first, its action after (beside it from
 *  md up, full width under it on a phone). */
const ROW =
  "flex flex-col gap-3 border-t border-ink-600/60 py-4 first:border-t-0 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-6";
/** A whole row that is one door — the 44 px floor is part of the constant. */
const ROW_LINK =
  "flex min-h-11 items-center justify-between gap-4 border-t border-ink-600/60 py-3 text-body text-text-primary underline-offset-4 first:border-t-0 first:pt-0 last:pb-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
const FIGURE = "text-support text-text-secondary";
const LABEL = "text-support font-medium text-text-muted";
const NOTE = "text-support text-text-secondary";
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
  return <Reading label={label} />;
}

function Region({
  id,
  index,
  title,
  state,
  testId,
  extra,
  children,
}: {
  readonly id: "waiting" | "running" | "because" | "outside";
  /** The region number — the one mono line (a number, not a label). */
  readonly index: string;
  readonly title: string;
  readonly state: string;
  readonly testId?: string;
  readonly extra?: Record<string, string | undefined>;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId ?? `home-${id}`}
      data-region={id}
      data-state={state}
      className="flex flex-col gap-3"
      {...extra}
    >
      <RegionHead eyebrow={index} title={title} className="[&_h2]:text-[clamp(1.25rem,2vw,1.6rem)]" />
      <Card compact>{children}</Card>
    </section>
  );
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
        <p className={NOTE} data-testid="today-next-unknown" role="status">
          {tRegion("unknown")}
        </p>
      </Region>
    );
  }

  const next = region.items.find((i) => i.kind === "next");
  const open = region.items.filter((i): i is Extract<typeof i, { kind: "open" }> => i.kind === "open");
  const openUnknown = region.openUnknown || unknownDoors.length > 0;

  return (
    <Region id="waiting" index="01" title={tRegion("title")} state="known">
      {next ? (
        <div className={ROW} data-testid="today-next">
          <div className="min-w-0">
            <p className="text-body font-semibold text-text-primary">{tCard(`next.${next.next.dim}`)}</p>
            <p className={`mt-1 ${FIGURE}`}>{tCard(next.next.whyKey)}</p>
            {next.next.stale ? (
              <p className={`mt-1 ${FIGURE}`} data-testid="today-next-stale">
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
        <p className={`${ROW} ${NOTE}`} data-testid="today-next-unknown" role="status">
          {t("next.unknown")}
        </p>
      ) : null}

      {open.length > 0 ? (
        <ul
          className="border-t border-ink-600/60 pt-1 first:border-t-0 first:pt-0"
          data-testid="today-open"
          data-attention-unknown={unknownDoors.length > 0 ? unknownDoors.join(" ") : undefined}
        >
          {open.map(({ item }, i) => (
            <li key={item.kind === "check" ? item.check.key : `${item.kind}-${i}`}>
              <Link href={openItemHref(item) as "/dashboard"} data-testid={`today-open-${item.kind}`} className={ROW_LINK}>
                <span className="min-w-0">{openItemText(item)}</span>
                <span aria-hidden className="shrink-0 text-text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {openUnknown ? (
        <p className={`${ROW} ${NOTE}`} data-testid="today-open-unknown" role="status">
          {t("open.unknown")}
        </p>
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
  const fmtHours = (h: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const fmtPct = (share: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
  const skillName = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const professionName = (id: string) => (tProf.has(id) ? tProf(id) : id);

  if (running.kind === "unknown") {
    return (
      <Region id="running" index="02" title={tRegion("title")} state="unknown">
        <p className={NOTE} data-testid="today-work-unknown" role="status">
          {t("work.unknown")}
        </p>
        <Link href="/dashboard/journal" data-testid="today-work-open" className={`${SECONDARY} mt-3`}>
          {t("stations.journal")}
        </Link>
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
    <Region id="running" index="02" title={tRegion("title")} state="known">
      {/* RECORDED WORK — the journal model's own period figures; a failed
          journal read is named, never "0 h". */}
      <div className={ROW} data-testid="today-work" data-state={work.kind}>
        <div className="min-w-0">
          <p className={LABEL}>{t("work.title")}</p>
          {work.kind === "known" ? (
            <>
              <p className="mt-1 text-body text-text-primary" data-testid="today-work-today">
                {work.today.entries === 0
                  ? t("work.none")
                  : t("work.today", { hours: fmtHours(work.today.hours), entries: work.today.entries })}
              </p>
              {work.today.untimed > 0 ? (
                <p className={FIGURE} data-testid="today-work-untimed">
                  {t("work.untimed", { n: work.today.untimed })}
                </p>
              ) : null}
              <p className={FIGURE} data-testid="today-work-week">
                {t("work.week", { hours: fmtHours(work.week.hours), entries: work.week.entries })}
              </p>
              {work.truncated ? (
                <p className="text-meta text-text-muted" data-testid="today-work-truncated">
                  {t("work.truncated")}
                </p>
              ) : null}
            </>
          ) : (
            <p className={`mt-1 ${FIGURE}`} data-testid="today-work-unknown" role="status">
              {t("work.unknown")}
            </p>
          )}
        </div>
        <Link href="/dashboard/journal" data-testid="today-work-open" className={SECONDARY}>
          {t("stations.journal")}
        </Link>
      </div>

      {/* WHERE I WORK — the active assignments, one tap each to the SAME
          project page; a FAILED read is named, never "no projects". */}
      {projects === null ? (
        <p className={`${ROW} ${NOTE}`} role="status" data-testid="home-projects-unknown">
          {tRegion("projectsUnknown")}
        </p>
      ) : projects.length > 0 ? (
        <div className="border-t border-ink-600/60 pt-4 first:border-t-0 first:pt-0">
          <p className={LABEL}>{t("projects.title")}</p>
          <ul data-testid="today-projects" className="mt-1">
            {projects.slice(0, HOME_PROJECTS_SHOWN).map((p) => (
              <li key={p.projectId}>
                <Link
                  href={`/dashboard/projects/${p.projectId}` as "/dashboard"}
                  data-testid={`today-project-${p.projectId}`}
                  className={ROW_LINK}
                >
                  <span className="min-w-0 truncate">
                    {p.title?.trim() || t("projects.untitled")}
                    {p.city ? <span className={FIGURE}> · {p.city}</span> : null}
                  </span>
                  <span aria-hidden className="shrink-0 text-text-muted">
                    →
                  </span>
                </Link>
              </li>
            ))}
            {projects.length > HOME_PROJECTS_SHOWN ? (
              <li>
                <Link href="/dashboard/projects" data-testid="today-projects-all" className={`${ROW_LINK} ${FIGURE}`}>
                  <span>{t("projects.all", { count: projects.length })}</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* ONE GROWTH SENTENCE — a reading of the person's own rows, said so.
          An EMPTY reading is left out; a FAILED read is still named. */}
      {growthShown && (
        <div className={ROW} data-testid="today-growth" data-state={growth.kind}>
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
              <p className={`mt-1 ${FIGURE}`}>{t("growth.unknown")}</p>
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

// ───────────────────────── 03 · BECAUSE ─────────────────────────

export async function HomeBecause({ locale }: { readonly locale: ActiveLocale }) {
  return <HomeBecauseView locale={locale} because={await loadHomeBecause()} />;
}

export async function HomeBecauseView({
  locale,
  because,
}: {
  readonly locale: ActiveLocale;
  readonly because: BecauseRegion;
}) {
  const [tRegion, tChain, tTypes] = await Promise.all([
    getTranslations("homeRegions.because"),
    getTranslations("homeRegions.chain"),
    getTranslations("auth.notifications.types"),
  ]);

  if (because.kind === "unknown") {
    return (
      <Region id="because" index="03" title={tRegion("title")} state="unknown">
        <p className={NOTE} role="status" data-testid="home-because-unknown">
          {tRegion("unknown")}
        </p>
      </Region>
    );
  }
  // Nothing happened that the feed carries → the region is left out.
  if (because.causes.length === 0 && because.events.length === 0) return null;

  // The SAME label the bell and the activity page use — never a second wording.
  const label = (c: HomeChange) => (tTypes.has(c.renderedType) ? tTypes(c.renderedType) : tTypes("generic"));
  const when = (c: HomeChange) => formatUtcDate(c.occurredAt.slice(0, 10), locale) ?? "—";

  return (
    <Region id="because" index="03" title={tRegion("title")} state="known">
      {because.causes.length > 0 ? (
        <ol data-testid="home-causes">
          {because.causes.map((c) => (
            <li key={c.id}>
              <Link href={c.href as "/dashboard"} data-testid={`home-cause-${c.eventType}`} className={ROW_LINK}>
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-medium">{label(c)}</span>
                  {/* EVENT → CONSEQUENCE → STATE — drawn only because the
                      event's own fact IS this state change. The state is a
                      word in a shape, never a colour. */}
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
                <span className="shrink-0 text-meta text-text-muted">{when(c)}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}

      {because.events.length > 0 ? (
        <div className="border-t border-ink-600/60 pt-3 first:border-t-0 first:pt-0" data-testid="home-events">
          <p className={LABEL}>{tRegion("also")}</p>
          <ul className="mt-1 flex flex-col">
            {because.events.map((c) => (
              <li key={c.id}>
                <Link href={c.href as "/dashboard"} className={`${ROW_LINK} text-support`}>
                  <span className="flex min-w-0 items-center gap-2">
                    {/* A journal entry someone else confirmed: the grammar's
                        solid mark (a second party stands behind it). */}
                    {c.renderedType === "event_journal_review_decided_approved" ? (
                      <LevelMark level="confirmed" />
                    ) : null}
                    {label(c)}
                  </span>
                  <span className="shrink-0 text-meta text-text-muted">{when(c)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link href="/dashboard/activity" data-testid="home-because-all" className={`${ROW_LINK} ${FIGURE}`}>
        <span>{tRegion("all")}</span>
        <span aria-hidden className="shrink-0 text-text-muted">
          →
        </span>
      </Link>
    </Region>
  );
}

// ───────────────────────── 04 · OUTSIDE ─────────────────────────

export async function HomeOutside() {
  return <HomeOutsideView outside={await loadHomeOutside()} />;
}

export async function HomeOutsideView({ outside }: { readonly outside: OutsideRegion }) {
  const [t, tResults, tRegion] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("conversation.results"),
    getTranslations("homeRegions.outside"),
  ]);

  // A FAILED read is the region's "unknown" state — the line is named, not dropped.
  const o = outside.kind === "unknown" ? ({ kind: "unknown" } as const) : outside.opportunity;
  // none / no-worker are EMPTY answers: left out, not stated.
  if (!isTodayOpportunityShown(o)) return null;

  let line: string;
  switch (o.kind) {
    case "bands": {
      const parts = FIT_BAND_ORDER.filter((band) => o.counts[band] > 0).map((band) =>
        t(`opportunity.band.${band}`, { n: o.counts[band] }),
      );
      if (o.more > 0) parts.push(t("opportunity.more", { n: o.more }));
      line = parts.join(" · ");
      break;
    }
    case "unavailable":
      line = t("opportunity.unavailable");
      break;
    case "unknown":
      line = t("opportunity.unknown");
      break;
  }

  return (
    <Region
      id="outside"
      index="04"
      title={tRegion("title")}
      state={o.kind}
      testId="today-opportunity"
      extra={{ "data-discovery-only": o.kind === "bands" && o.discoveryOnly ? "true" : undefined }}
    >
      <div className={ROW}>
        <div className="min-w-0">
          {o.kind === "bands" && o.discoveryOnly ? (
            <p className={LABEL}>{tResults("opportunities.titleDiscovery")}</p>
          ) : null}
          <p className="text-body text-text-primary" data-testid="today-opportunity-line">
            {line}
          </p>
        </div>
        <Link href="/dashboard/opportunities" data-testid="today-opportunity-open" className={SECONDARY}>
          {t("opportunity.open")}
        </Link>
      </div>
    </Region>
  );
}
