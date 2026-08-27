"use client";

import { useEffect, useState } from "react";

/** Honours `prefers-reduced-motion`. Every lab scene must degrade to a
 *  composed still frame rather than to a blank box. */
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

/** Coarse device tier used to pick particle / instance budgets. */
export function useDeviceTier(): "mobile" | "laptop" | "desktop" {
  const [tier, setTier] = useState<"mobile" | "laptop" | "desktop">("desktop");
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      setTier(w < 760 ? "mobile" : w < 1400 ? "laptop" : "desktop");
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return tier;
}
