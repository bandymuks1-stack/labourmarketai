"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import { EUROPE_GEO, MAP_H, MAP_W } from "@/components/app/europe-geo";
import type { LivingPrototypeSector } from "../_prototype-data";
import {
  OpportunityReadout,
  PrototypeMasthead,
  RealityLegend,
  SectorGlyph,
  type LivingPrototypeProps,
} from "../_prototype-shared";
import styles from "../living-prototypes.module.css";

const JOURNEY = [
  { label: "MARKET", title: "Europe / active labour supply" },
  { label: "DEMAND", title: "A real need becomes visible" },
  { label: "PEOPLE", title: "Capability meets the requirement" },
  { label: "WORKPLACE", title: "A team enters one project" },
  { label: "WORK", title: "A task changes state" },
  { label: "EVIDENCE", title: "The Journal returns proof" },
  { label: "MARKET", title: "The next opportunity is better informed" },
] as const;

const REGION_POSITIONS = [
  [50, 9],
  [75, 21],
  [86, 50],
  [75, 79],
  [50, 90],
  [25, 79],
  [14, 50],
  [25, 21],
] as const;

export function MarketWork({ locale, worldOnly, market }: LivingPrototypeProps) {
  const trackRef = useRef<HTMLElement>(null);
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [selected, setSelected] = useState<LivingPrototypeSector>(
    market.sectors.find((sector) => sector.id === "care") ?? market.sectors[0],
  );
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = Math.min(JOURNEY.length - 1, Math.floor(value * JOURNEY.length));
    setJourneyIndex((current) => (current === next ? current : next));
  });

  const macroScale = useTransform(scrollYProgress, [0, 0.24, 0.82, 1], [1, 3.6, 3.4, 1]);
  const macroOpacity = useTransform(
    scrollYProgress,
    [0, 0.16, 0.28, 0.78, 0.9, 1],
    [1, 1, 0, 0, 0.45, 1],
  );
  const regionScale = useTransform(scrollYProgress, [0.12, 0.3, 0.52], [1.45, 1, 3.2]);
  const regionOpacity = useTransform(
    scrollYProgress,
    [0.1, 0.19, 0.42, 0.54],
    [0, 1, 1, 0],
  );
  const siteScale = useTransform(scrollYProgress, [0.35, 0.52, 0.72], [1.5, 1, 2.5]);
  const siteOpacity = useTransform(
    scrollYProgress,
    [0.3, 0.4, 0.62, 0.74],
    [0, 1, 1, 0],
  );
  const evidenceScale = useTransform(scrollYProgress, [0.6, 0.77, 0.9], [1.35, 1, 0.7]);
  const evidenceOpacity = useTransform(
    scrollYProgress,
    [0.56, 0.67, 0.82, 0.93],
    [0, 1, 1, 0],
  );
  const cameraX = useTransform(scrollYProgress, [0, 0.35, 0.72, 1], ["0%", "-3%", "4%", "0%"]);
  const cameraY = useTransform(scrollYProgress, [0, 0.35, 0.72, 1], ["0%", "3%", "-4%", "0%"]);

  return (
    <main
      className={`${styles.prototypeRoot} ${styles.marketWorkRoot}`}
      data-world-only={worldOnly}
      data-journey={journeyIndex}
    >
      <PrototypeMasthead locale={locale} direction="C" market={market} />

      <section ref={trackRef} className={styles.zoomTrack} aria-label="Market to work journey">
        <div className={styles.zoomStage}>
          <motion.div className={styles.zoomCamera} style={{ x: cameraX, y: cameraY }}>
            <motion.div
              className={styles.macroLayer}
              style={{ scale: macroScale, opacity: macroOpacity }}
            >
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden>
                <g>
                  {EUROPE_GEO.filter((country) => country.tier !== "frame").map(
                    (country, index) => (
                      <path
                        d={country.d}
                        key={`${country.code}-${index}`}
                        data-country={country.code}
                        data-tier={country.tier}
                      />
                    ),
                  )}
                </g>
              </svg>
              <div className={styles.macroSignals} aria-hidden>
                {market.sectors.map((sector, index) => (
                  <i key={sector.id} style={{ "--signal-index": index } as React.CSSProperties} />
                ))}
              </div>
            </motion.div>

            <motion.div
              className={styles.regionLayer}
              style={{ scale: regionScale, opacity: regionOpacity }}
            >
              <span className={styles.regionTerrain} aria-hidden />
              <span className={styles.regionCore} aria-hidden>
                <i />
                <i />
              </span>
              <div className={styles.regionSectors}>
                {market.sectors.map((sector, index) => (
                  <button
                    type="button"
                    key={sector.id}
                    data-selected={sector.id === selected.id}
                    style={
                      {
                        "--region-x": `${REGION_POSITIONS[index][0]}%`,
                        "--region-y": `${REGION_POSITIONS[index][1]}%`,
                        "--region-index": index,
                      } as React.CSSProperties
                    }
                    onClick={() => setSelected(sector)}
                    aria-label={`Follow ${sector.label} into work`}
                  >
                    <SectorGlyph sector={sector.id} />
                    <span className={styles.productCopy}>{sector.label}</span>
                  </button>
                ))}
              </div>
              <span className={styles.matchingCurrent} aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </motion.div>

            <motion.div
              className={styles.siteLayer}
              style={{ scale: siteScale, opacity: siteOpacity }}
            >
              <span className={styles.siteFloor} aria-hidden />
              <span className={styles.siteStructure} aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className={styles.siteCrane} aria-hidden>
                <i />
                <i />
              </span>
              <span className={styles.siteCrew} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.siteTask} aria-hidden>
                <i />
                <b />
              </span>
              <span className={styles.siteJournalPort} aria-hidden>
                <i />
              </span>
            </motion.div>

            <motion.div
              className={styles.evidenceLayer}
              style={{ scale: evidenceScale, opacity: evidenceOpacity }}
            >
              <span className={styles.evidencePerson} aria-hidden>
                <i />
              </span>
              <span className={styles.evidenceRibbon} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.evidenceRecord} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.humanDecision} aria-hidden>
                <i />
              </span>
              <span className={styles.returnCurrent} aria-hidden>
                <i />
              </span>
            </motion.div>
          </motion.div>

          <div className={`${styles.journeyCopy} ${styles.productCopy}`}>
            <span>C / MARKET ↔ WORK</span>
            <p>{JOURNEY[journeyIndex].label}</p>
            <h1>{JOURNEY[journeyIndex].title}</h1>
            <ol>
              {JOURNEY.map((item, index) => (
                <li key={`${item.label}-${index}`} data-active={index === journeyIndex}>
                  <i />
                  <span>{item.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className={`${styles.zoomTruth} ${styles.productCopy}`}>
            <span>LIVE</span> public vacancy supply
            <span>SIMULATED</span> causal process timing
          </div>

          <OpportunityReadout
            locale={locale}
            sector={selected}
            phaseLabel={JOURNEY[journeyIndex].label.toLowerCase()}
          />

          <p className={`${styles.scrollCue} ${styles.productCopy}`}>
            <i /> Scroll into work
          </p>
        </div>
      </section>

      <RealityLegend />
    </main>
  );
}
