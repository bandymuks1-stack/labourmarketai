"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import type { CSSProperties } from "react";
import { useMemo, useRef, useState } from "react";
import type { ActiveLocale } from "@/lib/i18n/config";
import styles from "./work-continuum.module.css";

export type WorkContinuumJob = {
  id: string;
  title: string;
  professionSlug: string | null;
  occupation: string | null;
  employmentForm: string | null;
  workingTime: string | null;
  positions: number | null;
  sourceLanguage: string | null;
  publishedAt: string | null;
  attributionCode: string | null;
};

export type WorkContinuumSupply = {
  activeVacancies: number;
  distinctEmployers: number;
  regions: number;
  lastRefreshedAt: string | null;
  basis: "live" | "measured-floor";
};

export type WorkContinuumSector = {
  id: string;
  label: string;
  signalLabel: string;
  professionSlug: string;
  totalCount: number | null;
  jobs: WorkContinuumJob[];
  basis: "live" | "unavailable";
};

type ApprovalContext = {
  slug: string;
  contextEntityType: string;
  deadlineHours: number;
};

type WorldStateKey =
  | "market"
  | "opportunity"
  | "worker"
  | "employer"
  | "work"
  | "project"
  | "journal"
  | "planning"
  | "ai"
  | "return";

type WorldState = {
  key: WorldStateKey;
  label: string;
  title: string;
  route:
    | "jobs"
    | "signup"
    | "company-need"
    | "journal"
    | "planning"
    | "documents"
    | "assist";
  routeLabel: string;
};

type SpatialPoint = {
  x: number;
  y: number;
  mobileX: number;
  mobileY: number;
  code: string;
};

type SpatialStyle = CSSProperties &
  Record<"--signal-x" | "--signal-y" | "--mobile-x" | "--mobile-y", string>;

type FlowStyle = CSSProperties &
  Record<
    | "--flow-x"
    | "--flow-y"
    | "--flow-width"
    | "--flow-angle"
    | "--mobile-flow-x"
    | "--mobile-flow-y"
    | "--mobile-flow-width"
    | "--mobile-flow-angle"
    | "--flow-delay",
    string
  >;

const integer = new Intl.NumberFormat("en-US");

const WORLD_STATES: readonly WorldState[] = [
  {
    key: "market",
    label: "European labour market",
    title: "Demand is already moving through the world.",
    route: "jobs",
    routeLabel: "Enter live supply",
  },
  {
    key: "opportunity",
    label: "Opportunity",
    title: "A real opening appears inside a real field of work.",
    route: "jobs",
    routeLabel: "Open this profession",
  },
  {
    key: "worker",
    label: "Worker",
    title: "Capability and availability move toward relevant demand.",
    route: "signup",
    routeLabel: "Create working identity",
  },
  {
    key: "employer",
    label: "Employer need",
    title: "Role, place, timing and skills make demand concrete.",
    route: "company-need",
    routeLabel: "State a company need",
  },
  {
    key: "work",
    label: "Actual work",
    title: "The relationship becomes activity in a workplace.",
    route: "journal",
    routeLabel: "See the Work Journal",
  },
  {
    key: "project",
    label: "Project",
    title: "People, responsibility, place and outcome remain connected.",
    route: "planning",
    routeLabel: "Open planning",
  },
  {
    key: "journal",
    label: "Work Journal / evidence",
    title: "Activity leaves a private, attributable professional record.",
    route: "journal",
    routeLabel: "Open the Work Journal",
  },
  {
    key: "planning",
    label: "Planning / workflow",
    title: "Time, documents and human approvals stay attached to work.",
    route: "documents",
    routeLabel: "Open documents",
  },
  {
    key: "ai",
    label: "AI intelligence",
    title: "Context becomes a suggestion; a human remains the decision point.",
    route: "assist",
    routeLabel: "Open the assistant",
  },
  {
    key: "return",
    label: "European labour market",
    title: "Completed work returns as better context for what comes next.",
    route: "jobs",
    routeLabel: "Explore open jobs",
  },
] as const;

const PROOF_STATES: readonly WorldState[] = [
  WORLD_STATES[0],
  WORLD_STATES[1],
  WORLD_STATES[4],
] as const;

