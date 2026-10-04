"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { Chip, Dashboard } from "@/lib/design-proof/dashboard-model";
import { STATE_TITLES, causalChain, headlineFor } from "@/lib/design-proof/dashboard-model";

import { EntityCard, EntityThumb, resolve } from "./entity";
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
        { cx: 0.1, cy: 0.2, w: 0.1, asp: 1 }, { cx: 0.1, cy: 0.5, w: 0.1, asp: 1 }, { cx: 0.1, cy: 0.8, w: 0.1, asp: 1 },
        { cx: 0.52, cy: 0.5, w: 0.4, asp: 0.62 }, { cx: 0.87, cy: 0.5, w: 0.1, asp: 1 },
      ],
      [
        { cx: 0.12, cy: 0.1, w: 0.07, asp: 1 }, { cx: 0.12, cy: 0.3, w: 0.07, asp: 1 }, { cx: 0.12, cy: 0.5, w: 0.07, asp: 1 },
        { cx: 0.12, cy: 0.7, w: 0.07, asp: 1 }, { cx: 0.12, cy: 0.9, w: 0.07, asp: 1 },
      ],
      [
        { cx: 0.1, cy: 0.2, w: 0.1, asp: 1 }, { cx: 0.1, cy: 0.5, w: 0.1, asp: 1 }, { cx: 0.1, cy: 0.8, w: 0.1, asp: 1 },
        { cx: 0.78, cy: 0.5, w: 0.15, asp: 1 }, { cx: 0.43, cy: 0.5, w: 0.3, asp: 0.7 },
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
  const spokeEls = useRef<(SVGLineElement | null)[]>([]);
  const barEl = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    if (mobile) return;
    let raf = 0;
    const draw = () => {
      // damped follow: the film catches up to the scroll, never jumps
      cur.current = reduce ? target.current : cur.current + (target.current - cur.current) * 0.14;
      if (Math.abs(target.current - cur.current) < 0.0004) cur.current = target.current;
      const p = cur.current * 3;
      const s0 = Math.min(2, Math.floor(p));
      const raw = p - s0;
      const A = boxes(s0, mobile), B = boxes(s0 + 1, mobile);
      const a = area.current;
      if (!a) return;
      const W = a.clientWidth, H = a.clientHeight;
      const m = modelRef.current;
      m.tiles.forEach((tile, i) => {
        const el = tileEls.current[i]; const ch = chipEls.current[i];
        if (!el || !ch) return;
        // each tile leaves a beat after the one before it, so the stage is
        // recomposed in order (people, then the project, then the company)
        const u = ease(Math.min(1, Math.max(0, (raw * 1.5 - i * 0.1))));
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
        const sides = i === 4 ? ([0, 0, 1, 1] as const) : CHIP_SIDE;
        const side = lerp(sides[s0]!, sides[s0 + 1]!, u);
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
      // IN MOTION: the people are connected to the project they belong to
      const mot = Math.max(0, 1 - Math.abs(p - 1) * 2.4);
      const pr = tileEls.current[3];
      const parse = (el: HTMLElement) => {
        const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el.style.transform || "");
        return { x: m ? parseFloat(m[1]!) : 0, y: m ? parseFloat(m[2]!) : 0, w: parseFloat(el.style.width || "0"), h: parseFloat(el.style.height || "0") };
      };
      if (pr) {
        const P = parse(pr);
        [0, 1, 2].forEach((i) => {
          const te = tileEls.current[i]; const ln = spokeEls.current[i];
          if (!te || !ln) return;
          const T = parse(te);
          ln.setAttribute("x1", String(T.x + T.w + 130)); ln.setAttribute("y1", String(T.y + T.h / 2));
          ln.setAttribute("x2", String(P.x)); ln.setAttribute("y2", String(P.y + P.h / 2 + (i - 1) * P.h * 0.22));
          ln.style.opacity = String(mot * 0.7);
        });
        const bar = barEl.current;
        if (bar) { bar.style.opacity = String(mot); bar.style.width = `${P.w}px`; bar.style.transform = `translate3d(${P.x}px, ${P.y + P.h + 10}px, 0)`; }
      }
      const st = Math.min(3, Math.round(p));
      if (st !== stepRef.current) { stepRef.current = st; setStep(st); onStep?.(st); }
      raf = requestAnimationFrame(draw);
    };
    draw();
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mobile, reduce, onStep]);

  const headline = headlineFor(remaining);
  if (mobile) return <MobileStage model={model} headline={headline} />;
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
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
            {[0, 1, 2].map((i) => <line key={i} ref={(el) => { spokeEls.current[i] = el; }} stroke="rgba(235,200,95,0.55)" strokeWidth="1.5" strokeDasharray="2 5" style={{ opacity: 0 }} />)}
          </svg>
          <div ref={barEl} aria-hidden className="pointer-events-none absolute left-0 top-0 h-[4px] overflow-hidden rounded-full bg-text-primary/15" style={{ opacity: 0 }}>
            <div className="h-full rounded-full bg-[rgb(235,200,95)]" style={{ width: `${Math.round((model.motion[0]?.progress ?? 0.06) * 100)}%` }} />
          </div>
          {model.tiles.map((t, i) => (
            <div key={`c${i}`} ref={(el) => { chipEls.current[i] = el; }} className="pointer-events-none absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
              {t.chips.map((c: Chip, k) => (
                <div key={k} className={cn("absolute left-0 top-0", mobile ? "w-[30vw] min-w-[110px] whitespace-normal" : "whitespace-nowrap")}>
                  {k === 2 ? <Chain tile={t} /> : <ChipView chip={c} who={resolve(t.entity).title} />}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* caption + steps */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <p key={step} className="font-display text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-none tracking-[-0.035em] [animation:rise-in_500ms_var(--motion-ease-out)_both]">{STATE_TITLES[step]}</p>
            <p className="mt-2 max-w-[56ch] text-[0.98rem] leading-snug text-text-muted">{model.captions[step]}</p>
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


/**
 * THE MOBILE STAGE — the same four steps, recomposed for a thumb.
 *
 * No pinning. The headline stays; four named steps are tabs under it, and each
 * step is its own fixed composition (not a rearrangement of the desktop one):
 *   01 Needs you      the people who wait, large, swipeable, each with its ask
 *   02 In motion      the project first, then who is in it
 *   03 What changed   a short ledger, identity left, what happened right
 *   04 In the market  the need that fits, large, then the rest
 * Every frame is complete when still; switching is a short cross-fade.
 */
function MobileStage({ model, headline }: { readonly model: Dashboard; readonly headline: string }) {
  const [step, setStep] = useState(0);
  const t = model.tiles;
  const chip = (i: number, k: number) => <ChipView chip={t[i]!.chips[k]!} />;
  return (
    <div data-testid="state-stage" data-step={step} className="px-4 pb-7 pt-7">
      <Eyebrow>{model.date} · {model.actingAs.name}</Eyebrow>
      <h1 className="mt-3 font-display text-[clamp(2.6rem,12vw,3.6rem)] font-semibold leading-[0.96] tracking-[-0.05em]" data-testid="stage-headline">
        <Accented text={headline} />
      </h1>

      <div role="tablist" aria-label="Current state steps" className="-mx-4 mt-6 flex gap-5 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden">
        {model.steps.map((s, i) => (
          <button key={s} type="button" role="tab" aria-selected={step === i} onClick={() => setStep(i)} className={cn("min-h-11 shrink-0 border-b-2 pb-1 text-left transition-colors duration-300", step === i ? "border-brand-blue" : "border-transparent")}>
            <span className={cn("sig-stamp !text-[0.7rem]", step === i ? "!text-[rgba(235,200,95,0.95)]" : "")}>{s}</span>
          </button>
        ))}
      </div>

      <div key={step} className="mt-5 min-h-[400px] [animation:rise-in_420ms_var(--motion-ease-out)_both]">
        {step === 0 ? (
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden">
            {t.map((tile, i) => (
              <li key={i} className="w-[64vw] shrink-0 snap-start">
                <EntityCard entity={tile.entity} aspect="4 / 5" selected={i === 0} />
                <div className="mt-2.5">{chip(i, 0)}</div>
              </li>
            ))}
          </ul>
        ) : null}
        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <EntityCard entity={t[3]!.entity} aspect="16 / 11" selected />
            <div>{chip(3, 1)}</div>
            <ul className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex flex-col gap-2">
                  <EntityCard entity={t[i]!.entity} aspect="1 / 1" />
                  <span className="text-[0.82rem] leading-tight text-text-secondary">{t[i]!.chips[1].text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {step === 2 ? (
          <ul className="flex flex-col">
            {t.map((tile, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr] items-center gap-x-4 border-t border-text-primary/10 py-3.5 first:border-t-0">
                <EntityThumb entity={tile.entity} size={64} />
                <div className="flex flex-col items-start gap-1.5">
                  <span className="font-display text-[1.05rem] font-semibold leading-none tracking-[-0.02em]">{resolve(tile.entity).title}</span>
                  <span className="flex flex-col items-start gap-1">
                    <ChipView chip={{ text: causalChain(tile)[0], tone: "event" }} />
                    <span className="pl-1 text-[0.85rem] text-text-secondary">{causalChain(tile)[1]} · {causalChain(tile)[2]}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <EntityCard entity={t[3]!.entity} aspect="4 / 3" selected />
            <div>{chip(3, 3)}</div>
            <ul className="grid grid-cols-2 gap-3">
              {[4, 0].map((i) => (
                <li key={i} className="flex flex-col gap-2">
                  <EntityCard entity={t[i]!.entity} aspect="1 / 1" />
                  {chip(i, 3)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div key={`c${step}`} className="mt-6 [animation:rise-in_500ms_var(--motion-ease-out)_both]"><p className="font-display text-[1.35rem] font-semibold leading-none tracking-[-0.03em]">{STATE_TITLES[step]}</p><p className="mt-2 max-w-[36ch] text-[0.95rem] leading-snug text-text-muted">{model.captions[step]}</p></div>
    </div>
  );
}


/** A causal chain: what happened -> what it caused -> what that changed. */
function Chain({ tile }: { readonly tile: Dashboard["tiles"][number] }) {
  const [a, b, c] = causalChain(tile);
  return (
    <span className="flex items-center gap-2.5">
      <ChipView chip={{ text: a, tone: "event" }} />
      <span aria-hidden className="h-px w-5 bg-text-primary/35" />
      <span className="text-[0.88rem] text-text-secondary">{b}</span>
      <span aria-hidden className="h-px w-5 bg-text-primary/35" />
      <span className="text-[0.88rem] text-text-secondary">{c}</span>
    </span>
  );
}
