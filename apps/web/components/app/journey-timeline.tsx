"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useMounted } from "@/lib/use-mounted";

/** 4-step horizontal timeline (vertical < md). Steps fade in sequentially
 *  on scroll-into-view with a 100ms stagger; reduced-motion → instant.
 *  Renders the final state until mounted so SSR/client markup agree. */
export function JourneyTimeline({
  steps,
}: {
  steps: { title: string; desc: string }[];
}) {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { amount: 0.3, once: false });
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const animateIn = mounted && !reduce;

  return (
    <ol
      ref={ref}
      role="list"
      className="relative grid gap-8 md:grid-cols-4 md:gap-4"
    >
      {/* connecting gradient line (desktop only, decorative) */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-brand-blue/10 via-brand-blue/40 to-brand-violet/10 md:block"
      />
      {steps.map((s, i) => (
        <motion.li
          key={s.title}
          role="listitem"
          className="relative"
          initial={false}
          animate={
            !animateIn || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }
          }
          transition={{
            duration: animateIn && inView ? 0.45 : 0,
            ease: "easeOut",
            delay: animateIn && inView ? i * 0.1 : 0,
          }}
        >
          <span
            aria-hidden
            className="relative z-10 inline-grid h-10 w-10 place-items-center rounded-full border-2 border-tier-gold/60 bg-ink-800 font-mono text-sm font-bold text-tier-gold"
          >
            {i + 1}
          </span>
          <h3 className="mt-4 font-display text-base font-semibold tracking-tight text-text-primary">
            {s.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {s.desc}
          </p>
        </motion.li>
      ))}
    </ol>
  );
}