const SIGNAL_POINTS: Record<string, SpatialPoint> = {
  agriculture: { x: 15, y: 33, mobileX: 22, mobileY: 84, code: "GROW" },
  hospitality: { x: 24, y: 70, mobileX: 27, mobileY: 66, code: "SERVE" },
  logistics: { x: 42, y: 55, mobileX: 51, mobileY: 54, code: "MOVE" },
  production: { x: 58, y: 43, mobileX: 30, mobileY: 42, code: "MAKE" },
  construction: { x: 84, y: 28, mobileX: 72, mobileY: 24, code: "BUILD" },
  care: { x: 77, y: 70, mobileX: 72, mobileY: 48, code: "CARE" },
  technology: { x: 85, y: 84, mobileX: 58, mobileY: 70, code: "CODE" },
};

const FLOW_PAIRS = [
  ["agriculture", "logistics"],
  ["hospitality", "logistics"],
  ["logistics", "production"],
  ["production", "construction"],
  ["production", "care"],
  ["care", "technology"],
  ["construction", "technology"],
  ["hospitality", "care"],
] as const;

const PROOF_FLOW_PAIRS = [["logistics", "construction"]] as const;

function safeLanguage(value: string | null): string | undefined {
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value ?? "")
    ? (value as string)
    : undefined;
}

function readableLabel(value: string): string {
  return value
    .replace(/_default$/, "")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function pathFor(
  route: WorldState["route"],
  locale: ActiveLocale,
  selectedSector: WorkContinuumSector,
): string {
  const base = `/${locale}`;
  if (route === "jobs") {
    return `${base}/jobs?profession=${encodeURIComponent(selectedSector.professionSlug)}`;
  }
  if (route === "signup") return `${base}/auth/signup`;
  if (route === "company-need") return `${base}/company-need`;
  if (route === "journal") return `${base}/dashboard/journal`;
  if (route === "planning") return `${base}/dashboard/planning`;
  if (route === "documents") return `${base}/dashboard/documents`;
  return `${base}/dashboard/assist`;
}

function pointStyle(point: SpatialPoint): SpatialStyle {
  return {
    "--signal-x": `${point.x}%`,
    "--signal-y": `${point.y}%`,
    "--mobile-x": `${point.mobileX}%`,
    "--mobile-y": `${point.mobileY}%`,
  };
}

function geometry(
  start: SpatialPoint,
  end: SpatialPoint,
  mobile: boolean,
): { x: number; y: number; width: number; angle: number } {
  const x = mobile ? start.mobileX : start.x;
  const y = mobile ? start.mobileY : start.y;
  const endX = mobile ? end.mobileX : end.x;
  const endY = mobile ? end.mobileY : end.y;
  const dx = endX - x;
  const dy = endY - y;
  return {
    x,
    y,
    // Rounded output is deliberately serialized into inline CSS variables.
    // It prevents insignificant server/browser floating-point differences
    // from becoming React hydration mismatches.
    width: Number(Math.hypot(dx, dy).toFixed(3)),
    angle: Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(3)),
  };
}

function flowStyle(
  from: SpatialPoint,
  to: SpatialPoint,
  index: number,
): FlowStyle {
  const desktop = geometry(from, to, false);
  const mobile = geometry(from, to, true);
  return {
    "--flow-x": `${desktop.x}%`,
    "--flow-y": `${desktop.y}%`,
    "--flow-width": `${desktop.width}%`,
    "--flow-angle": `${desktop.angle}deg`,
    "--mobile-flow-x": `${mobile.x}%`,
    "--mobile-flow-y": `${mobile.y}%`,
    "--mobile-flow-width": `${mobile.width}%`,
    "--mobile-flow-angle": `${mobile.angle}deg`,
    "--flow-delay": `${index * -0.73}s`,
  };
}

