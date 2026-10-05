"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { Capability, CapabilityId, Chapter, WorkRecord } from "@/lib/design-proof/sample";

import { FOCUS, MAX_HOURS, QUIET, strandPresence, strandWidth } from "./hues";
import { Plate } from "./plate";

/**
 * THE LIVING RECORD — work becoming history, and the reason each capability
 * exists.
 *
 * A Living CV is not a résumé laid out on a screen. It is what accumulates when
 * real work is recorded and someone confirms it, so the page shows THAT:
 *
 *   · Every capability is a STRAND that runs the whole length of the page and
 *     thickens as work accumulates on it. Dotted = the person says so and
 *     nothing shows it yet.
 *   · Every work moment sits on the strands it taught. A dot filled green is a
 *     second party's confirmation; a hollow ring is the person's own record.
 *     A hairline runs from the dots to the moment, so the reason a strand is
 *     thick is always visible next to the photograph that made it so.
 *   · Pointing at a capability lights its strand and quiets everything that did
 *     not build it — the causal chain is one gesture, not a drill-down.
 *   · TODAY → HISTORY is the signature transformation: a moment recorded today
 *     waits as a plate. When it is confirmed, the photograph travels into the
 *     history, lands on its strands, and the strands thicken. The record
 *     visibly changes because of what happened.
 *
 * Motion is state: it plays only when the data changes, and not at all under
 * prefers-reduced-motion (the end state is simply shown).
 */
export type LivingRecordProps = {
  readonly capabilities: readonly Capability[];
  readonly chapters: readonly Chapter[];
  readonly moment: WorkRecord;
  readonly title: string;
  readonly intro: string;
  readonly stamp: string;
  readonly labels: {
    readonly today: string;
    readonly waiting: string;
    readonly confirmedWord: string;
    readonly recordedWord: string;
    readonly confirmAction: string;
    readonly resetAction: string;
    readonly hours: (h: number) => string;
    readonly capabilitiesHeading: string;
    readonly settled: string;
  };
};

const STRAND = (compact: boolean) => (compact ? 13 : 24);

