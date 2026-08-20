"use client";

import { useState } from "react";
import { EUROPE_GEO, MAP_H, MAP_W, project } from "@/components/app/europe-geo";
import type { LivingPrototypeSector } from "../_prototype-data";
import {
  MobileProcessRail,
  OpportunityReadout,
  PrototypeMasthead,
  RealityLegend,
  SectorGlyph,
  SectorRail,
  type LivingPrototypeProps,
  useProcessCycle,
} from "../_prototype-shared";
import styles from "../living-prototypes.module.css";

const WORK_CELLS = [
  { id: "agriculture", x: 20, y: 58 },
  { id: "hospitality", x: 33, y: 65 },
  { id: "services", x: 41, y: 42 },
  { id: "manufacturing", x: 49, y: 55 },
  { id: "technology", x: 57, y: 36 },
  { id: "logistics", x: 63, y: 52 },
  { id: "care", x: 70, y: 27 },
  { id: "construction", x: 77, y: 45 },
] as const;

const PROCESS_LABELS = [
  "employer need",
  "matching supply",
  "team forming",
  "work in motion",
  "evidence recorded",
  "market updated",
] as const;

export function LivingEurope({ locale, worldOnly, market }: LivingPrototypeProps) {
  const [selected, setSelected] = useState<LivingPrototypeSector>(
    market.sectors.find((sector) => sector.id === "logistics") ?? market.sectors[0],
  );
  const phase = useProcessCycle(PROCESS_LABELS.length);
  const sweden = project(18.07, 59.33);

  return (
    <main
      className={`${styles.prototypeRoot} ${styles.europeRoot}`}
      data-world-only={worldOnly}
      data-phase={phase}
    >
      <PrototypeMasthead locale={locale} direction="A" market={market} />

      <section className={styles.europeStage} aria-label="Living Europe labour field">
        <div className={`${styles.directionIntro} ${styles.productCopy}`}>
          <span>A / LIVING EUROPE</span>
          <h1>See the labour market breathe.</h1>
          <p>
            Public demand activates a region. Capability, work and evidence return to the
            same market.
          </p>
        </div>

        <div className={styles.europeAtmosphere} aria-hidden>
          <i />
          <i />
          <i />
        </div>

        <div className={styles.europeField}>
          <svg
            className={styles.europeMap}
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            role="img"
            aria-label="European labour field with active Swedish public supply"
          >
            <defs>
              <linearGradient id="country-material" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#b7ae9a" stopOpacity=".14" />
                <stop offset="1" stopColor="#6e685d" stopOpacity=".04" />
              </linearGradient>
              <radialGradient id="sweden-supply">
                <stop offset="0" stopColor="#edd38d" stopOpacity=".6" />
                <stop offset=".55" stopColor="#b7944b" stopOpacity=".15" />
                <stop offset="1" stopColor="#b7944b" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className={styles.countryMembrane}>
              {EUROPE_GEO.filter((country) => country.tier !== "frame").map(
                (country, index) => (
                  <path
                    d={country.d}
                    key={`${country.code}-${index}`}
                    data-country={country.code}
                    data-tier={country.tier}
                    fill="url(#country-material)"
                  />
                ),
              )}
            </g>
            <circle
              className={styles.swedenAura}
              cx={sweden[0]}
              cy={sweden[1]}
              r="118"
              fill="url(#sweden-supply)"
            />
            <g className={styles.labourCurrents} aria-hidden>
              <path d="M255 450 C350 315 520 278 655 202 C740 155 790 150 856 116" />
              <path d="M160 520 C350 535 470 465 600 402 C720 345 800 300 855 178" />
              <path d="M330 610 C430 570 530 555 645 500 C750 450 805 340 850 210" />
            </g>
          </svg>

          <div className={styles.workCells}>
            {WORK_CELLS.map((cell, index) => {
              const sector = market.sectors.find((item) => item.id === cell.id);
              if (!sector) return null;
              return (
                <button
                  type="button"
                  key={sector.id}
                  className={styles.workCell}
                  data-selected={sector.id === selected.id}
                  style={
                    {
                      "--cell-x": `${cell.x}%`,
                      "--cell-y": `${cell.y}%`,
                      "--cell-index": index,
                      "--cell-strength": Math.min(
                        1,
                        Math.max(0.28, (sector.totalCount ?? 0) / 1_500),
                      ),
                    } as React.CSSProperties
                  }
                  onClick={() => setSelected(sector)}
                  aria-label={`Inspect ${sector.label} public supply`}
                >
                  <SectorGlyph sector={sector.id} />
                  <span className={styles.productCopy}>{sector.label}</span>
                  <i />
                </button>
              );
            })}
          </div>

          <div className={styles.swedenSource} aria-hidden>
            <i />
            <b />
            <span className={styles.productCopy}>SE / CURRENT PUBLIC SUPPLY</span>
          </div>

          <div className={styles.europeProcess} aria-hidden>
            <span data-step="need"><i /></span>
            <span data-step="person"><i /></span>
            <span data-step="team"><i /></span>
            <span data-step="work"><i /></span>
            <span data-step="evidence"><i /></span>
            <span data-step="return"><i /></span>
          </div>

          <MobileProcessRail sectors={market.sectors} phase={phase} />
        </div>

        <p className={`${styles.phaseCaption} ${styles.productCopy}`}>
          <span>0{phase + 1}</span> {PROCESS_LABELS[phase]}
        </p>

        <SectorRail
          sectors={market.sectors}
          selectedId={selected.id}
          onSelect={setSelected}
        />
        <OpportunityReadout
          locale={locale}
          sector={selected}
          phaseLabel={PROCESS_LABELS[phase]}
        />
      </section>

      <RealityLegend />
    </main>
  );
}