function LivingPhotographicWorld({
  progress,
  proofMode,
  reduceMotion,
}: {
  progress: MotionValue<number>;
  proofMode: boolean;
  reduceMotion: boolean;
}) {
  const cameraX = useTransform(progress, [0, 0.52, 1], ["0%", "-2.8%", "-6%"]);
  const cameraY = useTransform(progress, [0, 0.52, 1], ["0%", "1.4%", "3.8%"]);
  const cameraScale = useTransform(progress, [0, 0.52, 1], [1.02, 1.11, 1.22]);

  return (
    <motion.div
      className={styles.worldCamera}
      style={
        proofMode && !reduceMotion
          ? { x: cameraX, y: cameraY, scale: cameraScale }
          : undefined
      }
    >
      <Image
        src="/images/work-continuum/work-continuum-city.webp"
        alt="Agriculture, logistics, hospitality, construction, care and technology connected in one working environment."
        fill
        priority
        sizes="100vw"
      />

      {proofMode ? (
        <div className={styles.livingWorldLayers} aria-hidden>
          <div className={styles.cityDepthPlane} />
          <div className={styles.industryDepthPlane} />
          <div className={styles.roadDepthPlane} />

          <div className={styles.logisticsTruckActor} />
          <span className={styles.truckHeadlamp} />

          <div className={styles.forkliftActor} />
          <span className={styles.forkliftBeacon} />

          <div className={styles.constructionCrewActor} />
          <div className={styles.craneRig}>
            <span className={styles.craneCable}>
              <i />
            </span>
          </div>

          <div className={styles.workplaceLights}>
            {Array.from({ length: 4 }, (_, index) => (
              <i
                key={index}
                style={{ "--light-index": index } as CSSProperties}
              />
            ))}
          </div>

          <span className={styles.activityOrigin} />
          <span className={styles.activityDemandPath}>
            <i />
          </span>
        </div>
      ) : null}
    </motion.div>
  );
}

