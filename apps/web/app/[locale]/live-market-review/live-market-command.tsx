"use client";

import {
  type CSSProperties,
  type ComponentType,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  Factory,
  HardHat,
  HeartPulse,
  Menu,
  MonitorCog,
  NotebookPen,
  Search,
  Sparkles,
  Sprout,
  Truck,
  UsersRound,
  Utensils,
  Warehouse,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import {
  LANDING_EVENTS,
  landingEventMetadata,
  persistLandingMode,
  type LandingAudience,
  type LandingEventName,
  type LandingMode,
} from "@/lib/telemetry/landing-experience";
import { recordEvent } from "@/lib/telemetry/task";
import styles from "./live-market-command.module.css";

type PublicJob = { readonly id: string; readonly title: string };

type PublicProfession = {
  readonly slug: string;
  readonly label: string;
  readonly totalCount: number | null;
  readonly jobs: readonly PublicJob[];
  readonly basis: "live" | "unavailable";
};

type PublicMarket = {
  readonly activeVacancies: number | null;
  readonly distinctEmployers: number | null;
  readonly lastRefreshedAt: string | null;
  readonly basis: "live" | "unavailable";
  readonly professions: readonly PublicProfession[];
};

type SectorKey =
  | "construction"
  | "logistics"
  | "care"
  | "hospitality"
  | "manufacturing"
  | "technology"
  | "agriculture"
  | "warehousing"
  | "services"
  | "energy";

type EventStep = {
  readonly title: string;
  readonly body: string;
};

type LabelSet = {
  readonly brand: string;
  readonly tagline: string;
  readonly headline: string;
  readonly headlineAccent: string;
  readonly support: string;
  readonly evidence: string;
  readonly workerCta: string;
  readonly employerCta: string;
  readonly workerLead: string;
  readonly employerLead: string;
  readonly workerAction: string;
  readonly employerAction: string;
  readonly workers: string;
  readonly companies: string;
  readonly jobs: string;
  readonly how: string;
  readonly login: string;
  readonly menuOpen: string;
  readonly menuClose: string;
  readonly live: string;
  readonly currentSupply: string;
  readonly verifiedMarketData: string;
  readonly dataSourceLabel: string;
  readonly dataSourceGeneric: string;
  readonly visualNote: string;
  readonly vacancies: string;
  readonly employers: string;
  readonly professionsTitle: string;
  readonly opportunityStream: string;
  readonly sectorTitle: string;
  readonly sectors: Readonly<Record<SectorKey, string>>;
  readonly eventSteps: readonly EventStep[];
};

export type LiveMarketCommandLabels = LabelSet;

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const SECTORS: Readonly<
  Record<SectorKey, { readonly profession: string; readonly icon: IconType }>
> = {
  construction: { profession: "electrician", icon: HardHat },
  logistics: { profession: "driver", icon: Truck },
  care: { profession: "caregiver", icon: HeartPulse },
  hospitality: { profession: "cook", icon: Utensils },
  manufacturing: { profession: "production_worker", icon: Factory },
  technology: { profession: "software_developer", icon: MonitorCog },
  agriculture: { profession: "farm_worker", icon: Sprout },
  warehousing: { profession: "warehouse_worker", icon: Warehouse },
  services: { profession: "cleaner", icon: Wrench },
  energy: { profession: "electrician", icon: Wind },
};

const SECTOR_ORDER: readonly SectorKey[] = [
  "construction",
  "manufacturing",
  "logistics",
  "care",
  "hospitality",
  "technology",
  "agriculture",
  "warehousing",
  "services",
  "energy",
];

type ActivityNode = {
  readonly id: string;
  readonly sector: SectorKey;
  readonly x: number;
  readonly y: number;
  readonly tabletX: number;
  readonly tabletY: number;
  readonly mobileX: number;
  readonly mobileY: number;
  readonly mobile: boolean;
};

/**
 * Conceptual sector activity over the cinematic Europe world.
 *
 * These positions are composition coordinates, not geographic coordinates
 * and never carry place names or local market claims. Verified geography and
 * counts remain confined to the Sweden supply panel.
 */
const ACTIVITY_NODES: readonly ActivityNode[] = [
  {
    id: "activity-logistics-01",
    sector: "logistics",
    x: 34,
    y: 16,
    tabletX: 8.5,
    tabletY: 15.5,
    mobileX: 4,
    mobileY: 16,
    mobile: true,
  },
  {
    id: "activity-construction-01",
    sector: "construction",
    x: 46,
    y: 18,
    tabletX: 38,
    tabletY: 18.5,
    mobileX: 37,
    mobileY: 18.5,
    mobile: true,
  },
  {
    id: "activity-care-01",
    sector: "care",
    x: 63,
    y: 17,
    tabletX: 67.5,
    tabletY: 16.5,
    mobileX: 88,
    mobileY: 16.5,
    mobile: true,
  },
  {
    id: "activity-manufacturing-01",
    sector: "manufacturing",
    x: 25,
    y: 34,
    tabletX: 4,
    tabletY: 30,
    mobileX: 8,
    mobileY: 41,
    mobile: false,
  },
  {
    id: "activity-hospitality-01",
    sector: "hospitality",
    x: 65,
    y: 36,
    tabletX: 72.5,
    tabletY: 35,
    mobileX: 93,
    mobileY: 35,
    mobile: true,
  },
  {
    id: "activity-technology-01",
    sector: "technology",
    x: 42,
    y: 39,
    tabletX: 27,
    tabletY: 36,
    mobileX: 19,
    mobileY: 36,
    mobile: true,
  },
  {
    id: "activity-warehousing-01",
    sector: "warehousing",
    x: 36,
    y: 56,
    tabletX: 14,
    tabletY: 51,
    mobileX: 8,
    mobileY: 66,
    mobile: true,
  },
  {
    id: "activity-services-01",
    sector: "services",
    x: 44,
    y: 61,
    tabletX: 31,
    tabletY: 60,
    mobileX: 25,
    mobileY: 59,
    mobile: true,
  },
  {
    id: "activity-agriculture-01",
    sector: "agriculture",
    x: 71,
    y: 52,
    tabletX: 84,
    tabletY: 49,
    mobileX: 92,
    mobileY: 64,
    mobile: false,
  },
  {
    id: "activity-energy-01",
    sector: "energy",
    x: 61,
    y: 61,
    tabletX: 66,
    tabletY: 60,
    mobileX: 82,
    mobileY: 59,
    mobile: true,
  },
];

const EVENT_ICONS = [
  BriefcaseBusiness,
  Search,
  UsersRound,
  NotebookPen,
  BadgeCheck,
  Sparkles,
  ArrowRight,
] as const;

function WorldPicture({
  className,
  primary = false,
}: {
  readonly className: string;
  readonly primary?: boolean;
}) {
  return (
    <picture className={className}>
      <source
        media="(max-width: 600px)"
        srcSet="/visuals/living-market/world-mobile.webp"
      />
      <source
        media="(max-width: 1024px)"
        srcSet="/visuals/living-market/world-tablet.webp"
      />
      <img
        src="/visuals/living-market/world-desktop.webp"
        alt={primary ? "" : ""}
        width={1717}
        height={916}
        loading="eager"
        decoding="async"
        fetchPriority={primary ? "high" : "auto"}
      />
    </picture>
  );
}

function ActivityHotspot({
  node,
  label,
  active,
  pulsing,
  onSelect,
}: {
  readonly node: ActivityNode;
  readonly label: string;
  readonly active: boolean;
  readonly pulsing: boolean;
  readonly onSelect: (sector: SectorKey) => void;
}) {
  const Icon = SECTORS[node.sector].icon;
  const style = {
    "--site-x": `${node.x}%`,
    "--site-y": `${node.y}%`,
    "--site-tablet-x": `${node.tabletX}%`,
    "--site-tablet-y": `${node.tabletY}%`,
    "--site-mobile-x": `${node.mobileX}%`,
    "--site-mobile-y": `${node.mobileY}%`,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={styles.hotspot}
      style={style}
      data-sector={node.sector}
      data-active={active}
      data-pulsing={pulsing}
      data-mobile={node.mobile}
      aria-pressed={active}
      onClick={() => onSelect(node.sector)}
    >
      <span className={styles.hotspotSignal} aria-hidden />
      <span className={styles.hotspotIcon}>
        <Icon aria-hidden />
      </span>
      <span className={styles.hotspotCopy}>
        <strong>{label}</strong>
      </span>
    </button>
  );
}

export function LiveMarketCommand({
  locale,
  market,
  labels,
}: {
  readonly locale: string;
  readonly market: PublicMarket;
  readonly labels: LabelSet;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const pointerFrame = useRef<number | null>(null);
  const seenModes = useRef<Set<LandingMode>>(new Set());
  const [selectedSector, setSelectedSector] = useState<SectorKey | null>(null);
  const [eventPhase, setEventPhase] = useState(0);
  const [pulseSite, setPulseSite] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  // The server resolved the arm from the bounded cookie; reaching this tree
  // means LIVE. Kept as state only because telemetry and the data
  // attributes below read it.
  const [mode] = useState<LandingMode>("live");
  const [modeReady, setModeReady] = useState(false);

  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    [locale],
  );
  // Owner directive 2026-08-24: anonymous surfaces name only the KIND of
  // source, never the country.
  const sourceName = labels.dataSourceGeneric;
  const opportunityStream = useMemo(
    () =>
      market.professions
        .flatMap((profession) =>
          profession.jobs.slice(0, 1).map((job) => ({
            ...job,
            profession: profession.label,
          })),
        )
        .slice(0, 3),
    [market.professions],
  );

  const activeSector =
    selectedSector ?? ACTIVITY_NODES[pulseSite]?.sector ?? "construction";
  const activeProfession = market.professions.find(
    (profession) => profession.slug === SECTORS[activeSector].profession,
  );
  const currentEvent = labels.eventSteps[eventPhase] ?? labels.eventSteps[0];
  const EventIcon = EVENT_ICONS[eventPhase] ?? EVENT_ICONS[0];
  const liveWorkloadActive = modeReady && mode === "live";

  const trackLanding = useCallback(
    (event: LandingEventName, audience: LandingAudience) => {
      recordEvent(event, landingEventMetadata(mode, audience));
    },
    [mode],
  );

  /**
   * FOCUS is the RESTORED previous production landing — a different component
   * tree with its own chrome — and the server picks the arm from the bounded
   * cookie. Switching therefore writes the cookie and reloads, rather than
   * re-styling this tree in place.
   */
  const changeMode = useCallback(
    (nextMode: LandingMode) => {
      if (nextMode === mode) return;
      persistLandingMode(nextMode);
      recordEvent(
        LANDING_EVENTS.modeChanged,
        landingEventMetadata(nextMode, "unknown"),
      );
      setMenuOpen(false);
      window.location.reload();
    },
    [mode],
  );

  useEffect(() => {
    // Deliberately writes NOTHING. Reaching this tree means the visitor
    // explicitly chose LIVE, so the record already says so; writing it here
    // anyway would manufacture an "explicit choice" for anyone who merely
    // arrived, and the FOCUS default depends on that record staying honest
    // (owner command §3). This effect only unblocks the LIVE workload once
    // the client has hydrated.
    setModeReady(true);
  }, []);

  useEffect(() => {
    if (!modeReady || seenModes.current.has(mode)) return;
    seenModes.current.add(mode);
    recordEvent(
      LANDING_EVENTS.modeSeen,
      landingEventMetadata(mode, "unknown"),
    );
  }, [mode, modeReady]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(query.matches);
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    query.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      query.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!liveWorkloadActive || reducedMotion || !pageVisible) return;
    const eventTimer = window.setInterval(
      () => setEventPhase((phase) => (phase + 1) % labels.eventSteps.length),
      2100,
    );
    const pulseTimer = window.setInterval(
      () => setPulseSite((site) => (site + 1) % ACTIVITY_NODES.length),
      1700,
    );
    return () => {
      window.clearInterval(eventTimer);
      window.clearInterval(pulseTimer);
    };
  }, [labels.eventSteps.length, liveWorkloadActive, pageVisible, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!liveWorkloadActive) {
      root?.removeAttribute("data-journey");
      root?.style.setProperty("--scroll-fade", "1");
      root?.style.setProperty("--journey-opacity", "1");
      root?.style.setProperty("--journey-y", "0px");
      root?.style.setProperty("--event-opacity", "1");
      return;
    }
    let scrollFrame = 0;
    const update = () => {
      scrollFrame = 0;
      const currentRoot = rootRef.current;
      if (!currentRoot) return;
      const rect = currentRoot.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      currentRoot.style.setProperty("--base-scroll-y", `${progress * 2.88}px`);
      currentRoot.style.setProperty("--middle-scroll-y", `${progress * -5.04}px`);
      currentRoot.style.setProperty("--front-scroll-y", `${progress * -10.44}px`);
      currentRoot.style.setProperty(
        "--scroll-fade",
        `${Math.max(0, 1 - progress * 1.35)}`,
      );
      const journey = Math.min(1, Math.max(0, (progress - 0.34) / 0.36));
      currentRoot.style.setProperty("--journey-opacity", `${journey}`);
      currentRoot.style.setProperty("--journey-y", `${(1 - journey) * 18}px`);
      currentRoot.style.setProperty("--event-opacity", `${1 - journey}`);
      currentRoot.dataset.journey = journey > 0.35 ? "true" : "false";
    };
    const schedule = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [liveWorkloadActive]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!liveWorkloadActive || reducedMotion || pointerFrame.current) return;
      const { clientX, clientY, currentTarget } = event;
      pointerFrame.current = window.requestAnimationFrame(() => {
        pointerFrame.current = null;
        const root = rootRef.current;
        if (!root) return;
        const rect = currentTarget.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width - 0.5) * 14;
        const y = ((clientY - rect.top) / rect.height - 0.5) * 10;
        root.style.setProperty("--base-x", `${x * -0.12}px`);
        root.style.setProperty("--base-y", `${y * -0.1}px`);
        root.style.setProperty("--middle-x", `${x * 0.34}px`);
        root.style.setProperty("--middle-y", `${y * 0.24}px`);
        root.style.setProperty("--front-x", `${x * 0.72}px`);
        root.style.setProperty("--front-y", `${y * 0.52}px`);
      });
    },
    [liveWorkloadActive, reducedMotion],
  );

  const clearPointer = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const property of [
      "--base-x",
      "--base-y",
      "--middle-x",
      "--middle-y",
      "--front-x",
      "--front-y",
    ]) {
      root.style.setProperty(property, "0px");
    }
  }, []);

  const selectSector = useCallback((sector: SectorKey) => {
    setSelectedSector((current) => (current === sector ? null : sector));
  }, []);

  return (
    <main
      ref={rootRef}
      className={styles.root}
      data-sector={selectedSector ?? "all"}
      data-event-phase={eventPhase}
      data-reduced-motion={reducedMotion}
      data-paused={!pageVisible}
      data-mode={mode}
      data-mode-ready={modeReady}
      data-live-workload={liveWorkloadActive}
    >
      <div
        className={styles.viewport}
        onPointerMove={liveWorkloadActive ? handlePointerMove : undefined}
        onPointerLeave={liveWorkloadActive ? clearPointer : undefined}
      >
        <div className={styles.world} data-testid="living-market-world">
          <WorldPicture
            className={`${styles.worldLayer} ${styles.worldBase}`}
            primary
          />
          {liveWorkloadActive ? (
            <>
              <WorldPicture
                className={`${styles.worldLayer} ${styles.worldMiddle}`}
              />
              <WorldPicture
                className={`${styles.worldLayer} ${styles.worldFront}`}
              />
            </>
          ) : null}
          <div className={styles.worldTone} aria-hidden />
          <div className={styles.chromeMaskLeft} aria-hidden />
          <div className={styles.chromeMaskRight} aria-hidden />
          <div className={styles.chromeMaskBottom} aria-hidden />
          <div className={styles.depthGrid} aria-hidden />
          {liveWorkloadActive ? (
            <>
              <svg
                className={styles.network}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path data-sector="logistics" d="M34 18 C28 34 31 44 36 55" />
                <path data-sector="construction" d="M34 18 C39 18 43 20 46 23" />
                <path data-sector="care" d="M46 23 C53 19 59 20 63 23" />
                <path data-sector="hospitality" d="M46 23 C55 29 61 34 65 38" />
                <path data-sector="technology" d="M36 55 C39 50 41 45 42 40" />
                <path data-sector="agriculture" d="M65 38 C69 43 71 48 71 53" />
              </svg>

              <div className={styles.motionLayer} aria-hidden>
                <span className={styles.logisticsRun}>
                  <i />
                  <i />
                </span>
                <span className={styles.constructionCrane}>
                  <i />
                  <b />
                </span>
                <span className={styles.careShift}>
                  <i />
                  <b />
                </span>
                <span className={styles.factoryRhythm}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className={styles.hospitalityShift}>
                  <i />
                  <i />
                </span>
                <span className={styles.agricultureRun}>
                  <i />
                  <i />
                </span>
                <span className={styles.energyRotor}>
                  <i />
                  <i />
                  <i />
                </span>
              </div>

              <div
                className={styles.hotspotLayer}
                data-layer="conceptual-sector-activity"
                aria-label={labels.sectorTitle}
              >
                {ACTIVITY_NODES.map((node, index) => (
                  <ActivityHotspot
                    key={node.id}
                    node={node}
                    label={labels.sectors[node.sector]}
                    active={selectedSector === node.sector}
                    pulsing={index === pulseSite}
                    onSelect={selectSector}
                  />
                ))}
              </div>
            </>
          ) : null}

          <div className={styles.visualTruth}>
            <span>{labels.tagline}</span>
            <small>{labels.visualNote}</small>
          </div>
        </div>

        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label={labels.brand}>
            <span aria-hidden />
            <strong>{labels.brand}</strong>
          </Link>
          <div className={styles.liveStatus}>
            <i aria-hidden /> {labels.live}
          </div>
          <div
            className={styles.modeSwitcher}
            role="group"
            aria-label="LIVE / FOCUS"
            data-testid="landing-mode-switcher"
          >
            {(["live", "focus"] as const).map((candidate) => (
              <button
                type="button"
                key={candidate}
                aria-pressed={mode === candidate}
                onClick={() => changeMode(candidate)}
              >
                {candidate.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.menuButton}
            aria-label={menuOpen ? labels.menuClose : labels.menuOpen}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
          <nav data-open={menuOpen} aria-label={labels.tagline}>
            <Link
              href="/jobs"
              onClick={() => trackLanding(LANDING_EVENTS.jobsOpened, "unknown")}
            >
              {labels.jobs}
            </Link>
            <Link href="/for-workers">{labels.workers}</Link>
            <Link href="/for-companies">{labels.companies}</Link>
            <Link href="/#how-it-works">{labels.how}</Link>
            <Link href="/auth/login" className={styles.login}>
              {labels.login}
            </Link>
          </nav>
        </header>

        <section className={styles.hero} aria-labelledby="living-market-title">
          <p>{labels.tagline}</p>
          <h1 id="living-market-title">
            {labels.headline}
            <br />
            <span>{labels.headlineAccent}</span>
          </h1>
          <strong>{labels.support}</strong>
          <small>{labels.evidence}</small>
          <div className={styles.heroActions}>
            <Link
              href="/auth/signup"
              onClick={() => {
                trackLanding(LANDING_EVENTS.primaryCtaClicked, "worker");
                trackLanding(LANDING_EVENTS.signupStarted, "worker");
              }}
            >
              {labels.workerCta} <ArrowRight aria-hidden />
            </Link>
            <Link
              href="/company-need"
              onClick={() =>
                trackLanding(LANDING_EVENTS.primaryCtaClicked, "employer")
              }
            >
              {labels.employerCta}
            </Link>
          </div>
        </section>

        <section
          className={styles.entryBand}
          aria-label={`${labels.workers} / ${labels.companies}`}
        >
          <article>
            <span aria-hidden>
              <UsersRound />
            </span>
            <div>
              <small>{labels.workers}</small>
              <p>{labels.workerLead}</p>
              <Link
                href="/auth/signup"
                onClick={() => {
                  trackLanding(LANDING_EVENTS.primaryCtaClicked, "worker");
                  trackLanding(LANDING_EVENTS.signupStarted, "worker");
                }}
              >
                {labels.workerAction} <ArrowRight aria-hidden />
              </Link>
            </div>
          </article>
          <article>
            <span aria-hidden>
              <HardHat />
            </span>
            <div>
              <small>{labels.companies}</small>
              <p>{labels.employerLead}</p>
              <Link
                href="/company-need"
                onClick={() =>
                  trackLanding(LANDING_EVENTS.primaryCtaClicked, "employer")
                }
              >
                {labels.employerAction} <ArrowRight aria-hidden />
              </Link>
            </div>
          </article>
        </section>

        <aside className={styles.supplyPanel} data-testid="real-supply-panel">
          <div className={styles.supplyTitle}>
            <span>
              <i aria-hidden /> {labels.verifiedMarketData}
            </span>
            {market.lastRefreshedAt ? (
              <time>
                {dateFormatter.format(new Date(market.lastRefreshedAt))}
              </time>
            ) : null}
          </div>
          {/* Sweden is the SOURCE of these measured numbers, never the scope of
              the product. It stays a coverage label inside the panel so the
              European product is not read as a Swedish one. */}
          <p className={styles.supplySource}>
            {labels.dataSourceLabel} · {sourceName}
          </p>
          {/* Exact current counts straight from count_public_vacancies_v1 —
              never rounded, never substituted. A count the reader could not
              return is omitted rather than filled with a constant. */}
          {market.activeVacancies !== null &&
          market.distinctEmployers !== null ? (
            <div className={styles.supplyStats} data-basis={market.basis}>
              <div>
                <strong>{formatter.format(market.activeVacancies)}</strong>
                <span>{labels.vacancies}</span>
              </div>
              <div>
                <strong>{formatter.format(market.distinctEmployers)}</strong>
                <span>{labels.employers}</span>
              </div>
            </div>
          ) : null}
          <div className={styles.liveProfessions}>
            <p>{labels.professionsTitle}</p>
            {market.professions.slice(0, 4).map((profession) => (
              <div key={profession.slug}>
                <span>{profession.label}</span>
                {profession.totalCount !== null ? (
                  <strong>{formatter.format(profession.totalCount)}</strong>
                ) : null}
              </div>
            ))}
          </div>
          {opportunityStream.length ? (
            <div className={styles.opportunityStream}>
              <p>{labels.opportunityStream}</p>
              {opportunityStream.map((job) => (
                <Link
                  href={`/jobs/${job.id}`}
                  key={job.id}
                  onClick={() =>
                    trackLanding(LANDING_EVENTS.jobsOpened, "worker")
                  }
                >
                  <span>{job.profession}</span>
                  <strong>{job.title}</strong>
                  <ArrowRight aria-hidden />
                </Link>
              ))}
            </div>
          ) : null}
        </aside>

        {liveWorkloadActive ? (
          <section
            className={styles.eventCard}
            data-testid="work-event"
            aria-live="polite"
          >
            <span className={styles.eventIcon}>
              <EventIcon aria-hidden />
            </span>
            <div>
              <small>
                {labels.sectors[activeSector]} · {eventPhase + 1}/
                {labels.eventSteps.length}
              </small>
              <h2>{currentEvent.title}</h2>
              <p>{currentEvent.body}</p>
            </div>
            <span className={styles.eventProgress} aria-hidden>
              {labels.eventSteps.map((step, index) => (
                <i key={step.title} data-done={index <= eventPhase} />
              ))}
            </span>
          </section>
        ) : null}

        {liveWorkloadActive && eventPhase === labels.eventSteps.length - 1 ? (
          <div className={styles.opportunityEcho} aria-hidden>
            <BadgeCheck />
          </div>
        ) : null}

        <section
          id="how-it-works"
          className={styles.processRail}
          data-testid="evidence-sequence"
        >
          {labels.eventSteps.map((step, index) => {
            const Icon = EVENT_ICONS[index] ?? Check;
            return (
              <div
                key={step.title}
                data-active={index === eventPhase}
                data-done={index < eventPhase}
              >
                <span>
                  <Icon aria-hidden />
                </span>
                <small>0{index + 1}</small>
                <strong>{step.title}</strong>
              </div>
            );
          })}
        </section>

        {liveWorkloadActive ? (
          <section className={styles.sectorDock} aria-label={labels.sectorTitle}>
            <p>{labels.sectorTitle}</p>
            <div>
              {SECTOR_ORDER.map((sector) => {
                const Icon = SECTORS[sector].icon;
                const active = selectedSector === sector;
                return (
                  <button
                    type="button"
                    key={sector}
                    data-selected={active}
                    aria-pressed={active}
                    onClick={() => selectSector(sector)}
                  >
                    <span>
                      <Icon aria-hidden />
                    </span>
                    <strong>{labels.sectors[sector]}</strong>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedSector && activeProfession?.jobs[0] ? (
          <Link
            href={`/jobs/${activeProfession.jobs[0].id}`}
            className={styles.realOpportunity}
            onClick={() => trackLanding(LANDING_EVENTS.jobsOpened, "worker")}
          >
            <span>
              {labels.currentSupply} · {sourceName}
            </span>
            <strong>{activeProfession.jobs[0].title}</strong>
            <ArrowRight aria-hidden />
          </Link>
        ) : null}
      </div>
    </main>
  );
}
