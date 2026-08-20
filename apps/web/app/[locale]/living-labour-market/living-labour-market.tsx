"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/i18n/navigation";
import {
  drawLivingWorld,
  type WorldSectorId,
  type WorldSector,
  WORLD_CANVAS_BUDGET,
} from "./living-world-canvas";
import styles from "./living-labour-market.module.css";

type PublicJob = {
  readonly id: string;
  readonly title: string;
};

type PublicSector = WorldSector & {
  readonly professionSlug: string;
  readonly jobs: readonly PublicJob[];
  readonly basis: "live" | "unavailable";
};

type PublicMarket = {
  readonly activeVacancies: number;
  readonly distinctEmployers: number;
  readonly regions: number;
  readonly lastRefreshedAt: string | null;
  readonly basis: "live" | "measured-floor";
  readonly sectors: readonly PublicSector[];
};

export type LivingMarketLabels = {
  readonly headline: string;
  readonly subline: string;
  readonly openJobs: string;
  readonly workers: string;
  readonly companies: string;
  readonly live: string;
  readonly illustrative: string;
  readonly vacancies: string;
  readonly employers: string;
  readonly regions: string;
  readonly dataNote: string;
  readonly inspectHint: string;
  readonly opportunityAction: string;
  readonly stages: readonly string[];
  readonly canvasLabel: string;
};

export function LivingLabourMarket({
  locale,
  market,
  labels,
  worldOnly,
}: {
  readonly locale: string;
  readonly market: PublicMarket;
  readonly labels: LivingMarketLabels;
  readonly worldOnly: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const dirtyRef = useRef(true);
  const userSelectedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<WorldSectorId>("construction");
  const [chapter, setChapter] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const selected =
    market.sectors.find((sector) => sector.id === selectedId) ??
    market.sectors[0];
  const nonEmptySectors = useMemo(
    () => market.sectors.filter((sector) => (sector.totalCount ?? 0) > 0),
    [market.sectors],
  );

  const selectSector = useCallback((id: WorldSectorId) => {
    userSelectedRef.current = true;
    setSelectedId(id);
    setExpanded(true);
    dirtyRef.current = true;
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReducedMotion(query.matches);
      dirtyRef.current = true;
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || nonEmptySectors.length < 2) return;
    let index = Math.max(
      0,
      nonEmptySectors.findIndex((sector) => sector.id === selectedId),
    );
    const timer = window.setInterval(() => {
      if (userSelectedRef.current || progressRef.current >= 0.12) return;
      index = (index + 1) % nonEmptySectors.length;
      setSelectedId(nonEmptySectors[index].id);
      dirtyRef.current = true;
    }, 7200);
    return () => window.clearInterval(timer);
  }, [nonEmptySectors, reducedMotion, selectedId]);

  useEffect(() => {
    const update = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / distance));
      progressRef.current = reducedMotion ? 0 : progress;
      const nextChapter = reducedMotion
        ? 0
        : Math.min(
            labels.stages.length - 1,
            Math.floor(progress * labels.stages.length),
          );
      setChapter((current) =>
        current === nextChapter ? current : nextChapter,
      );
      dirtyRef.current = true;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [labels.stages.length, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let raf = 0;
    let lastDraw = -Infinity;
    let visible = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      pixelRatio = Math.min(
        WORLD_CANVAS_BUDGET.maxDevicePixelRatio,
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      dirtyRef.current = true;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        dirtyRef.current = true;
      },
      { rootMargin: "100px" },
    );
    intersection.observe(canvas);
    resize();

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      if (!visible || document.visibilityState === "hidden") return;
      const frameInterval = 1000 / WORLD_CANVAS_BUDGET.targetFramesPerSecond;
      if (!reducedMotion && now - lastDraw < frameInterval) return;
      if (reducedMotion && !dirtyRef.current) return;
      lastDraw = now;
      dirtyRef.current = false;
      drawLivingWorld({
        ctx,
        width,
        height,
        pixelRatio,
        time: reducedMotion ? 0 : now,
        progress: progressRef.current,
        pointerX: pointerRef.current.x,
        pointerY: pointerRef.current.y,
        selected: selectedId,
        sectors: market.sectors,
        reducedMotion,
        hideLabels: worldOnly,
      });
      setCanvasReady(true);
    };
    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
    };
  }, [market.sectors, reducedMotion, selectedId, worldOnly]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    };
  };

  const visibleJobs = expanded ? selected.jobs : selected.jobs.slice(0, 1);

  return (
    <main
      ref={rootRef}
      className={styles.journey}
      data-chapter={chapter}
      data-reduced-motion={reducedMotion}
      data-world-only={worldOnly}
      data-canvas-ready={canvasReady}
    >
      <div className={styles.stage} onPointerMove={handlePointerMove}>
        <canvas
          ref={canvasRef}
          className={styles.world}
          aria-label={labels.canvasLabel}
        />

        <header className={styles.header}>
          <Link href="/" className={styles.brand}>
            <span aria-hidden>◒</span> labourmarket.ai
          </Link>
          <nav aria-label="Primary">
            <Link href="/for-workers">{labels.workers}</Link>
            <Link href="/for-companies">{labels.companies}</Link>
            <Link href="/jobs" className={styles.jobsLink}>
              {labels.openJobs} <span aria-hidden>↗</span>
            </Link>
          </nav>
        </header>

        <section className={styles.intro} aria-labelledby="living-market-title">
          <p>labourmarket.ai / SE</p>
          <h1 id="living-market-title">{labels.headline}</h1>
          <span>{labels.subline}</span>
        </section>

        <div className={styles.truthLegend} aria-label="Data status">
          <span data-kind="live">
            {market.basis === "live" ? labels.live : labels.dataNote}
          </span>
          <span data-kind="illustrative">{labels.illustrative}</span>
        </div>

        <div className={styles.marketTotals} aria-label={labels.live}>
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
        </div>

        <ol className={styles.chapterRail} aria-label={labels.canvasLabel}>
          {labels.stages.map((stage, index) => (
            <li key={stage} data-active={chapter === index}>
              <i aria-hidden />
              <span>{stage}</span>
            </li>
          ))}
        </ol>

        <nav className={styles.sectorDock} aria-label={labels.inspectHint}>
          {market.sectors.map((sector) => (
            <button
              key={sector.id}
              type="button"
              data-sector={sector.id}
              data-selected={selectedId === sector.id}
              aria-pressed={selectedId === sector.id}
              onClick={() => selectSector(sector.id)}
            >
              <i aria-hidden />
              <span>{sector.label}</span>
              <b>
                {sector.totalCount === null
                  ? "—"
                  : formatter.format(sector.totalCount)}
              </b>
            </button>
          ))}
        </nav>

        <aside className={styles.readout} aria-live="polite">
          <div className={styles.readoutHeading}>
            <span>
              {market.basis === "live" ? labels.live : labels.dataNote}
            </span>
            <strong>{selected.label}</strong>
            <b>
              {selected.totalCount === null
                ? "—"
                : formatter.format(selected.totalCount)}
            </b>
            <small>{labels.vacancies}</small>
          </div>
          <div className={styles.jobLinks}>
            {visibleJobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                {job.title} <span aria-hidden>↗</span>
              </Link>
            ))}
            <Link href={`/jobs?profession=${selected.professionSlug}`}>
              {labels.opportunityAction} <span aria-hidden>→</span>
            </Link>
          </div>
        </aside>

        <p className={styles.scrollCue}>
          <i aria-hidden />
          {labels.stages[Math.min(chapter + 1, labels.stages.length - 1)]}
        </p>
      </div>
    </main>
  );
}
