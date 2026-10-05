"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { CapabilityRead } from "@/lib/design-proof/sample";

import { Parallax, Reveal } from "./motion-kit";
import { Plate, type PlateImage } from "./plate";

/**
 * IDENTITY — a person's professional presence, not a record about them.
 *
 * The page opens on the person AT WORK: one photograph bleeds from the right
 * edge into the ground, and the name is set on it at the scale of a title
 * sequence. Below, the three things a visitor wants answered, in the order they
 * ask them:
 *
 *   WHO + WHAT THEY DO        the name, the line, the place
 *   WHAT THEY HAVE PROVEN     capabilities set as TYPE: the size of a line is
 *                             how much work stands behind it, solid type means
 *                             work shows it, OUTLINED type means the person
 *                             says so and nothing shows it yet — no badge, no
 *                             chip, no tier legend. The photographs beside each
 *                             line are the work moments that made it true.
 *   WHAT IS CHANGING          what happened lately, in plain sentences
 *   WHAT IS POSSIBLE NEXT     one editorial sentence and one way forward
 *
 * No card anywhere: hierarchy is scale, space, weight and the photograph.
 */
export type IdentityPresenceProps = {
  readonly person: {
    readonly first: string;
    readonly last: string;
    readonly role: string;
    readonly line: string;
    readonly stamp: string;
  };
  readonly plate: PlateImage;
  readonly reads: readonly CapabilityRead[];
  readonly labels: {
    readonly proven: string;
    readonly changing: string;
    readonly next: string;
    readonly confirmedOf: (confirmed: number, total: number) => string;
    readonly recordedOnly: string;
    readonly declaredOnly: string;
    readonly hours: (h: number) => string;
    readonly records: (n: number) => string;
    readonly confirmed: string;
    readonly recorded: string;
    readonly declared: string;
  };
  readonly changing: readonly { readonly when: string; readonly text: string }[];
  readonly nextStep: { readonly title: string; readonly body: string; readonly cta: string; readonly href: string };
};

const SIZES = [
  "clamp(2.75rem,5.6vw,5rem)",
  "clamp(2.25rem,4.2vw,3.75rem)",
  "clamp(1.9rem,3.3vw,2.9rem)",
  "clamp(1.6rem,2.6vw,2.2rem)",
  "clamp(1.4rem,2.2vw,1.9rem)",
];

const OUTLINE =
  "text-transparent [-webkit-text-stroke:1.25px_rgb(var(--c-text-secondary)/0.8)] [paint-order:stroke_fill]";

