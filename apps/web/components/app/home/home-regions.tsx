import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarCheck,
  Check,
  Compass,
  FileCheck2,
  Handshake,
  Inbox,
  MessageSquare,
  NotebookPen,
  Sparkles,
} from "lucide-react";

import { ProjectMark, ServiceMark } from "@/components/app/identity/identity-family";
import { Eyebrow, RegionHead, Surface } from "@/components/app/system/ui";
import { buttonLinkClassName } from "@/components/ui/Button";
import {
  loadHomeBecause,
  loadHomeOutside,
  loadHomeRunning,
  loadHomeWaiting,
} from "@/lib/home/home-server";
import type {
  BecauseRegion,
  HomeCause,
  HomeChange,
  HomeSubjectKind,
  OutsideRegion,
  RunningRegion,
  WaitingRegion,
} from "@/lib/home/home-state";
import type { TodayDoorKind } from "@/lib/today/today-model";
import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import type { GrowthDirection } from "@/lib/journal/growth-reading";
import { FIT_BAND_ORDER } from "@/lib/opportunities/fit-band";
import { formatUtcDate } from "@/lib/time/display";
import { isTodayGrowthShown, isTodayOpportunityShown, type TodayOpenItem } from "@/lib/today/today-model";
import { TODAY_STATIONS, type TodayStationId } from "@/lib/today/today-route";
import { cn } from "@/lib/utils";

/**
 * THE FOUR REGIONS of the one authenticated home, in the frozen product
 * grammar (design class 4e695e261): region head (eyebrow → headline with one
 * accent word → sub), a translucent surface, rows of mark · statement ·
 * direct action. They render INSIDE the conversation's opening slot (owner
 * decision 0017) — the composer stays directly under them.
 *
 * Each region is its own async server component with its own loader
 * (`lib/home/home-server.ts`), so each streams independently. What each
 * region may say is decided by the pure model (`lib/home/home-state.ts`):
 *
 *   - a reader that FAILED is named ("could not be read"), never an empty
 *     list and never a zero (SEP-7);
 *   - an EMPTY real answer is calm and said once (waiting) or left out
 *     entirely ("Tuščia = tvarkinga": growth, opportunity, because);
 *   - a causal chain is drawn only for the closed set of events whose own
 *     fact is a state change.
 *
 * Every direct action the old ŠIANDIEN carried is kept, with its test id.
 */

const stationHref = (id: TodayStationId): string => TODAY_STATIONS.find((s) => s.id === id)!.href;

const ROW = "grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 border-t border-text-primary/10 px-5 py-4 first:border-t-0 md:grid-cols-[auto_1fr_auto] md:px-6";
const ROW_LINK = `${ROW} min-h-11 transition-colors hover:bg-text-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue`;
const FIGURE = "text-support text-text-secondary";
const NOTE = "px-5 py-4 text-support text-text-secondary md:px-6";

const SUBJECT_ICON: Readonly<Record<HomeSubjectKind, ReactNode>> = {
  person: <Handshake className="h-[46%] w-[46%]" aria-hidden />,
  company: <BriefcaseBusiness className="h-[46%] w-[46%]" aria-hidden />,
  team: <Handshake className="h-[46%] w-[46%]" aria-hidden />,
  project: <BriefcaseBusiness className="h-[46%] w-[46%]" aria-hidden />,
  need: <Compass className="h-[46%] w-[46%]" aria-hidden />,
  offer: <Sparkles className="h-[46%] w-[46%]" aria-hidden />,
  service: <Sparkles className="h-[46%] w-[46%]" aria-hidden />,
  conversation: <MessageSquare className="h-[46%] w-[46%]" aria-hidden />,
  booking: <CalendarCheck className="h-[46%] w-[46%]" aria-hidden />,
  invitation: <Inbox className="h-[46%] w-[46%]" aria-hidden />,
  document: <FileCheck2 className="h-[46%] w-[46%]" aria-hidden />,
  work: <NotebookPen className="h-[46%] w-[46%]" aria-hidden />,
  relationship: <Handshake className="h-[46%] w-[46%]" aria-hidden />,
};

/** A decorative kind mark — the row's text names the thing, the mark only
 *  gives it the family silhouette. */
function KindMark({ id, kind, size = 44 }: { readonly id: string; readonly kind: HomeSubjectKind; readonly size?: number }) {
  return <ServiceMark id={`${kind}:${id}`} size={size} icon={SUBJECT_ICON[kind]} label="" />;
}

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
  eyebrow,
  title,
  state,
  children,
}: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly state: "known" | "unknown";
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={eyebrow} data-testid={`home-${id}`} data-region={id} data-state={state}>
      <RegionHead eyebrow={eyebrow} title={title} className="[&_h2]:text-[clamp(1.35rem,2.2vw,1.8rem)]" />
      <Surface className="mt-4 overflow-hidden">{children}</Surface>
    </section>
  );
}

