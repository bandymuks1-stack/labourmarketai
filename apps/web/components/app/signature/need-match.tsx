"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { CapabilityRead, Requirement } from "@/lib/design-proof/sample";

import { EVENT, FOCUS, QUIET, strandPresence, strandWidth } from "./hues";
import { Plate, type PlateImage } from "./plate";

/**
 * NEED ↔ PERSON — two sides of the market becoming one actionable relationship.
 *
 * Not a vacancy card, not a percentage, not two cards joined by a line. The
 * need and the person stand on either side of a SEAM, and every requirement is
 * a row that crosses it:
 *
 *   what is needed          →  what stands behind it on the other side
 *   ────────────────────────────────────────────────────────────────────
 *   a solid bridge             confirmed work: a second party stands behind it
 *   a dashed bridge            the person's own record, not yet confirmed
 *   two open sockets           nothing shows it yet — and one sentence says
 *                              what would close the gap
 *
 * The bridge is the same STRAND that carries a capability through the Living
 * Record, so evidence looks the same wherever it flows.
 *
 * Expressing interest CLOSES the seam: the two halves come together into one
 * conversation, and the next product states (conversation → agreement →
 * project) follow from it. Each stage is a change of the same composition, not
 * another page.
 */
export type NeedMatchProps = {
  readonly need: {
    readonly title: string;
    readonly place: string;
    readonly org: string;
    readonly starts: string;
    readonly plate: PlateImage;
    readonly requirements: readonly Requirement[];
  };
  readonly person: { readonly name: string; readonly role: string; readonly plate: PlateImage };
  readonly reads: readonly CapabilityRead[];
  readonly labels: {
    readonly sample: string;
    readonly stages: readonly [string, string, string];
    readonly needLabel: string;
    readonly personLabel: string;
    readonly hours: (h: number) => string;
    readonly records: (n: number) => string;
    readonly confirmed: string;
    readonly recordedOnly: string;
    readonly notShown: string;
    readonly closeWith: Record<string, string>;
    readonly recordIt: string;
    readonly relates: (strong: number, partial: number, total: number) => string;
    readonly missing: (n: number) => string;
    readonly express: string;
    readonly matchedTitle: string;
    readonly matchedStamp: string;
    readonly agenda: readonly { readonly id: string; readonly text: string }[];
    readonly agenda_heading: string;
    readonly agree: string;
    readonly agreedTitle: string;
    readonly agreedStamp: string;
    readonly agreedLine: string;
    readonly reset: string;
  };
};

type Strength = "strong" | "partial" | "missing";
type Stage = 0 | 1 | 2;

