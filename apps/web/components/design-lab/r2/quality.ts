"use client";

import { useEffect, useState } from "react";

/**
 * ROUND 2 — one budget table, three concepts.
 *
 * "Adaptive quality" is worthless as an adjective, so it is a NUMBER here:
 * every expensive thing a scene builds reads its count from this table, and
 * a phone gets the same STORY with a smaller budget rather than a cut-down
 * story. Nothing in a scene is allowed to invent its own magic number.
 */
export type Tier = "mobile" | "laptop" | "desktop";

export type Budget = {
  readonly tier: Tier;
  /** points in the C1 presence field */
  readonly particles: number;
  /** strands in the C2 flow volume */
  readonly strands: number;
  /** history samples per strand */
  readonly strandLength: number;
  /** capability forms in the C3 assembly */
  readonly forms: number;
  /** how many of those may be genuinely refractive (transmission is costly) */
  readonly refractive: number;
  /** device pixel ratio ceiling */
  readonly dpr: number;
  /** bloom is the first thing to go */
  readonly bloom: boolean;
  readonly shadows: boolean;
};

const BUDGETS: Record<Tier, Budget> = {
  desktop: {
    tier: "desktop",
    particles: 58_000,
    strands: 1300,
    strandLength: 38,
    forms: 40,
    refractive: 0,
    dpr: 1.75,
    bloom: true,
    shadows: true,
  },
  laptop: {
    tier: "laptop",
    particles: 34_000,
    strands: 900,
    strandLength: 32,
    forms: 32,
    refractive: 0,
    dpr: 1.5,
    bloom: true,
    shadows: true,
  },
  mobile: {
    tier: "mobile",
    particles: 16_000,
    strands: 380,
    strandLength: 22,
    forms: 26,
    refractive: 0,
    dpr: 1.35,
    bloom: false,
    shadows: false,
  },
};

function detect(): Tier {
  if (typeof window === "undefined") return "laptop";
  const w = window.innerWidth;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (w < 820 || coarse) return "mobile";
  if (w < 1500 || cores <= 4) return "laptop";
  return "desktop";
}

export function useBudget(): Budget {
  const [tier, setTier] = useState<Tier>("laptop");
  useEffect(() => {
    const apply = () => setTier(detect());
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return BUDGETS[tier];
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}