// ───────────────────────── 01 · WAITING FOR YOU ─────────────────────────

/** Loader wrapper — the view below is data-driven so every state can be
 *  proven without a database (see the design-proof home screen). */
export async function HomeWaiting({ locale }: { readonly locale: ActiveLocale }) {
  const { region, unknownDoors } = await loadHomeWaiting();
  return <HomeWaitingView locale={locale} region={region} unknownDoors={unknownDoors} />;
}

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
    getTranslations("homeStage.regions.waiting"),
    getTranslations("auth.dashboard.workCard"),
    getTranslations("journal.intelligence"),
    getTranslations("productivityUnits"),
  ]);
  const fmtHours = (h: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const unitName = (slug: string) => (tUnits.has(slug) ? tUnits(slug) : slug);

  const openItemHref = (item: TodayOpenItem): string => ("href" in item ? item.href : "/dashboard/journal");
  const openItemKind = (item: TodayOpenItem) => (item.kind === "offers" ? "booking" : item.kind === "invitations" ? "invitation" : item.kind === "unread" ? "conversation" : "work") as HomeSubjectKind;
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
      <Region id="waiting" eyebrow={tRegion("eyebrow")} title={tRegion("title")} state="unknown">
        <p className={NOTE} data-testid="today-next-unknown" role="status">
          {tRegion("unknown")}
        </p>
      </Region>
    );
  }

  const next = region.items.find((i) => i.kind === "next");
  const open = region.items.filter((i): i is Extract<typeof i, { kind: "open" }> => i.kind === "open");

  return (
    <Region id="waiting" eyebrow={tRegion("eyebrow")} title={tRegion("title")} state="known">
      {next ? (
        <div className={ROW} data-testid="today-next">
          <KindMark id="next" kind="person" />
          <div className="min-w-0">
            <p className="font-display text-body font-semibold leading-tight tracking-tightest text-text-primary">
              {tCard(`next.${next.next.dim}`)}
            </p>
            <p className={`mt-1 ${FIGURE}`}>{tCard(next.next.whyKey)}</p>
            {next.next.stale ? (
              <p className={`mt-1 ${FIGURE}`} data-testid="today-next-stale">
                {tCard("stale.body")}
              </p>
            ) : null}
          </div>
          <Link
            href={next.next.href as "/dashboard"}
            data-testid="today-next-cta"
            className={`${buttonLinkClassName("primary")} max-md:col-span-2 max-md:w-full`}
          >
            {tCard(`next.${next.next.dim}`)} <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : null}

      {open.length > 0 ? (
        <ul data-testid="today-open" data-attention-unknown={unknownDoors.length > 0 ? unknownDoors.join(" ") : undefined}>
          {open.map(({ item }, i) => (
            <li key={item.kind === "check" ? item.check.key : `${item.kind}-${i}`}>
              <Link href={openItemHref(item) as "/dashboard"} data-testid={`today-open-${item.kind}`} className={ROW_LINK}>
                <KindMark id={item.kind} kind={openItemKind(item)} />
                <span className="min-w-0 text-body text-text-primary">{openItemText(item)}</span>
                <ArrowRight className="h-4 w-4 text-text-muted max-md:hidden" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {unknownDoors.length > 0 ? (
        <p className={NOTE} data-testid="today-open-unknown" role="status">
          {t("open.unknown")}
        </p>
      ) : null}

      {region.nextUnknown ? (
        <p className={NOTE} data-testid="today-next-unknown" role="status">
          {t("next.unknown")}
        </p>
      ) : null}

      {!next && open.length === 0 && unknownDoors.length === 0 && !region.nextUnknown ? (
        <p className={cn(NOTE, "flex items-center gap-3")} data-testid="home-waiting-clear">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(52,211,153,0.16)] text-[rgb(110,231,183)]">
            <Check className="h-4 w-4" aria-hidden />
          </span>
          {tRegion("clear")}
        </p>
      ) : null}
    </Region>
  );
}

// ───────────────────────── 02 · RUNNING NOW ─────────────────────────

export async function HomeRunning({ locale }: { readonly locale: ActiveLocale }) {
  return <HomeRunningView locale={locale} running={await loadHomeRunning()} />;
}

export async function HomeRunningView({ locale, running }: { readonly locale: ActiveLocale; readonly running: RunningRegion }) {
  const [t, tRegion, tSkill, tProf] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("homeStage.regions.running"),
    getTranslations("skillNames"),
    getTranslations("professions"),
  ]);
  const fmtHours = (h: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(h);
  const fmtPct = (share: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
  const skillName = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const professionName = (id: string) => (tProf.has(id) ? tProf(id) : id);

  if (running.kind === "unknown") {
    return (
      <Region id="running" eyebrow={tRegion("eyebrow")} title={tRegion("title")} state="unknown">
        <p className={NOTE} data-testid="today-work-unknown" role="status">
          {t("work.unknown")}
        </p>
      </Region>
    );
  }

  const { work, projects, growth } = running;
  const growthShown = isTodayGrowthShown(growth);
  const growthText = (d: GrowthDirection): string => {
    switch (d.kind) {
      case "core_strength":
        return t("growth.core_strength", { skill: skillName(d.slug), hours: fmtHours(d.why.attributedHours), percent: fmtPct(d.why.share) });
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
    <Region id="running" eyebrow={tRegion("eyebrow")} title={tRegion("title")} state="known">
      {/* RECORDED WORK — the journal model's own period figures. */}
      <div className={ROW} data-testid="today-work" data-state={work.kind}>
        <KindMark id="work" kind="work" />
        <div className="min-w-0">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("work.title")}</p>
          {work.kind === "known" ? (
            <>
              <p className="mt-1 text-body text-text-primary" data-testid="today-work-today">
                {work.today.entries === 0 ? t("work.none") : t("work.today", { hours: fmtHours(work.today.hours), entries: work.today.entries })}
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
        <Link href="/dashboard/journal" data-testid="today-work-open" className={`${buttonLinkClassName("secondary")} max-md:col-span-2 max-md:w-full`}>
          {t("stations.journal")} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {/* ASSIGNED PROJECTS — one tap each to the canonical project page. */}
      {projects === null ? (
        <p className={NOTE} role="status" data-testid="home-projects-unknown">
          {tRegion("projectsUnknown")}
        </p>
      ) : projects.length > 0 ? (
        <ul data-testid="today-projects">
          {projects.slice(0, 3).map((p) => (
            <li key={p.projectId}>
              <Link href={`/dashboard/projects/${p.projectId}` as "/dashboard"} data-testid={`today-project-${p.projectId}`} className={ROW_LINK}>
                <ProjectMark project={{ id: p.projectId, name: p.title?.trim() || t("projects.untitled") }} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-text-primary">{p.title?.trim() || t("projects.untitled")}</span>
                  {p.city ? <span className={`block truncate ${FIGURE}`}>{p.city}</span> : null}
                </span>
                <ArrowRight className="h-4 w-4 text-text-muted max-md:hidden" aria-hidden />
              </Link>
            </li>
          ))}
          {projects.length > 3 ? (
            <li>
              <Link href="/dashboard/projects" data-testid="today-projects-all" className={`${ROW_LINK} text-support text-text-secondary`}>
                <span />
                <span>{t("projects.all", { count: projects.length })}</span>
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* ONE GROWTH SENTENCE — a reading of the person's own rows, said so.
          An EMPTY reading is left out ("Tuščia = tvarkinga"); a FAILED read
          is still named (`isTodayGrowthShown`). */}
      {growthShown && (
        <div className={ROW} data-testid="today-growth" data-state={growth.kind}>
          <KindMark id="growth" kind="person" />
          <div className="min-w-0">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("growth.title")}</p>
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
          <Link href={stationHref("numbers")} data-testid="today-growth-open" className={`${buttonLinkClassName("secondary")} max-md:col-span-2 max-md:w-full`}>
            {t("stations.numbers")} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </Region>
  );
}

// ───────────────────────── 03 · BECAUSE OF WHAT HAPPENED ─────────────────────────

export async function HomeBecause({ locale }: { readonly locale: ActiveLocale }) {
  return <HomeBecauseView locale={locale} because={await loadHomeBecause()} />;
}

export async function HomeBecauseView({ locale, because }: { readonly locale: ActiveLocale; readonly because: BecauseRegion }) {
  const [tRegion, tChain, tTypes] = await Promise.all([
    getTranslations("homeStage.regions.because"),
    getTranslations("homeStage.chain"),
    getTranslations("auth.notifications.types"),
  ]);

  if (because.kind === "unknown") {
    return (
      <Region id="because" eyebrow={tRegion("eyebrow")} title={tRegion("title")} state="unknown">
        <p className={NOTE} role="status" data-testid="home-because-unknown">
          {tRegion("unknown")}
        </p>
      </Region>
    );
  }
  // Nothing happened that the feed carries → the region is left out.
  if (because.causes.length === 0 && because.events.length === 0) return null;

  const label = (c: HomeChange) => (tTypes.has(c.renderedType) ? tTypes(c.renderedType) : tTypes("generic"));
  const when = (c: HomeChange) => formatUtcDate(c.occurredAt.slice(0, 10), locale);

  return (
    <Region id="because" eyebrow={tRegion("eyebrow")} title={tRegion("title")} state="known">
      {because.causes.length > 0 ? (
        <ol data-testid="home-causes">
          {because.causes.map((c: HomeCause) => (
            <li key={c.id}>
              <Link href={c.href as "/dashboard"} data-testid={`home-cause-${c.eventType}`} className={ROW_LINK}>
                <KindMark id={c.id} kind={c.subject.kind} />
                <span className="min-w-0">
                  <span className="block text-body font-medium text-text-primary">{label(c)}</span>
                  {/* EVENT → CONSEQUENCE → PRODUCT STATE — drawn only because the
                      event's own fact IS this state change. */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-support text-text-secondary">
                    <span data-testid="home-cause-consequence">{tChain(`consequence.${c.chain.consequenceKey}`)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                    <span data-testid="home-cause-state" className="rounded-full bg-[rgba(245,241,232,0.09)] px-2.5 py-0.5 text-meta text-text-primary">
                      {tChain(`state.${c.chain.stateKey}`)}
                    </span>
                  </span>
                </span>
                <span className="text-meta text-text-muted max-md:col-span-2">{when(c)}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}

      {because.events.length > 0 ? (
        <div className="border-t border-text-primary/10 px-5 py-4 first:border-t-0 md:px-6" data-testid="home-events">
          <Eyebrow>{tRegion("also")}</Eyebrow>
          <ul className="mt-2 flex flex-col">
            {because.events.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4">
                <Link href={c.href as "/dashboard"} className="inline-flex min-h-11 items-center text-support text-text-primary underline-offset-4 hover:text-brand-blue hover:underline">
                  {label(c)}
                </Link>
                <span className="shrink-0 text-meta text-text-muted">{when(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link href="/dashboard/activity" data-testid="home-because-all" className={`${ROW_LINK} text-support text-text-secondary`}>
        <span />
        <span>{tRegion("all")}</span>
        <ArrowRight className="h-4 w-4 text-text-muted max-md:hidden" aria-hidden />
      </Link>
    </Region>
  );
}

// ───────────────────────── 04 · OUTSIDE YOUR WALLS ─────────────────────────

export async function HomeOutside() {
  return <HomeOutsideView outside={await loadHomeOutside()} />;
}

export async function HomeOutsideView({ outside }: { readonly outside: OutsideRegion }) {
  const [t, tResults, tRegion] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("conversation.results"),
    getTranslations("homeStage.regions.outside"),
  ]);

  if (outside.kind === "unknown") {
    return (
      <Region id="outside" eyebrow={tRegion("eyebrow")} title={tRegion("title")} state="unknown">
        <p className={NOTE} role="status" data-testid="today-opportunity-unknown">
          {t("opportunity.unknown")}
        </p>
      </Region>
    );
  }
  const o = outside.opportunity;
  // none / no-worker are EMPTY answers: left out, not stated.
  if (!isTodayOpportunityShown(o)) return null;

  let line: string;
  switch (o.kind) {
    case "bands": {
      const parts = FIT_BAND_ORDER.filter((band) => o.counts[band] > 0).map((band) => t(`opportunity.band.${band}`, { n: o.counts[band] }));
      if (o.more > 0) parts.push(t("opportunity.more", { n: o.more }));
      line = parts.join(" · ");
      break;
    }
    case "unavailable":
      line = t("opportunity.unavailable");
      break;
    default:
      line = t("opportunity.unknown");
  }

  return (
    <section
      aria-label={tRegion("eyebrow")}
      data-testid="today-opportunity"
      data-region="outside"
      data-state={o.kind}
      data-discovery-only={o.kind === "bands" && o.discoveryOnly ? "true" : undefined}
    >
      <RegionHead eyebrow={tRegion("eyebrow")} title={tRegion("title")} className="[&_h2]:text-[clamp(1.35rem,2.2vw,1.8rem)]" />
      <Surface className="mt-4 overflow-hidden">
        <Link href="/dashboard/opportunities" data-testid="today-opportunity-open" className={ROW_LINK}>
          <KindMark id="market" kind="need" />
          <span className="min-w-0">
            {o.kind === "bands" && o.discoveryOnly ? (
              <span className="block font-mono text-meta uppercase tracking-label text-text-muted">{tResults("opportunities.titleDiscovery")}</span>
            ) : null}
            <span className="block text-body text-text-primary" data-testid="today-opportunity-line">
              {line}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-support font-medium text-brand-blue max-md:col-span-2">
            {t("opportunity.open")} <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      </Surface>
    </section>
  );
}