export function LivingRecord(props: LivingRecordProps) {
  const { capabilities, chapters, moment, labels } = props;
  const reduce = useReducedMotion();
  const [confirmed, setConfirmed] = useState(false);
  const [pinned, setPinned] = useState<CapabilityId | null>(null);
  const [hover, setHover] = useState<CapabilityId | null>(null);
  const [compact, setCompact] = useState(false);
  // the moment of confirmation is an event: green for a few seconds, then quiet
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const active = hover ?? pinned;
  const gap = STRAND(compact);
  const gutter = capabilities.length * gap + 10;

  // The history as displayed: newest first, with the moment on top once it has
  // been confirmed.
  const display: Chapter[] = useMemo(() => {
    if (!confirmed) return [...chapters];
    const [first, ...rest] = chapters;
    if (!first) return [];
    return [{ ...first, records: [{ ...moment, confirmed: true }, ...first.records] }, ...rest];
  }, [chapters, confirmed, moment]);

  // Cumulative hours per capability at every record, oldest → newest, so the
  // strands thicken as the work accumulates (and show where each thickening
  // came from).
  const cumulative = useMemo(() => {
    const flat = display.flatMap((c) => c.records).reverse();
    const run: Record<string, number> = {};
    const out = new Map<string, Record<string, number>>();
    for (const r of flat) {
      for (const s of r.skills) run[s] = (run[s] ?? 0) + r.hours;
      out.set(r.id, { ...run });
    }
    return { out, total: { ...run } };
  }, [display]);

  const widthOf = (hours: number | undefined) => strandWidth(hours);
  const ease = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 140, damping: 22, mass: 0.9 };

  return (
    <article className="bg-ink-900 text-text-primary" data-testid="living-record" data-confirmed={confirmed}>
      <div className="mx-auto max-w-[1320px] px-5 pb-32 pt-24 sm:px-8 lg:px-12">
        <header>
          <p className="sig-stamp">{props.stamp}</p>
          <h1
            className="mt-5 font-accent italic leading-[0.98] tracking-[-0.01em] sm:max-w-[16ch]"
            style={{ fontSize: "clamp(2.6rem,7.4vw,6.6rem)" }}
          >
            {props.title}
          </h1>
          <p className="mt-6 max-w-[52ch] text-body text-text-secondary">{props.intro}</p>
        </header>

        {/* THE CAPABILITIES — the strands' names; pointing at one lights it. */}
        <section className="mt-16" aria-label={labels.capabilitiesHeading}>
          <h2 className="sig-stamp">{labels.capabilitiesHeading}</h2>
          <ul className="mt-5 flex flex-wrap gap-x-9 gap-y-3">
            {capabilities.map((c) => {
              const hours = cumulative.total[c.id] ?? 0;
              const isActive = active === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={pinned === c.id}
                    onMouseEnter={() => setHover(c.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(c.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setPinned((p) => (p === c.id ? null : c.id))}
                    className={cn(
                      "group flex min-h-11 flex-col items-start text-left transition-opacity duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                      active && !isActive && "opacity-35",
                    )}
                  >
                    <span
                      aria-hidden
                      className="mb-3 block h-[5px] rounded-full transition-[width] duration-700"
                      style={{
                        width: hours > 0 ? 14 + Math.min(hours, MAX_HOURS) / 5 : 14,
                        background: hours > 0 ? (isActive ? FOCUS : QUIET) : "transparent",
                        opacity: hours > 0 ? (isActive ? 1 : 0.5) : 1,
                        borderTop: hours > 0 ? undefined : "2px dotted rgb(var(--c-text-muted))",
                        height: hours > 0 ? 5 : 0,
                      }}
                    />
                    <span
                      className={cn(
                        "font-display text-[1.7rem] font-semibold leading-none tracking-[-0.03em] transition-colors duration-300 sm:text-[2rem]",
                        hours === 0 ? "text-transparent [-webkit-text-stroke:1px_rgb(var(--c-text-secondary)/0.8)]" : isActive ? "text-brand-blue" : "text-text-primary",
                      )}
                    >
                      {c.label}
                    </span>
                    <motion.span
                      key={hours}
                      initial={reduce ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45 }}
                      className="sig-stamp mt-1.5"
                    >
                      {hours > 0 ? labels.hours(hours) : "—"}
                    </motion.span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <LayoutGroup>
          {/* TODAY — a moment waiting to become history. */}
          <motion.section layout transition={ease} className="mt-20" aria-label={labels.today}>
            {!confirmed ? (
              <div className="relative isolate overflow-hidden" data-testid="moment-waiting">
                <motion.div layoutId="moment-photo" transition={ease} className="absolute inset-0">
                  <Plate image={moment.thumb} decorative className="h-full w-full" position="50% 30%" />
                </motion.div>
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--c-ink-900)/0.95),rgb(var(--c-ink-900)/0.55)_55%,transparent)]" />
                <div aria-hidden className="absolute inset-0 border border-dashed border-text-primary/25" />
                <div className="relative flex min-h-[min(52svh,420px)] flex-col justify-between gap-10 p-6 sm:p-10">
                  <p className="sig-stamp text-text-secondary">{labels.today}</p>
                  <div>
                    <p className="font-display font-bold leading-[0.95] tracking-[-0.04em]" style={{ fontSize: "clamp(2.2rem,5vw,4.2rem)" }}>
                      {moment.text}
                    </p>
                    <p className="sig-stamp mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
                      <span>{labels.hours(moment.hours)}</span>
                      <span aria-hidden>·</span>
                      <span>{labels.recordedWord}</span>
                      <span aria-hidden>·</span>
                      <span>{labels.waiting}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmed(true);
                        setFresh(true);
                        window.setTimeout(() => setFresh(false), 2600);
                        // follow the work into the history: bring the landing into view
                        window.setTimeout(() => {
                          document
                            .querySelector(`[data-record="${moment.id}"]`)
                            ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
                        }, 280);
                      }}
                      data-testid="confirm-moment"
                      className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-full bg-gradient-cta px-7 font-display text-base font-semibold text-text-on-brand transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
                    >
                      {labels.confirmAction}
                      <span aria-hidden>→</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline justify-between gap-6" data-testid="moment-settled">
                <p className={cn("font-accent italic leading-none transition-colors duration-[1800ms]", fresh ? "text-trust-accent" : "text-text-primary/80")} style={{ fontSize: "clamp(1.9rem,3vw,2.6rem)" }}>
                  {labels.settled}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmed(false)}
                  className="sig-stamp min-h-11 underline decoration-text-muted/50 underline-offset-4 hover:text-text-primary"
                >
                  {labels.resetAction}
                </button>
              </div>
            )}
          </motion.section>

          {/* HISTORY — chapters, newest first, on the strands. */}
          <motion.ol layout transition={ease} className="mt-24 flex flex-col" data-testid="record-history">
            {display.map((chapter, ci) => (
              <li key={chapter.id}>
                {/* chapter header */}
                <div className="flex">
                  <Strands
                    capabilities={capabilities}
                    cum={cumulative.out.get(chapter.records.at(-1)?.id ?? "") ?? {}}
                    active={active}
                    gap={gap}
                    gutter={gutter}
                    widthOf={widthOf}
                  />
                  <div className="min-w-0 flex-1 pb-8 pl-4 sm:pl-8">
                    <p className="sig-stamp">{chapter.period}</p>
                    <h2
                      className="mt-2 font-display font-bold leading-[0.9] tracking-[-0.045em]"
                      style={{ fontSize: "clamp(3rem,8vw,6.5rem)" }}
                    >
                      {chapter.place}
                    </h2>
                    <p className="mt-2 font-accent italic leading-none text-text-primary/80" style={{ fontSize: "clamp(1.75rem,2.6vw,2.25rem)" }}>
                      {chapter.role}
                    </p>
                    <Plate
                      image={chapter.plate}
                      decorative
                      position={`${chapter.plate.face.x * 100}% ${chapter.plate.face.y * 100 + 6}%`}
                      className="mt-7 aspect-[21/8] w-full max-sm:aspect-[4/3]"
                      imgClassName="saturate-[0.9]"
                    />
                  </div>
                </div>

                {/* the work moments that built it */}
                <ul>
                  {chapter.records.map((r) => {
                    const dim = active !== null && !r.skills.includes(active);
                    const isNew = confirmed && r.id === moment.id;
                    const dots = capabilities
                      .map((c, i) => ({ c, i }))
                      .filter(({ c }) => r.skills.includes(c.id));
                    return (
                      <li key={r.id} className="flex">
                        <Strands
                          capabilities={capabilities}
                          cum={cumulative.out.get(r.id) ?? {}}
                          active={active}
                          gap={gap}
                          gutter={gutter}
                          widthOf={widthOf}
                          dots={dots.map(({ c, i }) => ({ x: 5 + i * gap + gap / 2, id: c.id }))}
                          confirmed={r.confirmed}
                          pulse={isNew && fresh}
                        />
                        <div
                          className={cn(
                            "flex min-w-0 flex-1 items-start gap-4 pb-9 pl-4 transition-opacity duration-500 sm:gap-6 sm:pl-8",
                            dim && "opacity-25",
                          )}
                          data-record={r.id}
                        >
                          <motion.div
                            layoutId={isNew ? "moment-photo" : undefined}
                            transition={ease}
                            className={cn("relative h-14 w-14 shrink-0 overflow-hidden sm:h-16 sm:w-16", isNew && "sig-settle")}
                          >
                            <Plate image={r.thumb} decorative className="h-full w-full" />
                          </motion.div>
                          <div className="min-w-0">
                            <p className="font-display text-[1.25rem] font-medium leading-tight tracking-[-0.02em] sm:text-[1.5rem]">
                              {r.text}
                            </p>
                            <p className="sig-stamp mt-1.5 flex flex-wrap items-center gap-x-2.5">
                              <span
                                aria-hidden
                                className={cn(
                                  "inline-block h-1.5 w-1.5 rounded-full",
                                  isNew && fresh ? "bg-trust-accent" : r.confirmed ? "bg-text-primary/80" : "border border-text-primary/60",
                                )}
                              />
                              <span>{labels.hours(r.hours)}</span>
                              <span aria-hidden>·</span>
                              <span>{r.confirmed ? labels.confirmedWord : labels.recordedWord}</span>
                            </p>
                            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-support">
                              {r.skills.map((sid) => (
                                <span
                                  key={sid}
                                  className={cn(
                                    "inline-flex items-center gap-2 transition-colors duration-300",
                                    active === sid ? "text-brand-blue" : "text-text-secondary",
                                  )}
                                >
                                  <span aria-hidden className="inline-block h-[3px] w-4 rounded-full bg-current opacity-60" />
                                  {capabilities.find((c) => c.id === sid)?.label}
                                </span>
                              ))}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {ci < display.length - 1 ? <div className="flex"><Strands capabilities={capabilities} cum={cumulative.out.get(chapter.records.at(-1)?.id ?? "") ?? {}} active={active} gap={gap} gutter={gutter} widthOf={widthOf} /><div className="h-16 flex-1" /></div> : null}
              </li>
            ))}
          </motion.ol>
        </LayoutGroup>
      </div>
    </article>
  );
}

/** The strands for one row of the history: the whole height of the row, so
 *  they read as unbroken lines from the first work moment to the last. */
function Strands({
  /* the quiet palette: see hues.ts */
  capabilities,
  cum,
  active,
  gap,
  gutter,
  widthOf,
  dots,
  confirmed,
  pulse,
}: {
  readonly capabilities: readonly Capability[];
  readonly cum: Record<string, number>;
  readonly active: CapabilityId | null;
  readonly gap: number;
  readonly gutter: number;
  readonly widthOf: (h: number | undefined) => number;
  readonly dots?: readonly { x: number; id: CapabilityId }[];
  readonly confirmed?: boolean;
  readonly pulse?: boolean;
}) {
  const minX = dots && dots.length > 0 ? Math.min(...dots.map((d) => d.x)) : null;
  return (
    <div aria-hidden className="relative shrink-0 self-stretch" style={{ width: gutter }}>
      {capabilities.map((c, i) => {
        const w = widthOf(cum[c.id]);
        const x = 5 + i * gap + gap / 2;
        const on = active === c.id;
        const dim = active !== null && !on;
        return w > 0 ? (
          <span
            key={c.id}
            className="sig-strand absolute inset-y-0 rounded-full"
            style={{
              left: x - w / 2,
              width: w,
              opacity: dim ? 0.1 : on ? 1 : strandPresence(cum[c.id]),
              backgroundColor: on ? FOCUS : QUIET,
            }}
          />
        ) : (
          <span
            key={c.id}
            className="absolute inset-y-0 border-l border-dotted border-text-muted/60"
            style={{ left: x, opacity: dim ? 0.2 : 0.8 }}
          />
        );
      })}
      {dots?.map((d) => (
        <span
          key={d.id}
          className={cn(
            "absolute top-3 box-border h-[11px] w-[11px] -translate-x-1/2 rounded-full",
            pulse ? "bg-trust-accent ring-2 ring-ink-900" : confirmed ? "bg-text-primary ring-2 ring-ink-900" : "border-2 border-text-primary/70 bg-ink-900",
            pulse && "sig-settle",
          )}
          style={{ left: d.x, opacity: active !== null && active !== d.id ? 0.25 : 1 }}
        />
      ))}
      {minX !== null ? (
        <span className="absolute top-[1.0625rem] h-px bg-text-primary/25" style={{ left: minX, right: 0 }} />
      ) : null}
    </div>
  );
}