export function IdentityPresence({
  person,
  plate,
  reads,
  labels,
  changing,
  nextStep,
}: IdentityPresenceProps) {
  const reduce = useReducedMotion();
  // attention: the capability being inspected — colour follows it, the rest recede
  const [focus, setFocus] = useState<string | null>(null);
  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 46 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 1.1, delay: 0.25 + i * 0.14, ease: [0.2, 0.7, 0.2, 1] as const },
  });
  return (
    <article className="bg-ink-900 text-text-primary" data-testid="identity-presence">
      {/* THE PERSON, AT WORK */}
      <header className="sig-grain relative isolate min-h-[min(92svh,880px)] overflow-hidden">
        <div className="absolute inset-0 overflow-hidden lg:left-[26%] lg:[mask-image:linear-gradient(90deg,transparent_0,rgb(0_0_0/0.55)_14%,black_36%)]">
          <Parallax>
            <Plate image={plate} drift priority decorative className="h-full w-full" />
          </Parallax>
        </div>
        {/* controlled light: a warm key from the right, a fall-off at the edges */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(55%_75%_at_76%_34%,rgb(255_190_120/0.16),transparent_70%)] mix-blend-soft-light"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_100%_at_70%_40%,transparent_55%,rgb(var(--c-ink-900)/0.7)_100%)]"
        />
        {/* the photograph dissolves into the ground on the side the type sits on */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--c-ink-900))_0%,rgb(var(--c-ink-900)/0.94)_24%,rgb(var(--c-ink-900)/0.45)_50%,transparent_74%)] max-lg:hidden"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(0deg,rgb(var(--c-ink-900))_0%,rgb(var(--c-ink-900)/0.86)_26%,transparent_62%)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ink-900/70 to-transparent"
        />

        <div className="relative mx-auto flex min-h-[inherit] max-w-[1320px] flex-col justify-end px-5 pb-12 pt-32 sm:px-8 lg:px-12 lg:pb-16">
          <motion.p className="sig-stamp" {...rise(0)}>{person.stamp}</motion.p>
          <h1
            className="mt-4 font-display leading-[0.84] tracking-[-0.05em]"
            style={{ fontSize: "clamp(4.25rem,13.5vw,11.5rem)" }}
          >
            <motion.span className="block font-bold" {...rise(1)}>{person.first}</motion.span>
            <motion.span className="block font-light text-text-primary/60" {...rise(2)}>{person.last}</motion.span>
          </h1>
          <motion.p
            className="mt-6 max-w-[22ch] font-accent italic leading-[1.05] text-text-primary/90"
            style={{ fontSize: "clamp(1.9rem,3.6vw,3rem)" }}
            {...rise(3)}
          >
            {person.role}
          </motion.p>
          <motion.p className="mt-5 max-w-[46ch] text-body text-text-secondary" {...rise(4)}>
            {person.line}
          </motion.p>
        </div>
      </header>

      {/* PROVEN · CHANGING · NEXT */}
      <div className="mx-auto grid max-w-[1320px] gap-x-20 gap-y-20 px-5 pb-28 pt-6 sm:px-8 lg:grid-cols-12 lg:px-12">
        <section className="lg:col-span-7" aria-labelledby="idp-proven">
          <h2 id="idp-proven" className="sig-stamp mb-2">
            {labels.proven}
          </h2>
          <ul className="flex flex-col">
            {reads.map((r, i) => {
              const size = SIZES[Math.min(i, SIZES.length - 1)];
              const caption =
                r.standing === "confirmed"
                  ? labels.confirmedOf(r.confirmedRecords, r.records)
                  : r.standing === "recorded"
                    ? labels.recordedOnly
                    : labels.declaredOnly;
              const standingWord =
                r.standing === "confirmed" ? labels.confirmed : r.standing === "recorded" ? labels.recorded : labels.declared;
              return (
                <li
                  key={r.capability.id}
                  data-standing={r.standing}
                  onMouseEnter={() => setFocus(r.capability.id)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(r.capability.id)}
                  onBlur={() => setFocus(null)}
                  className={cn(
                    "group border-t py-6 transition-[opacity,border-color] duration-500 first:border-t-0 sm:py-7",
                    focus === r.capability.id ? "border-brand-blue/60" : "border-text-primary/10",
                    focus && focus !== r.capability.id && "opacity-40",
                  )}
                >
                  <Reveal delay={i * 0.08}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
                    <h3
                      className={cn(
                        "font-display font-semibold leading-[0.95] tracking-[-0.035em] transition-colors duration-300",
                        r.standing === "declared" ? OUTLINE : r.standing === "recorded" ? "text-text-primary/85" : "text-text-primary",
                      )}
                      style={{ fontSize: size }}
                    >
                      {r.capability.label}
                    </h3>
                    <p className={cn("sig-stamp flex items-center gap-2 whitespace-nowrap transition-colors duration-500", focus === r.capability.id && "text-brand-blue")}>
                      <span
                        aria-hidden
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full",
                          r.standing === "confirmed" && "bg-text-primary/80",
                          r.standing === "recorded" && "border border-text-primary/60",
                          r.standing === "declared" && "border border-dashed border-text-muted",
                        )}
                      />
                      {standingWord}
                      {r.records > 0 ? <span className="text-text-secondary">· {labels.hours(r.hours)} · {labels.records(r.records)}</span> : null}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    {r.thumbs.length > 0 ? (
                      <span className="flex -space-x-2.5" aria-hidden>
                        {r.thumbs.map((t, k) => (
                          <span key={k} className="relative h-11 w-11 overflow-hidden rounded-[3px] ring-2 ring-ink-900">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={t.small}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover saturate-[0.7] transition duration-500 group-hover:saturate-100"
                              style={{ objectPosition: `${t.face.x * 100}% ${t.face.y * 100}%` }}
                            />
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <p className="max-w-[44ch] text-support text-text-secondary">{caption}</p>
                  </div>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="flex flex-col gap-16 lg:col-span-5 lg:pt-8">
          <section aria-labelledby="idp-changing">
            <h2 id="idp-changing" className="sig-stamp">
              {labels.changing}
            </h2>
            <ol className="mt-6 flex flex-col gap-8">
              {changing.map((c) => (
                <li key={c.when}>
                  <p className="sig-stamp text-text-secondary">{c.when}</p>
                  <p
                    className="mt-1.5 font-accent leading-[1.12] text-text-primary"
                    style={{ fontSize: "clamp(1.75rem,2.3vw,2.1rem)" }}
                  >
                    {c.text}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="idp-next">
            <h2 id="idp-next" className="sig-stamp text-brand-blue">
              {labels.next}
            </h2>
            <p
              className="mt-4 font-accent italic leading-[1.04] text-text-primary"
              style={{ fontSize: "clamp(2.2rem,3.4vw,3.1rem)" }}
            >
              {nextStep.title}
            </p>
            <p className="mt-4 max-w-[40ch] text-body text-text-secondary">{nextStep.body}</p>
            <a
              href={nextStep.href}
              className="mt-6 inline-flex min-h-11 items-center gap-3 border-b border-brand-blue pb-1 font-display text-lg font-semibold text-brand-blue transition-[gap] duration-300 hover:gap-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {nextStep.cta}
              <span aria-hidden>→</span>
            </a>
          </section>
        </aside>
      </div>
    </article>
  );
}
