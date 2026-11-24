"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useMounted } from "@/lib/use-mounted";

/**
 * Scroll-triggered reveal wrapper for landing sections (PR-H global landing).
 *
 * - Server-renders the FINAL visible state (`initial={false}` + mounted gate),
 *   so there is never an opacity:0 SSR flash and LCP text is never JS-gated.
 * - `useReducedMotion()` → no movement, no fade; content is simply visible.
 * - Transform-only animation (opacity + translateY) — no layout shift.
 */
export function Reveal({
  children,
  delay = 0,
  as = "div",
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  as?: "div" | "section" | "li";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25, once: true });
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const animateIn = mounted && !reduce;
  const Tag = (
    as === "section" ? motion.section : as === "li" ? motion.li : motion.div
  ) as typeof motion.div;

  return (
    <Tag
      ref={ref}
      className={className}
      initial={false}
      animate={
        !animateIn || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }
      }
      transition={{
        duration: animateIn && inView ? 0.5 : 0,
        ease: "easeOut",
        delay: animateIn && inView ? delay : 0,
      }}
    >
      {children}
    </Tag>
  );
}
