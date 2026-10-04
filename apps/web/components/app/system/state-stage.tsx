"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { Chip, Dashboard } from "@/lib/design-proof/dashboard-model";
import { headlineFor } from "@/lib/design-proof/dashboard-model";

import { EntityCard, resolve } from "./entity";
import { Accented, Eyebrow } from "./ui";

/**
 * THE CURRENT STATE — the dashboard's signature moment.
 *
 * ONE persistent headline ("Three things need you.") stays where it is. Under
 * it the same five objects — people, a project, a team or company — are
 * REARRANGED through four named steps as you scroll:
 *
 *   01 Needs you     the people who are waiting, large, each with what they ask
 *   02 In motion     they gather around the project they belong to
 *   03 What changed  they line up with what just happened to each
 *   04 In the market they step aside; the relevant need comes forward
 *
 * It is the product's own state, not a picture of it: every tile and every
 * chip comes from the same model the operating area below is drawn from, and
 * the accent word in the headline is the live count of what needs the person.
 * On a phone the pin becomes four taps; under prefers-reduced-motion the
 * steps change instantly. Position is a pure function of progress.
 */
type Box = { cx: number; cy: number; w: number; asp: number };

/** [centre x, centre y] as fractions of the stage, width as a fraction of its width, asp = h / w. */
function boxes(step: number, mobile: boolean): Box[] {
  if (!mobile) {
    return [
      [
        { cx: 0.17, cy: 0.5, w: 0.19, asp: 1.25 }, { cx: 0.39, cy: 0.5, w: 0.19, asp: 1.25 }, { cx: 0.61, cy: 0.5, w: 0.19, asp: 1.25 },
        { cx: 0.83, cy: 0.3, w: 0.15, asp: 0.85 }, { cx: 0.83, cy: 0.72, w: 0.15, asp: 0.85 },
      ],
      [
        { cx: 0.1, cy: 0.2, w: 0.075, asp: 1 }, { cx: 0.1, cy: 0.5, w: 0.075, asp: 1 }, { cx: 0.1, cy: 0.8, w: 0.075, asp: 1 },
        { cx: 0.48, cy: 0.5, w: 0.48, asp: 0.58 }, { cx: 0.86, cy: 0.5, w: 0.15, asp: 1 },
      ],
      [
        { cx: 0.2, cy: 0.1, w: 0.07, asp: 1 }, { cx: 0.2, cy: 0.3, w: 0.07, asp: 1 }, { cx: 0.2, cy: 0.5, w: 0.07, asp: 1 },
        { cx: 0.2, cy: 0.7, w: 0.07, asp: 1 }, { cx: 0.2, cy: 0.9, w: 0.07, asp: 1 },
      ],
      [
        { cx: 0.09, cy: 0.2, w: 0.075, asp: 1 }, { cx: 0.09, cy: 0.5, w: 0.075, asp: 1 }, { cx: 0.09, cy: 0.8, w: 0.075, asp: 1 },
        { cx: 0.8, cy: 0.5, w: 0.15, asp: 1 }, { cx: 0.46, cy: 0.5, w: 0.36, asp: 0.7 },
      ],
    ][step]!;
  }
  return [
    [
      { cx: 0.18, cy: 0.2, w: 0.3, asp: 1 }, { cx: 0.5, cy: 0.2, w: 0.3, asp: 1 }, { cx: 0.82, cy: 0.2, w: 0.3, asp: 1 },
      { cx: 0.26, cy: 0.74, w: 0.42, asp: 0.8 }, { cx: 0.74, cy: 0.74, w: 0.42, asp: 0.8 },
    ],
    [
      { cx: 0.2, cy: 0.84, w: 0.2, asp: 1 }, { cx: 0.5, cy: 0.84, w: 0.2, asp: 1 }, { cx: 0.8, cy: 0.84, w: 0.2, asp: 1 },
      { cx: 0.5, cy: 0.36, w: 0.92, asp: 0.5 }, { cx: 0.5, cy: 0.36, w: 0.0, asp: 1 },
    ],
    [
      { cx: 0.1, cy: 0.1, w: 0.12, asp: 1 }, { cx: 0.1, cy: 0.3, w: 0.12, asp: 1 }, { cx: 0.1, cy: 0.5, w: 0.12, asp: 1 },
      { cx: 0.1, cy: 0.7, w: 0.12, asp: 1 }, { cx: 0.1, cy: 0.9, w: 0.12, asp: 1 },
    ],
    [
      { cx: 0.2, cy: 0.88, w: 0.18, asp: 1 }, { cx: 0.5, cy: 0.88, w: 0.18, asp: 1 }, { cx: 0.8, cy: 0.88, w: 0.18, asp: 1 },
      { cx: 0.5, cy: 0.62, w: 0.4, asp: 0.5 }, { cx: 0.5, cy: 0.27, w: 0.92, asp: 0.5 },
    ],
  ][step]!;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** where the chip sits relative to its tile: 0 below, 1 to the right */
const CHIP_SIDE = [0, 1, 1, 1] as const;

export function StateStage({
  model,
  remaining,
  mobile,
  onStep,
}: {
  readonly model: Dashboard;
  readonly remaining: number;
  readonly mobile: boolean;
  readonly onStep?: (s: number) => void;
}) {
  const reduce = useReducedMotion();
  const outer = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const tileEls = useRef<(HTMLDivElement | null)[]>([]);
  const chipEls = useRef<(HTMLDivElement | null)[]>([]);
  const target = useRef(0);
  const cur = useRef(0);
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const modelRef = useRef(model);
  modelRef.current = model;

  // scroll (desktop pin) → target progress 0..1
  useEffect(() => {
    if (mobile) return;
    const on = () => {
      const o = outer.current!;
      const r = o.getBoundingClientRect();
      const span = r.height - window.innerHeight + 64;
      target.current = Math.min(1, Math.max(0, -(r.top - 64) / Math.max(1, span)));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [mobile]);

  const go = (s: number) => {
    if (mobile) { target.current = s / 3; return; }
    const o = outer.current!;
    const r = o.getBoundingClientRect();
    const span = r.height - window.innerHeight + 64;
    window.scrollTo({ top: window.scrollY + r.top - 64 + (s / 3) * span + 2, behavior: reduce ? "auto" : "smooth" });
  };

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      // damped follow: the film catches up to the scroll, never jumps
      cur.current = reduce ? target.current : cur.current + (target.current - cur.current) * 0.14;
      if (Math.abs(target.current - cur.current) < 0.0004) cur.current = target.current;
      const p = cur.current * 3;
      const s0 = Math.min(2, Math.floor(p));
      const u = ease(p - s0);
      const A = boxes(s0, mobile), B = boxes(s0 + 1, mobile);
      const a = area.current!;
      const W = a.clientWidth, H = a.clientHeight;
      const m = modelRef.current;
      m.tiles.forEach((tile, i) => {
        const el = tileEls.current[i]; const ch = chipEls.current[i];
        if (!el || !ch) return;
        const w = lerp(A[i]!.w, B[i]!.w, u) * W;
        const h = w * lerp(A[i]!.asp, B[i]!.asp, u);
        const cx = lerp(A[i]!.cx, B[i]!.cx, u) * W;
        const cy = lerp(A[i]!.cy, B[i]!.cy, u) * H;
        el.style.width = `${w}px`; el.style.height = `${h}px`;
        el.style.transform = `translate3d(${cx - w / 2}px, ${cy - h / 2}px, 0)`;
        el.style.opacity = String(Math.min(1, w / 18));
        const compact = w < (mobile ? 90 : 130) ? "1" : "0";
        el.dataset.compact = compact; ch.dataset.compact = compact;
        // chip: below the tile in step 0, to its right afterwards
        const side = lerp(CHIP_SIDE[s0]!, CHIP_SIDE[s0 + 1]!, u);
        const chx = lerp(cx - w / 2, cx + w / 2 + 14, side);
        const chy = lerp(cy + h / 2 + 10, cy - 14, side);
        ch.style.transform = `translate3d(${chx}px, ${chy}px, 0)`;
        const nearest = Math.round(p);
        ch.style.opacity = String(w < 18 ? 0 : 1);
        Array.from(ch.children).forEach((c, k) => {
          (c as HTMLElement).style.opacity = String(Math.max(0, 1 - Math.abs(p - k) * 2.2));
          (c as HTMLElement).style.visibility = Math.abs(p - k) < 0.46 ? "visible" : "hidden";
        });
        void nearest;
      });
      const st = Math.min(3, Math.round(p));
      if (st !== stepRef.current) { stepRef.current = st; setStep(st); onStep?.(st); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mobile, reduce, onStep]);

  const headline = headlineFor(remaining);
  return (
    <div ref={outer} data-testid="state-stage" data-step={step} className={cn("relative", mobile ? "" : "h-[340svh]")}>
      <div className={cn(mobile ? "relative" : "sticky top-16 h-[calc(100svh-4rem)]", "flex flex-col overflow-hidden px-4 pb-5 pt-7 md:px-10 md:pt-10")}>
        <Eyebrow>{model.date} · {model.actingAs.name}</Eyebrow>
        <h1 className="mt-3 max-w-[16ch] font-display text-[clamp(2.7rem,7.4vw,6.4rem)] font-semibold leading-[0.96] tracking-[-0.05em] md:max-w-none" data-testid="stage-headline">
          <Accented text={headline} />
        </h1>

        {/* the objects */}
        <div ref={area} className={cn("relative mt-4 w-full flex-1", mobile && "min-h-[430px]")}>
          {model.tiles.map((t, i) => (
            <div key={i} ref={(el) => { tileEls.current[i] = el; }} className="absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
              <EntityCard entity={t.entity} aspect="fill" selected={step === 0 && i === 0}>
                <span className="hidden" />
              </EntityCard>
            </div>
          ))}
          {model.tiles.map((t, i) => (
            <div key={`c${i}`} ref={(el) => { chipEls.current[i] = el; }} className="pointer-events-none absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
              {t.chips.map((c: Chip, k) => (
                <div key={k} className={cn("absolute left-0 top-0", mobile ? "w-[30vw] min-w-[110px] whitespace-normal" : "whitespace-nowrap")}>
                  <ChipView chip={c} who={resolve(t.entity).title} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* caption + steps */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <Eyebrow>{model.steps[step]}</Eyebrow>
            <p key={step} className="mt-2 max-w-[44ch] font-accent text-[clamp(1.5rem,2.6vw,2.2rem)] italic leading-[1.1] text-text-primary [animation:rise-in_500ms_var(--motion-ease-out)_both]">
              {model.captions[step]}
            </p>
          </div>
          <div className="flex items-center gap-2" role="tablist" aria-label="Current state steps">
            {model.steps.map((s, i) => (
              <button key={s} type="button" role="tab" aria-selected={step === i} aria-label={s} onClick={() => go(i)} className="flex h-9 w-6 items-center justify-center">
                <span className={cn("block h-2 rounded-full transition-all duration-500", step === i ? "w-6 bg-brand-blue" : "w-2 bg-text-primary/30")} />
              </button>
            ))}
            {!mobile ? <span className="sig-stamp ml-3">Scroll</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipView({ chip, who }: { readonly chip: Chip; readonly who?: string }) {
  const tone = chip.tone ?? "quiet";
  return (
    <span className="flex flex-col items-start gap-1.5">
      <span className="chip-name text-[1.02rem] font-medium leading-none text-text-primary">{who}</span>
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-[18px] px-3.5 py-1 text-[0.88rem] font-medium leading-tight backdrop-blur-sm",
        tone === "action" && "bg-[rgba(212,175,55,0.16)] text-[rgb(235,200,95)] shadow-[inset_0_0_0_1px_rgba(212,175,55,0.5)]",
        tone === "event" && "bg-[rgba(52,211,153,0.12)] text-[rgb(110,231,183)] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.4)]",
        tone === "quiet" && "bg-[rgba(245,241,232,0.07)] text-text-secondary shadow-[inset_0_0_0_1px_rgba(245,241,232,0.12)]",
      )}
    >
      <span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", tone === "action" && "bg-[rgb(235,200,95)]", tone === "event" && "bg-[rgb(52,211,153)]", tone === "quiet" && "bg-text-muted")} />
      {chip.text}
    </span>
    </span>
  );
}
