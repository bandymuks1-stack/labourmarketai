"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "@/lib/i18n/navigation";
import { EUROPE_GEO, MAP_H, MAP_W } from "@/components/app/europe-geo";
import styles from "./live-market-command.module.css";

type PublicJob = {
  readonly id: string;
  readonly title: string;
};

type PublicProfession = {
  readonly slug: string;
  readonly label: string;
  readonly totalCount: number | null;
  readonly jobs: readonly PublicJob[];
  readonly basis: "live" | "unavailable";
};

type PublicMarket = {
  readonly activeVacancies: number;
  readonly distinctEmployers: number;
  readonly regions: number;
  readonly lastRefreshedAt: string | null;
  readonly basis: "live" | "measured-floor";
  readonly professions: readonly PublicProfession[];
};

export type LiveMarketCommandLabels = {
  readonly brand: string;
  readonly headline: string;
  readonly eyebrow: string;
  readonly mapLabel: string;
  readonly conceptual: string;
  readonly jobs: string;
  readonly workers: string;
  readonly companies: string;
  readonly vacancies: string;
  readonly employers: string;
  readonly regions: string;
  readonly professionsTitle: string;
  readonly jobsAction: string;
  readonly basisNote: string;
  readonly workerCta: string;
  readonly employerCta: string;
  readonly workerLead: string;
  readonly employerLead: string;
  readonly stages: readonly string[];
  readonly evidenceSteps: readonly string[];
};

type CameraFrame = {
  readonly progress: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
};

const DESKTOP_CAMERA: readonly CameraFrame[] = [
  { progress: 0, scale: 1, x: 0, y: 0 },
  { progress: 0.28, scale: 1.72, x: -32, y: 118 },
  { progress: 0.57, scale: 2.34, x: -55, y: 204 },
  { progress: 0.75, scale: 1.92, x: -35, y: 154 },
  { progress: 1, scale: 1.04, x: 0, y: 0 },
];

const MOBILE_CAMERA: readonly CameraFrame[] = [
  { progress: 0, scale: 1.42, x: 0, y: 38 },
  { progress: 0.28, scale: 2.08, x: -10, y: 150 },
  { progress: 0.57, scale: 2.72, x: -18, y: 235 },
  { progress: 0.75, scale: 2.18, x: -12, y: 175 },
  { progress: 1, scale: 1.48, x: 0, y: 42 },
];

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

function cameraAt(progress: number, mobile: boolean) {
  const frames = mobile ? MOBILE_CAMERA : DESKTOP_CAMERA;
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    if (progress <= to.progress) {
      const local = clamp(
        (progress - from.progress) / (to.progress - from.progress),
      );
      const eased = local * local * (3 - 2 * local);
      return {
        scale: lerp(from.scale, to.scale, eased),
        x: lerp(from.x, to.x, eased),
        y: lerp(from.y, to.y, eased),
      };
    }
  }
  return frames[frames.length - 1];
}

function rankWidth(value: number | null, maximum: number) {
  if (value === null || value <= 0) return 0;
  return Math.max(5, (Math.log1p(value) / Math.log1p(maximum)) * 100);
}

