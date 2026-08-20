"use client";

import { useState, type PointerEvent } from "react";
import type { LivingPrototypeSector } from "../_prototype-data";
import {
  OpportunityReadout,
  PrototypeMasthead,
  RealityLegend,
  SectorGlyph,
  type LivingPrototypeProps,
  useProcessCycle,
} from "../_prototype-shared";
import styles from "../living-prototypes.module.css";

const DISTRICTS = [
  { id: "agriculture", x: 9, y: 18, z: 0 },
  { id: "manufacturing", x: 35, y: 11, z: 1 },
  { id: "construction", x: 66, y: 8, z: 2 },
  { id: "logistics", x: 12, y: 51, z: 3 },
  { id: "technology", x: 41, y: 44, z: 4 },
  { id: "care", x: 72, y: 42, z: 5 },
  { id: "hospitality", x: 26, y: 74, z: 6 },
  { id: "services", x: 62, y: 72, z: 7 },
] as const;

const PROCESS_LABELS = [
  "need appears",
  "capability responds",
  "team connects",
  "work advances",
  "evidence returns",
  "human confirms",
  "capacity changes",
] as const;

function DistrictScene({ sector }: { readonly sector: LivingPrototypeSector }) {
  return (
    <span className={styles.districtScene} data-sector-scene={sector.id} aria-hidden>
      <span className={styles.sceneGround} />
      <span className={styles.sceneBuilding}>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.sceneMachine}>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.sceneVehicle}>
        <i />
        <i />
      </span>
      <span className={styles.scenePeople}>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.sceneOutput} />
    </span>
  );
}

export function LivingWorkWorld({
  locale,
  worldOnly,
  market,
}: LivingPrototypeProps) {
  const [selected, setSelected] = useState<LivingPrototypeSector>(
    market.sectors.find((sector) => sector.id === "construction") ?? market.sectors[0],
  );
  const phase = useProcessCycle(PROCESS_LABELS.length, 2_100);

  function moveCamera(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--world-tilt-x", `${x * 2.2}deg`);
    event.currentTarget.style.setProperty("--world-tilt-y", `${y * -1.6}deg`);
  }

  return (
    <main
      className={`${styles.prototypeRoot} ${styles.workWorldRoot}`}
      data-world-only={worldOnly}
      data-phase={phase}
    >
      <PrototypeMasthead locale={locale} direction="B" market={market} />

      <section className={styles.workWorldStage} aria-label="Living multi-sector work world">
        <div className={`${styles.directionIntro} ${styles.workWorldIntro} ${styles.productCopy}`}>
          <span>B / LIVING WORK WORLD</span>
          <h1>One economy. Work happening everywhere.</h1>
          <p>
            Needs, people, workplaces and proof move through one continuous operating
            world.
          </p>
        </div>

        <div className={styles.worldViewport} onPointerMove={moveCamera}>
          <div className={styles.worldPlane}>
            <span className={styles.terrainPlate} aria-hidden />
            <svg className={styles.worldRoads} viewBox="0 0 1000 650" aria-hidden>
              <path d="M40 300 C210 235 330 310 470 290 S700 170 950 245" />
              <path d="M160 40 C255 145 250 310 355 420 S605 565 850 590" />
              <path d="M40 520 C220 500 315 480 470 385 S735 325 955 405" />
              <path d="M520 35 C515 155 580 250 650 325 S810 470 930 520" />
            </svg>

            <div className={styles.districts}>
              {DISTRICTS.map((district) => {
                const sector = market.sectors.find((item) => item.id === district.id);
                if (!sector) return null;
                return (
                  <button
                    type="button"
                    className={styles.district}
                    data-sector={sector.id}
                    data-selected={selected.id === sector.id}
                    key={sector.id}
                    style={
                      {
                        "--district-x": `${district.x}%`,
                        "--district-y": `${district.y}%`,
                        "--district-z": district.z,
                        "--district-strength": Math.min(
                          1,
                          Math.max(0.32, (sector.totalCount ?? 0) / 1_500),
                        ),
                      } as React.CSSProperties
                    }
                    onClick={() => setSelected(sector)}
                    aria-label={`Inspect ${sector.label} opportunities`}
                  >
                    <DistrictScene sector={sector} />
                    <span className={`${styles.districtLabel} ${styles.productCopy}`}>
                      <SectorGlyph sector={sector.id} />
                      <b>{sector.activity}</b>
                      <small>{sector.label}</small>
                    </span>
                    <i className={styles.districtSignal} />
                  </button>
                );
              })}
            </div>

            <div className={styles.processChain} aria-hidden>
              <i data-process="need" />
              <i data-process="worker" />
              <i data-process="material" />
              <i data-process="evidence" />
              <i data-process="approval" />
              <span data-process="journal"><b /></span>
            </div>
          </div>
        </div>

        <p className={`${styles.phaseCaption} ${styles.workPhaseCaption} ${styles.productCopy}`}>
          <span>0{phase + 1}</span> {PROCESS_LABELS[phase]}
        </p>

        <div className={`${styles.worldSectorIndex} ${styles.productCopy}`}>
          {market.sectors.map((sector) => (
            <button
              type="button"
              key={sector.id}
              data-selected={selected.id === sector.id}
              onClick={() => setSelected(sector)}
            >
              <span>{sector.label}</span>
              <i />
            </button>
          ))}
        </div>

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