function MarketNetwork({
  sectors,
  selectedId,
  activeState,
  proofMode,
  onSelect,
  onEngage,
}: {
  sectors: readonly WorkContinuumSector[];
  selectedId: string;
  activeState: WorldStateKey;
  proofMode: boolean;
  onSelect: (id: string) => void;
  onEngage: () => void;
}) {
  const showField =
    activeState === "market" ||
    activeState === "opportunity" ||
    activeState === "return";
  const visiblePairs = proofMode ? PROOF_FLOW_PAIRS : FLOW_PAIRS;
  const visibleSectors = proofMode
    ? sectors.filter(
        (sector) => sector.id === "construction" || sector.id === "logistics",
      )
    : sectors;

  return (
    <div className={styles.marketNetwork} data-field-open={showField}>
      <div className={styles.flowField} aria-hidden>
        {visiblePairs.map(([from, to], index) => (
          <span
            className={styles.flowLine}
            key={`${from}-${to}`}
            style={flowStyle(SIGNAL_POINTS[from], SIGNAL_POINTS[to], index)}
          >
            <i />
          </span>
        ))}
      </div>

      {visibleSectors.map((sector) => {
        const point = SIGNAL_POINTS[sector.id] ?? SIGNAL_POINTS.production;
        const selected = sector.id === selectedId;
        return (
          <button
            type="button"
            className={styles.sectorSignal}
            data-sector={sector.id}
            data-selected={selected}
            key={sector.id}
            style={pointStyle(point)}
            aria-pressed={selected}
            aria-label={`${sector.label}: ${
              sector.totalCount === null
                ? "public supply unavailable"
                : `${integer.format(sector.totalCount)} classified open opportunities`
            }`}
            onMouseEnter={() => onSelect(sector.id)}
            onFocus={() => {
              onSelect(sector.id);
              onEngage();
            }}
            onClick={() => {
              onSelect(sector.id);
              onEngage();
            }}
          >
            <span className={styles.signalRings} aria-hidden>
              <i />
              <i />
            </span>
            <span className={styles.signalCore} aria-hidden />
            <span className={styles.signalText}>
              <small>{point.code}</small>
              <strong>{sector.label}</strong>
              <em>
                {sector.totalCount === null
                  ? "data unavailable"
                  : `${integer.format(sector.totalCount)} open`}
              </em>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SectorReadout({
  locale,
  sector,
  visible,
  engaged,
}: {
  locale: ActiveLocale;
  sector: WorkContinuumSector;
  visible: boolean;
  engaged: boolean;
}) {
  const professionHref = `/${locale}/jobs?profession=${encodeURIComponent(
    sector.professionSlug,
  )}`;

  return (
    <aside
      className={styles.sectorReadout}
      data-visible={visible}
      data-engaged={engaged}
      aria-live="polite"
    >
      <div className={styles.readoutTopline}>
        <span>{sector.signalLabel}</span>
        <span>
          {sector.basis === "live"
            ? "LIVE PUBLIC PROJECTION"
            : "PUBLIC DATA UNAVAILABLE"}
        </span>
      </div>
      <div className={styles.readoutMeasure}>
        <strong>
          {sector.totalCount === null ? "—" : integer.format(sector.totalCount)}
        </strong>
        <span>classified open opportunities</span>
      </div>
      {sector.jobs.length > 0 ? (
        <ol>
          {sector.jobs.slice(0, 2).map((job) => (
            <li key={job.id}>
              <Link
                href={`/${locale}/jobs/${job.id}`}
                lang={safeLanguage(job.sourceLanguage)}
              >
                <span className={styles.jobPulse} aria-hidden />
                <span>{job.title}</span>
                <i aria-hidden>↗</i>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.noSectorJobs}>
          No public opportunity titles are available for this signal.
        </p>
      )}
      <Link className={styles.readoutAction} href={professionHref}>
        Open {sector.label.toLowerCase()} supply <span aria-hidden>→</span>
      </Link>
    </aside>
  );
}

function WorldMechanism({
  state,
  planningViews,
  approvalContexts,
}: {
  state: WorldStateKey;
  planningViews: readonly string[];
  approvalContexts: readonly ApprovalContext[];
}) {
  if (state === "worker") {
    return (
      <div className={styles.workerMechanism}>
        <span className={styles.workerCore} aria-hidden />
        <span className={styles.workerOrbit} aria-hidden />
        <b>capabilities</b>
        <b>availability · private</b>
        <b>evidence</b>
      </div>
    );
  }

  if (state === "employer") {
    return (
      <div className={styles.employerMechanism}>
        <span className={styles.needBeacon} aria-hidden />
        <div>
          <b>ROLE</b>
          <b>PLACE</b>
          <b>START</b>
          <b>SKILLS</b>
        </div>
        <small>CANONICAL EMPLOYER NEED</small>
      </div>
    );
  }

  if (state === "work" || state === "project") {
    return (
      <div className={styles.workMechanism} data-project={state === "project"}>
        <span className={styles.workPerson} aria-hidden />
        <span className={styles.workPath} aria-hidden>
          <i />
        </span>
        <span className={styles.workplace} aria-hidden />
        <div className={styles.projectSignals}>
          <b>{state === "project" ? "RESPONSIBILITY" : "PERSON"}</b>
          <b>{state === "project" ? "PLACE" : "WORKPLACE"}</b>
          <b>{state === "project" ? "OUTCOME" : "ACTIVITY"}</b>
        </div>
      </div>
    );
  }

  if (state === "journal") {
    return (
      <div className={styles.journalMechanism}>
        <span className={styles.recordSource} aria-hidden />
        <span className={styles.recordTrail} aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <div className={styles.recordLedger}>
          <small>WORK JOURNAL · PRIVATE BY DEFAULT</small>
          <b>activity</b>
          <b>time</b>
          <b>evidence</b>
          <b>provenance</b>
        </div>
      </div>
    );
  }

  if (state === "planning") {
    return (
      <div className={styles.planningMechanism}>
        <div className={styles.planningViews}>
          {planningViews.map((view) => (
            <span key={view}>{view}</span>
          ))}
        </div>
        <span className={styles.planningBand} aria-hidden>
          <i />
        </span>
        <div className={styles.approvalSignals}>
          {approvalContexts.slice(0, 3).map((workflow) => (
            <span key={workflow.slug}>
              <i aria-hidden />
              {readableLabel(workflow.contextEntityType)}
              <b>human approval</b>
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (state === "ai") {
    return (
      <div className={styles.aiMechanism}>
        <div className={styles.aiInputs} aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
        <span className={styles.aiCore} aria-hidden>
          AI
        </span>
        <div className={styles.aiDecision}>
          <small>CONTEXT STRUCTURED</small>
          <b>suggestion</b>
          <span>HUMAN CONFIRMATION REQUIRED</span>
        </div>
      </div>
    );
  }

  return null;
}

export function WorkContinuumLanding({
  locale,
  supply,
  sectors,
  planningViews,
  approvalContexts,
  proofMode,
  worldOnly,
}: {
  locale: ActiveLocale;
  supply: WorkContinuumSupply;
  sectors: readonly WorkContinuumSector[];
  planningViews: readonly string[];
  approvalContexts: readonly ApprovalContext[];
  proofMode: boolean;
  worldOnly: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const journeyStates = proofMode ? PROOF_STATES : WORLD_STATES;
  const initialSector =
    (proofMode
      ? sectors.find(
          (sector) => sector.id === "logistics" && (sector.totalCount ?? 0) > 0,
        )
      : sectors.find(
          (sector) =>
            sector.id === "production" && (sector.totalCount ?? 0) > 0,
        )) ??
    sectors.find((sector) => (sector.totalCount ?? 0) > 0) ??
    sectors[0];
  const [selectedId, setSelectedId] = useState(
    initialSector?.id ?? "production",
  );
  const [sectorEngaged, setSectorEngaged] = useState(false);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const next = Math.min(
      journeyStates.length - 1,
      Math.floor(latest * journeyStates.length),
    );
    setActiveIndex((current) => (current === next ? current : next));
  });

  const activeState = journeyStates[activeIndex] ?? journeyStates[0];
  const selectedSector =
    sectors.find((sector) => sector.id === selectedId) ?? initialSector;
  const freshestJobs = useMemo(
    () => sectors.flatMap((sector) => sector.jobs.slice(0, 1)),
    [sectors],
  );

  if (!selectedSector) return null;

  const reviewDate = supply.lastRefreshedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
        new Date(supply.lastRefreshedAt),
      )
    : "measured 19 Aug 2026";
  const marketStates = ["market", "opportunity", "return"] as const;
  const sectorReadoutVisible = marketStates.includes(
    activeState.key as (typeof marketStates)[number],
  );
  const dynamicTitle =
    activeState.key === "opportunity" && selectedSector.jobs[0]
      ? selectedSector.jobs[0].title
      : activeState.key === "market"
        ? `${integer.format(supply.activeVacancies)} open opportunities across ${supply.regions} regions.`
        : activeState.key === "return"
          ? `${integer.format(supply.distinctEmployers)} employers remain connected to the next cycle.`
          : activeState.title;

  const goToState = (index: number) => {
    const element = trackRef.current;
    if (!element) return;
    const travel = element.scrollHeight - window.innerHeight;
    const top =
      element.offsetTop + travel * (index / (journeyStates.length - 1));
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <div
      className={styles.root}
      data-world-state={activeState.key}
      data-proof={proofMode}
      data-world-only={worldOnly}
    >
      <main>
        <h1 className={styles.srOnly}>labourmarket.ai living labour market</h1>
        <section
          ref={trackRef}
          className={styles.worldTrack}
          style={{ height: `${journeyStates.length * 98 + 100}svh` }}
          aria-label="Living labour-market journey"
        >
          <div className={styles.worldStage} data-world-state={activeState.key}>
            <div className={styles.photographicWorld}>
              <LivingPhotographicWorld
                progress={scrollYProgress}
                proofMode={proofMode}
                reduceMotion={Boolean(reduceMotion)}
              />
            </div>
            <div className={styles.environmentDepth} aria-hidden />
            <div className={styles.marketHorizon} aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <div className={styles.ambientSignals} aria-hidden>
              {Array.from({ length: 12 }, (_, index) => (
                <i
                  key={index}
                  style={
                    {
                      "--ambient-index": index,
                      "--ambient-x": `${8 + index * 7.4}%`,
                      "--ambient-y": `${23 + (index % 4) * 17}%`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>

            <MarketNetwork
              sectors={sectors}
              selectedId={selectedSector.id}
              activeState={activeState.key}
              proofMode={proofMode}
              onSelect={setSelectedId}
              onEngage={() => setSectorEngaged(true)}
            />

            <AnimatePresence mode="wait">
              <motion.div
                className={styles.mechanismLayer}
                key={activeState.key}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 1.03 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <WorldMechanism
                  state={activeState.key}
                  planningViews={planningViews}
                  approvalContexts={approvalContexts}
                />
              </motion.div>
            </AnimatePresence>

            <SectorReadout
              locale={locale}
              sector={selectedSector}
              visible={
                sectorReadoutVisible &&
                (!proofMode ||
                  sectorEngaged ||
                  activeState.key === "opportunity")
              }
              engaged={sectorEngaged}
            />

            <header className={styles.worldHeader}>
              <Link className={styles.wordmark} href={`/${locale}`}>
                labourmarket.ai
              </Link>
              <div className={styles.liveStatus}>
                <i aria-hidden />
                <span>
                  {supply.basis === "live"
                    ? "LIVE PUBLIC SUPPLY"
                    : "GOVERNED SUPPLY FLOOR"}
                </span>
                <b>{reviewDate}</b>
              </div>
              <nav aria-label="Prototype actions">
                <Link href={`/${locale}/jobs`}>Open jobs</Link>
                <Link href={`/${locale}/auth/signup`}>Start</Link>
              </nav>
            </header>

            <div
              className={styles.worldLegend}
              aria-label="Visualization legend"
            >
              <span>
                <i data-kind="demand" /> public demand
              </span>
              <span>
                <i data-kind="flow" /> simulated flow
              </span>
              <span>
                <i data-kind="private" /> private worker signal
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                className={styles.worldContext}
                key={`${activeState.key}-${selectedSector.id}`}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: 0.42 }}
              >
                <div className={styles.contextIndex}>
                  <span>{String(activeIndex + 1).padStart(2, "0")}</span>
                  <i />
                  <span>{String(journeyStates.length).padStart(2, "0")}</span>
                </div>
                <p>{activeState.label}</p>
                <h2
                  lang={
                    activeState.key === "opportunity"
                      ? safeLanguage(
                          selectedSector.jobs[0]?.sourceLanguage ?? null,
                        )
                      : undefined
                  }
                >
                  {dynamicTitle}
                </h2>
                <Link href={pathFor(activeState.route, locale, selectedSector)}>
                  {activeState.routeLabel} <span aria-hidden>↗</span>
                </Link>
              </motion.div>
            </AnimatePresence>

            <nav className={styles.journeyRail} aria-label="World journey">
              {journeyStates.map((state, index) => (
                <button
                  type="button"
                  key={state.key}
                  aria-current={index === activeIndex ? "step" : undefined}
                  aria-label={`Go to ${state.label}`}
                  onClick={() => goToState(index)}
                >
                  <i />
                  <span>{state.label}</span>
                </button>
              ))}
            </nav>

            <button
              type="button"
              className={styles.nextState}
              onClick={() =>
                goToState(Math.min(activeIndex + 1, journeyStates.length - 1))
              }
              aria-label={
                activeIndex === journeyStates.length - 1
                  ? "End of journey"
                  : `Continue to ${journeyStates[activeIndex + 1].label}`
              }
              disabled={activeIndex === journeyStates.length - 1}
            >
              <span>
                {activeIndex === 0
                  ? "ENTER THE MARKET"
                  : "CONTINUE THROUGH WORK"}
              </span>
              <i aria-hidden />
            </button>

            <div className={styles.opportunityStream} aria-hidden>
              <div>
                {[...freshestJobs, ...freshestJobs].map((job, index) => (
                  <span
                    key={`${job.id}-${index}`}
                    lang={safeLanguage(job.sourceLanguage)}
                  >
                    {job.title} <i>↗</i>
                  </span>
                ))}
              </div>
            </div>

            <p className={styles.dataDisclosure}>
              Sector counts and titles: restricted anonymous vacancy projection.
              Worker availability, connections and movement are illustrative
              system signals; no public worker count is claimed.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
