"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * The signature layer's motion, kept small and honest:
 *
 *   Parallax   a photograph sits a little behind the page: it drifts with the
 *              scroll and leans, very slightly, toward the pointer — depth,
 *              not a trick. Absent under prefers-reduced-motion.
 *   Reveal     a block arrives once, as it is scrolled to, then stays.
 */
export function Parallax({
  children,
  className,
  strength = 56,
  lean = 16,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly strength?: number;
  readonly lean?: number;
}) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, reduce ? 0 : strength]);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 60, damping: 18 });
  const ly = useSpring(my, { stiffness: 60, damping: 18 });

  useEffect(() => {
    if (reduce) return;
    const on = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * -lean);
      my.set((e.clientY / window.innerHeight - 0.5) * -lean * 0.6);
    };
    window.addEventListener("pointermove", on);
    return () => window.removeEventListener("pointermove", on);
  }, [reduce, lean, mx, my]);

  return (
    <motion.div style={{ y, x, translateY: ly }} className={cn("absolute -inset-[6%]", className)}>
      {children}
    </motion.div>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.9, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