export function NeedMatch({ need, person, reads, labels }: NeedMatchProps) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>(0);
  // attention: the requirement being inspected (gold follows it)
  const [focus, setFocus] = useState<string | null>(null);
  // the moment the seam closes, the bridges carry energy across, then quiet
  const [flash, setFlash] = useState(false);

  const rows = need.requirements.map((req) => {
    const read = reads.find((r) => r.capability.id === req.capability);
    const strength: Strength =
      !read || read.records === 0 ? "missing" : read.standing === "confirmed" ? "strong" : "partial";
    return { req, read, strength };
  });
  const strong = rows.filter((r) => r.strength === "strong").length;
  const partial = rows.filter((r) => r.strength === "partial").length;
  const missing = rows.filter((r) => r.strength === "missing").length;

  const dur = reduce ? 0 : 0.7;

  return (
    <article
      className="bg-ink-900 text-text-primary"
      data-testid="need-match"
      data-stage={stage}
      style={{ ["--nm-seam" as string]: stage === 0 ? "8rem" : "0rem" }}
    >
      <div className="mx-auto max-w-[1320px] px-5 pb-32 pt-24 sm:px-8 lg:px-12">
        {/* the stages of one relationship */}
        <ol className="sig-stamp flex flex-wrap gap-x-8 gap-y-2" aria-label="Stages">
          {labels.stages.map((s, i) => (
            <li
              key={s}
              aria-current={i === stage ? "step" : undefined}
              className={cn("border-b pb-1 transition-colors duration-500", i === stage ? "border-brand-blue text-brand-blue" : i < stage ? "border-text-primary/30 text-text-secondary" : "border-transparent")}
            >
              {s}
            </li>
          ))}
          <li className="ml-auto text-text-muted">{labels.sample}</li>
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          {stage < 2 ? (
            <motion.div
              key="seam"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: dur * 0.6 }}
            >
              <h1
                className="mt-10 max-w-[18ch] font-accent italic leading-[0.98] tracking-[-0.01em]"
                style={{ fontSize: "clamp(3rem,7.2vw,6.4rem)" }}
              >
                {stage === 0 ? `${need.title} in ${need.place}.` : labels.matchedTitle}
              </h1>
              <p className="sig-stamp mt-6">
                {stage === 0 ? `${need.org} · ${need.starts}` : labels.matchedStamp}
              </p>

              {/* the two sides */}
              <div className="nm-row mt-14 items-end gap-y-8">
                <Side image={need.plate} label={labels.needLabel} title={`${need.org}`} sub={`${need.place} · ${need.starts}`} position="50% 55%" zoom={2.5} zoomOrigin="0% 78%" edge="right" />
                <div aria-hidden className="max-md:hidden" />
                <Side image={person.plate} label={labels.personLabel} title={person.name} sub={person.role} position="50% 28%" accent edge="left" />
              </div>

              {/* the requirements, each crossing the seam */}
              <ul className="mt-10">
                {rows.map(({ req, read, strength }) => (
                  <li
                    key={req.id}
                    data-strength={strength}
                    onMouseEnter={() => setFocus(req.id)}
                    onMouseLeave={() => setFocus(null)}
                    onFocus={() => setFocus(req.id)}
                    onBlur={() => setFocus(null)}
                    className={cn("nm-row items-stretch border-t py-7 transition-[opacity,border-color] duration-500", focus === req.id ? "border-brand-blue/60" : "border-text-primary/10", focus && focus !== req.id && "opacity-45")}
                  >
                    <div className="pr-6">
                      <p className="font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: "clamp(1.6rem,2.6vw,2.35rem)" }}>
                        {req.text}
                      </p>
                      <p className="mt-2 text-support text-text-muted">{req.detail}</p>
                    </div>

                    <Bridge strength={strength} closed={stage > 0} on={focus === req.id || flash} hours={read?.hours} thickness={strandWidth(read?.hours, 2, 12)} />

                    <div className="md:pl-6">
                      {strength === "missing" ? (
                        <>
                          <p
                            className="font-display font-semibold leading-[1.02] tracking-[-0.03em] text-transparent [-webkit-text-stroke:1.25px_rgb(var(--c-text-secondary)/0.8)]"
                            style={{ fontSize: "clamp(1.6rem,2.6vw,2.35rem)" }}
                          >
                            {labels.notShown}
                          </p>
                          <p className="mt-2 max-w-[38ch] text-support text-text-secondary">
                            {labels.closeWith[req.id]}
                          </p>
                          <a href="#record" className="mt-3 inline-flex min-h-11 items-center gap-2 border-b border-brand-blue/70 pb-0.5 text-support font-semibold text-brand-blue">
                            {labels.recordIt} <span aria-hidden>→</span>
                          </a>
                        </>
                      ) : read ? (
                        <>
                          <p className="font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: "clamp(1.6rem,2.6vw,2.35rem)" }}>
                            {labels.hours(read.hours)}
                          </p>
                          <p className="sig-stamp mt-2 flex flex-wrap items-center gap-x-2.5">
                            <span
                              aria-hidden
                              className={cn("inline-block h-1.5 w-1.5 rounded-full", strength === "strong" ? "bg-text-primary/80" : "border border-text-primary/60")}
                            />
                            <span>{strength === "strong" ? labels.confirmed : labels.recordedOnly}</span>
                            <span aria-hidden>·</span>
                            <span>{labels.records(read.records)}</span>
                          </p>
                          <span className="mt-4 flex -space-x-2.5" aria-hidden>
                            {read.thumbs.map((t, k) => (
                              <span key={k} className="relative h-10 w-10 overflow-hidden rounded-[3px] ring-2 ring-ink-900">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={t.small} alt="" loading="lazy" className="h-full w-full object-cover saturate-[0.85]" style={{ objectPosition: `${t.face.x * 100}% ${t.face.y * 100}%` }} />
                              </span>
                            ))}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>

              {/* why it relates · what is missing · what happens next */}
              <div className="mt-16 grid gap-x-16 gap-y-10 border-t border-text-primary/10 pt-12 md:grid-cols-12">
                <p className="font-accent leading-[1.08] md:col-span-7" style={{ fontSize: "clamp(1.9rem,3vw,2.7rem)" }}>
                  {labels.relates(strong, partial, rows.length)}
                </p>
                <div className="flex flex-col items-start gap-5 md:col-span-5">
                  {missing > 0 ? <p className="sig-stamp">{labels.missing(missing)}</p> : null}
                  {stage === 0 ? (
                    <button
                      type="button"
                      data-testid="express-interest"
                      onClick={() => {
                        // first the energy crosses the seam (gold), then the seam closes
                        setFlash(true);
                        window.setTimeout(() => setStage(1), 800);
                        window.setTimeout(() => setFlash(false), 1700);
                      }}
                      className="inline-flex min-h-14 items-center gap-3 rounded-full bg-gradient-cta px-9 font-display text-lg font-semibold text-text-on-brand transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
                    >
                      {labels.express} <span aria-hidden>→</span>
                    </button>
                  ) : null}
                </div>
              </div>

              {/* conversation — the context that forms when the seam closes */}
              <AnimatePresence>
                {stage === 1 ? (
                  <motion.section
                    key="conversation"
                    initial={reduce ? false : { opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur, delay: reduce ? 0 : 0.5 }}
                    className="mt-16 grid gap-x-16 gap-y-8 md:grid-cols-12"
                    aria-label={labels.agenda_heading}
                  >
                    <p className="sig-stamp text-brand-blue md:col-span-12">{labels.agenda_heading}</p>
                    <ul className="md:col-span-7">
                      {labels.agenda.map((a, i) => (
                        <li key={a.id} className="flex items-baseline gap-5 border-t border-text-primary/10 py-5">
                          <span className="sig-stamp w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                          <span className="font-display text-[1.5rem] font-medium leading-tight tracking-[-0.02em] sm:text-[1.9rem]">{a.text}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="md:col-span-5">
                      <button
                        type="button"
                        data-testid="agree-terms"
                        onClick={() => setStage(2)}
                        className="inline-flex min-h-14 items-center gap-3 rounded-full bg-gradient-cta px-9 font-display text-lg font-semibold text-text-on-brand transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
                      >
                        {labels.agree} <span aria-hidden>→</span>
                      </button>
                    </div>
                  </motion.section>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.section
              key="agreed"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: dur }}
              className="mt-10"
              data-testid="agreed"
            >
              <div className="sig-grain relative isolate left-1/2 w-screen -translate-x-1/2 overflow-hidden">
                <Plate image={need.plate} decorative drift className="absolute inset-0" position="50% 50%" />
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(0deg,rgb(var(--c-ink-900))_0%,rgb(var(--c-ink-900)/0.55)_45%,rgb(var(--c-ink-900)/0.2)_100%)]" />
                <div className="relative mx-auto flex min-h-[min(82svh,760px)] max-w-[1320px] flex-col justify-end px-5 pb-14 sm:px-8 lg:px-12">
                  <p className="sig-stamp text-brand-blue">{labels.agreedStamp}</p>
                  <h1 className="mt-5 max-w-[14ch] font-accent italic leading-[0.96]" style={{ fontSize: "clamp(3.2rem,8vw,7.4rem)" }}>
                    {labels.agreedTitle}
                  </h1>
                  <p className="mt-6 max-w-[48ch] text-body text-text-secondary">{labels.agreedLine}</p>
                  <button
                    type="button"
                    onClick={() => setStage(0)}
                    className="sig-stamp mt-8 min-h-11 self-start underline decoration-text-muted/50 underline-offset-4 hover:text-text-primary"
                  >
                    {labels.reset}
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </article>
  );
}

function Side({
  image,
  label,
  title,
  sub,
  position,
  zoom,
  zoomOrigin,
  edge,
  accent = false,
}: {
  readonly image: PlateImage;
  readonly label: string;
  readonly title: string;
  readonly sub: string;
  readonly position: string;
  readonly zoom?: number;
  readonly zoomOrigin?: string;
  /** The edge that dissolves toward the seam. */
  readonly edge: "left" | "right";
  readonly accent?: boolean;
}) {
  // The photograph has no frame: it dissolves toward the seam and into the
  // ground beneath, so the two sides read as one scene being joined.
  const x = edge === "right" ? "linear-gradient(90deg,black 62%,transparent 100%)" : "linear-gradient(270deg,black 62%,transparent 100%)";
  return (
    <div className="relative isolate">
      <div style={{ maskImage: x, WebkitMaskImage: x }} className="max-md:![mask-image:none]">
        <div
          style={{ maskImage: "linear-gradient(180deg,black 58%,transparent 100%)", WebkitMaskImage: "linear-gradient(180deg,black 58%,transparent 100%)" }}
        >
          <Plate
            image={image}
            decorative
            position={position}
            zoom={zoom}
            zoomOrigin={zoomOrigin}
            className="aspect-[4/3] w-full max-md:aspect-[16/10]"
            imgClassName="saturate-[0.92]"
          />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
        <p className="sig-stamp">{label}</p>
        <p className="mt-2 font-display text-[1.9rem] font-bold leading-none tracking-[-0.04em] sm:text-[2.6rem]">{title}</p>
        <p className={cn("mt-1.5", accent ? "font-accent italic text-[1.75rem] leading-none text-text-primary/85" : "text-support text-text-secondary")}>{sub}</p>
      </div>
    </div>
  );
}

/** The bridge across the seam. The same strand that carries a capability
 *  through the Living Record: solid = confirmed work stands behind it; dashed
 *  = the person's own record; two open sockets = nothing shows it yet. */
function Bridge({
  strength,
  closed,
  on,
  hours,
  thickness,
}: {
  readonly strength: Strength;
  /** The seam has closed: the bridge has done its work and steps away. */
  readonly closed: boolean;
  /** Attention is here (or energy is crossing): the bridge takes the focus colour. */
  readonly on: boolean;
  readonly hours?: number;
  /** px — the same strand thickness the Living Record draws for this work. */
  readonly thickness: number;
}) {
  const t = Math.max(2, Math.round(thickness));
  const color = on ? FOCUS : QUIET;
  const presence = on ? 1 : Math.max(0.45, strandPresence(hours) + 0.15);
  return (
    <div aria-hidden className={cn("relative flex items-center justify-center transition-opacity duration-300 max-md:h-9 md:min-h-[2rem]", closed && "opacity-0")} data-bridge={strength}>
      {strength === "strong" ? (
        <>
          <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full transition-[background-color,opacity] duration-500 max-md:hidden" style={{ height: t, background: color, opacity: presence }} />
          <span className="absolute bottom-0 top-0 left-1/2 -translate-x-1/2 rounded-full transition-[background-color,opacity] duration-500 md:hidden" style={{ width: t, background: color, opacity: presence }} />
          <span className="relative z-10 h-3 w-3 rounded-full ring-4 ring-ink-900 transition-colors duration-500" style={{ background: on ? EVENT : QUIET, opacity: on ? 1 : 0.85 }} />
        </>
      ) : strength === "partial" ? (
        <>
          <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 transition-colors duration-500 max-md:hidden" style={{ height: 0, borderTop: `${Math.max(2, Math.round(t / 2))}px dashed ${color}`, opacity: on ? 1 : 0.5 }} />
          <span className="absolute bottom-0 top-0 left-1/2 -translate-x-1/2 transition-colors duration-500 md:hidden" style={{ width: 0, borderLeft: `${Math.max(2, Math.round(t / 2))}px dashed ${color}`, opacity: on ? 1 : 0.5 }} />
          <span className="relative z-10 h-3 w-3 rounded-full border-2 bg-ink-900 transition-colors duration-500" style={{ borderColor: on ? FOCUS : "rgb(var(--c-text-primary) / 0.65)" }} />
        </>
      ) : (
        <>
          <span className="absolute left-0 top-1/2 h-px w-[22%] -translate-y-1/2 bg-text-primary/30 max-md:hidden" />
          <span className="absolute right-0 top-1/2 h-px w-[22%] -translate-y-1/2 bg-text-primary/30 max-md:hidden" />
          <span className="absolute left-[22%] top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-ink-900 max-md:hidden" style={{ borderColor: on ? FOCUS : "rgb(var(--c-text-muted))" }} />
          <span className="absolute right-[22%] top-1/2 h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rounded-full border bg-ink-900 max-md:hidden" style={{ borderColor: on ? FOCUS : "rgb(var(--c-text-muted))" }} />
          <span className="relative z-10 h-2.5 w-2.5 rounded-full border border-text-muted bg-ink-900 md:hidden" />
        </>
      )}
    </div>
  );
}