export function LiveMarketCommand({
  locale,
  market,
  labels,
}: {
  readonly locale: string;
  readonly market: PublicMarket;
  readonly labels: LiveMarketCommandLabels;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const userSelectedRef = useRef(false);
  const [selectedSlug, setSelectedSlug] = useState(
    market.professions[0]?.slug ?? "",
  );
  const [chapter, setChapter] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);

  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );
  const selected =
    market.professions.find((profession) => profession.slug === selectedSlug) ??
    market.professions[0];
  const maximum = Math.max(
    1,
    ...market.professions.map((profession) => profession.totalCount ?? 0),
  );
  const selectedCount = selected?.totalCount ?? 0;
  const signalStrength = selected
    ? 0.36 + 0.64 * (selectedCount / maximum)
    : 0.36;

  const selectProfession = useCallback((slug: string, lock = true) => {
    if (lock) {
      userSelectedRef.current = true;
      setInteractionOpen(true);
    }
    setSelectedSlug(slug);
  }, []);

  const detailVisible =
    chapter === 1 || (chapter === 0 && (interactionOpen || reducedMotion));

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || market.professions.length < 2) return;
    let index = Math.max(
      0,
      market.professions.findIndex(
        (profession) => profession.slug === selectedSlug,
      ),
    );
    const timer = window.setInterval(() => {
      if (userSelectedRef.current || progressRef.current > 0.33) return;
      index = (index + 1) % market.professions.length;
      setSelectedSlug(market.professions[index].slug);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [market.professions, reducedMotion, selectedSlug]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      const progress = reducedMotion ? 0 : clamp(-rect.top / distance);
      const camera = cameraAt(progress, window.innerWidth <= 600);
      progressRef.current = progress;
      root.style.setProperty("--camera-x", `${camera.x}px`);
      root.style.setProperty("--camera-y", `${camera.y}px`);
      root.style.setProperty("--camera-scale", `${camera.scale}`);
      root.style.setProperty("--story-progress", `${progress}`);
      const nextChapter = reducedMotion
        ? 0
        : Math.min(3, Math.floor(progress * 4));
      setChapter((current) =>
        current === nextChapter ? current : nextChapter,
      );
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [reducedMotion]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const root = rootRef.current;
    if (!root) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 6;
    root.style.setProperty("--depth-x", `${x}px`);
    root.style.setProperty("--depth-y", `${y}px`);
  };

  const mapStyle = {
    "--signal-strength": signalStrength,
  } as CSSProperties;

  return (
    <main
      ref={rootRef}
      className={styles.journey}
      data-chapter={chapter}
      data-interacted={interactionOpen}
      data-reduced-motion={reducedMotion}
      style={mapStyle}
    >
      <div className={styles.stage} onPointerMove={handlePointerMove}>
        <div className={styles.atmosphere} aria-hidden />

        <div className={styles.mapViewport}>
          <div className={styles.mapCamera}>
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              role="img"
              aria-label={labels.mapLabel}
              className={styles.map}
            >
              <defs>
                <linearGradient id="market-sea" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#0b1e27" />
                  <stop offset="1" stopColor="#071218" />
                </linearGradient>
                <radialGradient id="supply-field" cx="50%" cy="42%" r="68%">
                  <stop offset="0" stopColor="#71d8d0" stopOpacity="0.92" />
                  <stop offset="0.36" stopColor="#269b9a" stopOpacity="0.6" />
                  <stop offset="1" stopColor="#14313a" stopOpacity="0.86" />
                </radialGradient>
                <filter
                  id="supply-glow"
                  x="-80%"
                  y="-80%"
                  width="260%"
                  height="260%"
                >
                  <feGaussianBlur stdDeviation="12" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <clipPath id="sweden-clip">
                  {EUROPE_GEO.filter((country) => country.code === "SE").map(
                    (country) => (
                      <path key={country.name} d={country.d} />
                    ),
                  )}
                </clipPath>
              </defs>

              <rect width={MAP_W} height={MAP_H} fill="url(#market-sea)" />

              <g className={styles.frameCountries}>
                {EUROPE_GEO.filter((country) => country.tier === "frame").map(
                  (country) => (
                    <path key={country.name} d={country.d} />
                  ),
                )}
              </g>
              <g className={styles.contextCountries}>
                {EUROPE_GEO.filter(
                  (country) =>
                    country.tier === "context" ||
                    (country.tier === "target" && country.code !== "SE"),
                ).map((country) => (
                  <path key={country.name} d={country.d} />
                ))}
              </g>

              <g className={styles.swedenField}>
                {EUROPE_GEO.filter((country) => country.code === "SE").map(
                  (country) => (
                    <path
                      key={country.name}
                      d={country.d}
                      className={styles.swedenGlow}
                      filter="url(#supply-glow)"
                    />
                  ),
                )}
                {EUROPE_GEO.filter((country) => country.code === "SE").map(
                  (country) => (
                    <path
                      key={`${country.name}-field`}
                      d={country.d}
                      className={styles.swedenCountry}
                    />
                  ),
                )}
                <g clipPath="url(#sweden-clip)" className={styles.densityBands}>
                  <path d="M390 254 C468 183 565 115 705 64" />
                  <path d="M402 294 C492 231 582 166 714 108" />
                  <path d="M418 327 C515 274 608 216 725 158" />
                </g>
              </g>

              <g className={styles.aggregateSignal}>
                <circle cx="550" cy="176" r="4" />
                <circle
                  cx="550"
                  cy="176"
                  r="12"
                  className={styles.arrivalOne}
                />
                <circle
                  cx="550"
                  cy="176"
                  r="19"
                  className={styles.arrivalTwo}
                />
              </g>

              <g className={styles.marketFlows} aria-hidden>
                <path d="M286 419 C357 336 438 250 544 183" />
                <path d="M777 392 C712 311 641 235 557 181" />
                <path d="M484 575 C476 426 503 294 548 188" />
              </g>

              <g className={styles.marketLabel}>
                <text x="550" y="339" textAnchor="middle">
                  SE
                </text>
                <text x="550" y="362" textAnchor="middle">
                  {selected?.totalCount === null
                    ? "—"
                    : formatter.format(selected?.totalCount ?? 0)}
                </text>
              </g>
            </svg>
          </div>
        </div>

        <header className={styles.header}>
          <Link href="/" className={styles.brand}>
            <span aria-hidden>◒</span>
            {labels.brand}
          </Link>
          <nav aria-label={labels.mapLabel}>
            <Link href="/jobs">{labels.jobs}</Link>
            <Link href="/for-workers">{labels.workers}</Link>
            <Link href="/for-companies">{labels.companies}</Link>
          </nav>
        </header>

        <section className={styles.intro} aria-labelledby="live-market-title">
          <p>{labels.eyebrow}</p>
          <h1 id="live-market-title">{labels.headline}</h1>
        </section>

        <div className={styles.truthLegend} aria-label={labels.eyebrow}>
          <span data-kind="live">{labels.eyebrow}</span>
          <span data-kind="concept">{labels.conceptual}</span>
        </div>

        <section className={styles.marketPulse} aria-label={labels.eyebrow}>
          <span>
            <b>{formatter.format(market.activeVacancies)}</b>
            {labels.vacancies}
          </span>
          <span>
            <b>{formatter.format(market.distinctEmployers)}</b>
            {labels.employers}
          </span>
          <span>
            <b>{formatter.format(market.regions)}</b>
            {labels.regions}
          </span>
          <small>
            {market.lastRefreshedAt ? (
              <time dateTime={market.lastRefreshedAt}>
                {dateFormatter.format(new Date(market.lastRefreshedAt))}
              </time>
            ) : (
              labels.basisNote
            )}
          </small>
        </section>

        <section
          className={styles.professions}
          aria-labelledby="profession-title"
          aria-hidden={chapter >= 2}
        >
          <h2 id="profession-title">{labels.professionsTitle}</h2>
          <ol>
            {market.professions.slice(0, 6).map((profession, index) => (
              <li key={profession.slug}>
                <button
                  type="button"
                  tabIndex={chapter <= 1 ? 0 : -1}
                  aria-pressed={selected?.slug === profession.slug}
                  data-selected={selected?.slug === profession.slug}
                  onPointerEnter={() => {
                    if (!userSelectedRef.current && chapter <= 1) {
                      selectProfession(profession.slug, false);
                    }
                  }}
                  onClick={() => selectProfession(profession.slug)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{profession.label}</strong>
                  <i aria-hidden>
                    <em
                      style={{
                        width: `${rankWidth(profession.totalCount, maximum)}%`,
                      }}
                    />
                  </i>
                  <b>
                    {profession.totalCount === null
                      ? "—"
                      : formatter.format(profession.totalCount)}
                  </b>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {selected ? (
          <aside
            className={styles.professionDetail}
            aria-live="polite"
            aria-hidden={!detailVisible}
          >
            <p>{labels.mapLabel} / SE</p>
            <div>
              <strong>{selected.label}</strong>
              <b>
                {selected.totalCount === null
                  ? "—"
                  : formatter.format(selected.totalCount)}
              </b>
              <span>{labels.vacancies}</span>
            </div>
            <ul>
              {selected.jobs.slice(0, 2).map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}`}
                    tabIndex={detailVisible ? 0 : -1}
                  >
                    {job.title} ↗
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/jobs?profession=${selected.slug}`}
              tabIndex={detailVisible ? 0 : -1}
            >
              {labels.jobsAction} →
            </Link>
          </aside>
        ) : null}

        <section
          className={styles.evidenceLoop}
          aria-label={labels.headline}
          aria-hidden={chapter !== 2}
        >
          <p>{labels.conceptual}</p>
          <ol>
            {labels.evidenceSteps.map((step, index) => (
              <li key={step} style={{ "--step": index } as CSSProperties}>
                <i aria-hidden />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={styles.finalChoice}
          aria-labelledby="market-response-title"
          aria-hidden={chapter !== 3}
        >
          <p>{labels.stages[3]}</p>
          <h2 id="market-response-title">{labels.headline}</h2>
          <div>
            <Link href="/auth/signup" tabIndex={chapter === 3 ? 0 : -1}>
              <span>{labels.workerCta}</span>
              <small>{labels.workerLead}</small>
              <b aria-hidden>↗</b>
            </Link>
            <Link href="/company-need" tabIndex={chapter === 3 ? 0 : -1}>
              <span>{labels.employerCta}</span>
              <small>{labels.employerLead}</small>
              <b aria-hidden>↗</b>
            </Link>
          </div>
        </section>

        <ol className={styles.storyRail} aria-label={labels.mapLabel}>
          {labels.stages.map((stage, index) => (
            <li key={stage} data-active={chapter === index}>
              <i aria-hidden />
              <span>{stage}</span>
            </li>
          ))}
        </ol>

        <p className={styles.scrollCue}>
          <i aria-hidden />
          {labels.stages[Math.min(3, chapter + 1)]}
        </p>
      </div>
    </main>
  );
}
