"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  LivingPrototypeJob,
  LivingPrototypeMarket,
  LivingPrototypeSector,
} from "./_prototype-data";
import styles from "./living-prototypes.module.css";

export type LivingPrototypeProps = {
  readonly locale: string;
  readonly worldOnly: boolean;
  readonly market: LivingPrototypeMarket;
};

export const integer = new Intl.NumberFormat("en-US");

export function useProcessCycle(length: number, durationMs = 2_350): number {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const timer = window.setInterval(
      () => setPhase((current) => (current + 1) % length),
      durationMs,
    );
    return () => window.clearInterval(timer);
  }, [durationMs, length]);

  return phase;
}

export function PrototypeMasthead({
  locale,
  direction,
  market,
}: {
  readonly locale: string;
  readonly direction: "A" | "B" | "C";
  readonly market: LivingPrototypeMarket;
}) {
  return (
    <header className={`${styles.masthead} ${styles.productCopy}`}>
      <Link href={`/${locale}`} className={styles.wordmark}>
        labourmarket.ai
      </Link>
      <p>
        <span>OWNER REVIEW / {direction}</span>
        <b>{market.basis === "live" ? "LIVE PUBLIC SUPPLY" : "MEASURED FLOOR"}</b>
      </p>
      <Link href={`/${locale}/jobs`} className={styles.jobsLink}>
        Open jobs <span aria-hidden>↗</span>
      </Link>
    </header>
  );
}

export function RealityLegend() {
  return (
    <div className={`${styles.realityLegend} ${styles.productCopy}`}>
      <span data-kind="live">public supply</span>
      <span data-kind="process">simulated process motion</span>
      <span data-kind="private">private people remain private</span>
    </div>
  );
}

export function SectorGlyph({
  sector,
  className = "",
}: {
  readonly sector: LivingPrototypeSector["id"];
  readonly className?: string;
}) {
  return (
    <span
      className={`${styles.sectorGlyph} ${className}`}
      data-sector-glyph={sector}
      aria-hidden
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function SectorRail({
  sectors,
  selectedId,
  onSelect,
}: {
  readonly sectors: readonly LivingPrototypeSector[];
  readonly selectedId: string;
  readonly onSelect: (sector: LivingPrototypeSector) => void;
}) {
  return (
    <nav className={`${styles.sectorRail} ${styles.productCopy}`} aria-label="Labour sectors">
      {sectors.map((sector) => (
        <button
          type="button"
          key={sector.id}
          className={sector.id === selectedId ? styles.selectedSector : undefined}
          onClick={() => onSelect(sector)}
        >
          <SectorGlyph sector={sector.id} />
          <span>{sector.label}</span>
          <small>{sector.totalCount === null ? "—" : integer.format(sector.totalCount)}</small>
        </button>
      ))}
    </nav>
  );
}

function jobHref(locale: string, job: LivingPrototypeJob): string {
  return `/${locale}/jobs/${job.id}`;
}

export function OpportunityReadout({
  locale,
  sector,
  phaseLabel,
}: {
  readonly locale: string;
  readonly sector: LivingPrototypeSector;
  readonly phaseLabel: string;
}) {
  const professionHref = `/${locale}/jobs?profession=${encodeURIComponent(
    sector.professionSlug,
  )}`;
  const jobs = useMemo(() => sector.jobs.slice(0, 2), [sector.jobs]);

  return (
    <aside className={`${styles.opportunityReadout} ${styles.productCopy}`}>
      <div className={styles.readoutIdentity}>
        <span>{phaseLabel}</span>
        <strong>{sector.label}</strong>
        <b>
          {sector.totalCount === null ? "Supply unavailable" : integer.format(sector.totalCount)}
          {sector.totalCount !== null && <small> current classified opportunities</small>}
        </b>
      </div>
      <div className={styles.readoutJobs}>
        {jobs.length > 0 ? (
          jobs.map((job) => (
            <Link href={jobHref(locale, job)} key={job.id}>
              {job.title} <span aria-hidden>↗</span>
            </Link>
          ))
        ) : (
          <span>No public titles are available for this profession signal.</span>
        )}
      </div>
      <Link href={professionHref} className={styles.readoutAction}>
        Follow this supply <span aria-hidden>→</span>
      </Link>
    </aside>
  );
}

export function MobileProcessRail({
  sectors,
  phase,
}: {
  readonly sectors: readonly LivingPrototypeSector[];
  readonly phase: number;
}) {
  const visible = sectors.slice(0, 5);
  return (
    <div className={styles.mobileProcessRail} aria-hidden>
      <i className={styles.mobileCurrent} />
      {visible.map((sector, index) => (
        <span
          key={sector.id}
          data-active={phase % visible.length === index}
          style={
            {
              "--mobile-index": index,
              "--mobile-side": index % 2 === 0 ? "35%" : "65%",
            } as React.CSSProperties
          }
        >
          <SectorGlyph sector={sector.id} />
        </span>
      ))}
      <b className={styles.mobileWorker} />
      <b className={styles.mobileEvidence} />
    </div>
  );
}
