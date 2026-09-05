"use client";

/**
 * THE WORLD FIELD — the living cross-section the product sits inside.
 *
 * This is the background half of the Strata identity: seven layers of the
 * working world, receding into atmosphere, with a demand signal travelling
 * down through them. Content renders ON TOP of it and stays completely
 * untouched, which is the whole design constraint — the world must never
 * compete with a headline or a CTA for attention, and must never be the
 * reason a number is hard to read.
 *
 * ── WHY NOT WebGL ─────────────────────────────────────────────────────────
 *
 * A parallax cross-section is layered 2D. Every visual property it needs —
 * depth blur, scale, opacity, translation — is a compositor property the
 * browser already accelerates. A GPU context here would buy nothing, cost a
 * ~150KB renderer plus a fallback path, and add a class of failure (context
 * loss, driver blocklists, headless) to a page whose job is to load fast for
 * a worker on a phone. 3D gets used when it earns its place; here it does
 * not.
 *
 * ── WHY IT IS DECORATIVE TO ASSISTIVE TECH ────────────────────────────────
 *
 * `aria-hidden` + `pointer-events: none`. The world carries mood, not
 * information: everything it implies is also stated in real text elsewhere on
 * the page. A screen-reader user loses nothing, which is the test for whether
 * a background is honest — if the scene held facts that exist nowhere else,
 * hiding it would be a lie and it would need a text equivalent instead.
 */

import type React from "react";
import { useEffect, useRef, useState } from "react";

import {
  STRATA,
  depthCue,
  presencePoints,
  signalAt,
  stratumProgress,
  type Stratum,
} from "@/lib/visual/strata";
import {
  readDeviceSignals,
  resolveVisualTier,
  signalAnimates,
  strataBudget,
  type VisualTier,
} from "@/lib/visual/capability";

export interface WorldFieldProps {
  /**
   * Scene intensity, 0..1. Sections that carry dense content (numbers, tables)
   * turn the world down rather than switching it off, so the page keeps one
   * continuous space instead of the world blinking in and out per band.
   */
  readonly intensity?: number;
}

export function WorldField({ intensity = 1 }: WorldFieldProps) {
  // SSR renders the FULL world, not a placeholder. The first paint a visitor
  // sees is the real composition; the tier only ever removes layers after
  // hydration on a device that reported it needs fewer. Rendering nothing
  // until mount is how a hero ends up flashing an empty box on a slow phone.
  const [tier, setTier] = useState<VisualTier>("full");
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    setTier(resolveVisualTier(readDeviceSignals(window)));
  }, []);

  useEffect(() => {
    if (tier === "still") return;

    // Scroll is read on a rAF tick rather than per event: the handler stays
    // passive and the layout read happens once per frame, so parallax cannot
    // become the reason the page stutters while scrolling.
    const onScroll = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        setProgress(max > 0 ? doc.scrollTop / max : 0);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [tier]);

  const layers = STRATA.slice(0, strataBudget(tier));
  const clamped = Math.max(0, Math.min(1, intensity));

  return (
    <div
      aria-hidden="true"
      data-world-field=""
      data-tier={tier}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: clamped }}
    >
      {/* Atmosphere: the space between layers. Two stops rather than a
          gradient ramp — a ramp reads as a graphic, a haze reads as air. */}
      <div className="world-atmosphere absolute inset-0" />

      {/* THE READING SCRIM. The world is never allowed to compete with the
          column people actually read. This lifts the page colour back over
          the centre so a headline sits in calm air while the world stays
          visible at the edges — the difference between a background and an
          obstruction. It is also what keeps text contrast audited-safe
          without dimming the whole scene into greyness. */}
      <div className="world-scrim absolute inset-0 z-20" />

      {layers.map((s, i) => (
        <StratumLayer key={s.id} stratum={s} index={i} progress={progress} tier={tier} />
      ))}

      <Signal progress={progress} tier={tier} />
    </div>
  );
}

/**
 * One layer of the world.
 *
 * The silhouette is drawn as an SVG path per environment — a horizon profile,
 * not an illustration of a workplace. At the blur and opacity depth assigns
 * them, recognisable objects would read as clip-art; profiles read as a place.
 */
function StratumLayer({
  stratum,
  index,
  progress,
  tier,
}: {
  stratum: Stratum;
  index: number;
  progress: number;
  tier: VisualTier;
}) {
  const cue = depthCue(stratum.depth);
  /**
   * Staged by the layer's OWN slice of the descent, not by the document-wide
   * scroll. Multiplying the global progress made all seven start together,
   * which is a page that reacts to the wheel rather than a world that reveals
   * itself — and it left `stratumProgress` as dead code the guard claimed was
   * in use.
   */
  const local = stratumProgress(progress, index);
  const travel = tier === "still" ? 0 : local * cue.parallax * 100;

  /**
   * A LAYER IS A HORIZON, NOT A BLOCK.
   *
   * The first version filled each stratum to a flat bottom edge, which built
   * seven hard-edged slabs — a bar chart, not a cross-section. Two hard edges
   * per layer is all it takes for the eye to stop reading depth and start
   * counting objects.
   *
   * So a layer is now a horizon LINE with ground falling away beneath it,
   * masked to nothing before it reaches the next layer. Nothing in the scene
   * has a bottom edge; layers dissolve into each other, which is what makes
   * seven of them read as one continuous space rather than a stack.
   *
   * Alpha is deliberately very low (0.10–0.22 after the depth ramp). Density
   * comes from OVERLAP, not from any single layer being visible — the reason
   * the first attempt looked like paint and this one looks like weather.
   */
  return (
    <div
      data-stratum={stratum.id}
      className="absolute inset-x-0 h-[30%] sm:h-[46%]"
      style={{
        /**
         * DEPTH RUNS UP THE FRAME, NOT DOWN IT.
         *
         * The nearest stratum sits LOW and large; each deeper one rises
         * toward the horizon and shrinks. Earlier cuts had this inverted —
         * near layers pinned to the top edge — and no amount of blur or
         * opacity could rescue it, because the eye reads vertical position as
         * distance before it reads anything else. Getting this backwards is
         * why three iterations looked like stacked bands instead of a space,
         * and getting the ARITHMETIC backwards (index 0 pushed to bottom:59%)
         * silently re-inverted it a fourth time — the reason the mapping is
         * now written as plainly as possible: near index, low bottom.
         */
        bottom: `${index * 11}%`,
        opacity: cue.opacity * 0.95,
        filter: cue.blurPx > 0.05 ? `blur(${cue.blurPx}px)` : undefined,
        transform: `translate3d(0, ${-travel}%, 0) scale(${cue.scale})`,
        transformOrigin: "50% 100%",
        /* Strata occupy 1..7. The scrim and the signal sit ABOVE them
           (z-20 / z-30): every layer here is already a stacking context via
           its transform and opacity, so anything left at `auto` is painted
           UNDER all of them no matter what the DOM order says. That is why
           the signal was invisible in every early render — it was behind the
           world the whole time. */
        zIndex: STRATA.length - index,
        // The mask is what removes the bottom edge. Without it the ground
        // ends in a line and the whole illusion collapses.
        maskImage:
          "linear-gradient(to bottom, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 0.65) 45%, rgb(0 0 0 / 0) 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 0.65) 45%, rgb(0 0 0 / 0) 100%)",
        willChange: tier === "still" ? undefined : "transform",
      }}
    >
      {/* The work light this layer emits. A place being worked in glows; a
          place that does not is scenery. `--c-strata-color` is bound here so
          the pool inherits the layer's own material without the stylesheet
          needing seven copies of the same rule. */}
      <div
        className="world-lightpool absolute inset-x-0 bottom-0 h-2/3"
        style={
          {
            "--c-strata-color": `var(--c-strata-${stratum.id})`,
          } as React.CSSProperties
        }
      />

      {/* ── MOBILE IS ITS OWN COMPOSITION, NOT A CROP ────────────────────
       *
       * A `slice` fit at 390px shows roughly a QUARTER of the 1200-unit
       * profile: the horizons stop being horizons and become abstract blocks.
       * That is precisely the "shrunken desktop" failure this train forbids.
       *
       * So the narrow viewport gets `meet` — the WHOLE profile, fitted to
       * width and sat on the baseline — while the wide viewport keeps `slice`
       * for its cinematic crop. Same paths, same depth model, two framings.
       *
       * Rendered as two elements toggled by CSS rather than by a JS width
       * check, so the server and the client always agree and there is no
       * hydration flash on the first paint a phone user sees.
       */}
      <svg
        viewBox="0 0 1200 320"
        preserveAspectRatio="xMidYMin slice"
        className="hidden h-full w-full sm:block"
        role="presentation"
      >
        <StratumArt stratum={stratum} index={index} />
      </svg>
      <svg
        viewBox="0 0 1200 320"
        preserveAspectRatio="xMidYMax meet"
        className="h-full w-full sm:hidden"
        role="presentation"
      >
        <StratumArt stratum={stratum} index={index} />
      </svg>
    </div>
  );
}


/** The layer's artwork, shared by both framings so a change to the world can
 *  never apply to one viewport and not the other. */
function StratumArt({ stratum, index }: { stratum: Stratum; index: number }) {
  return (
    <>
      <defs>
        <linearGradient id={`ground-${stratum.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={`rgb(var(--c-strata-${stratum.id}))`}
            stopOpacity="0.6"
          />
          <stop
            offset="100%"
            stopColor={`rgb(var(--c-strata-${stratum.id}))`}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      {/* The ground: mass below the horizon, already fading as it drops. */}
      <path d={HORIZON[stratum.id]} fill={`url(#ground-${stratum.id})`} />
      {/* The horizon itself: a thin lit edge — the only crisp thing in a
          layer, and what the eye reads as "a place at a distance". */}
      <path
        d={HORIZON[stratum.id]}
        fill="none"
        stroke={`rgb(var(--c-strata-${stratum.id}))`}
        strokeOpacity="0.9"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {/* PRESENCE — people at work in this layer. Warm points against the
          cool depth, because a lit human is the one thing in this scene that
          should read as alive rather than as structure. */}
      {presencePoints(index, stratum.depth, stratum.horizonY).map((pt, i) => (
        <circle
          key={i}
          cx={pt.x * 1200}
          cy={pt.y * 320}
          r={2.4}
          fill="rgb(var(--c-strata-kitchen))"
          opacity={pt.glow}
          style={{ filter: "drop-shadow(0 0 5px rgb(var(--c-strata-kitchen) / 0.85))" }}
        />
      ))}
    </>
  );
}

/**
 * THE SIGNAL — a need entering the world and reaching the people who answer it.
 *
 * The one element allowed to be conspicuous, because it is the product's
 * claim rendered as motion rather than asserted as copy. At `still` it is
 * drawn at rest mid-flight: the composition still says "this travels", which
 * is what a reduced-motion user is entitled to understand.
 */
function Signal({ progress, tier }: { progress: number; tier: VisualTier }) {
  const t = signalAnimates(tier) ? progress : 0.5;
  const { depth, intensity } = signalAt(t);

  return (
    <div
      className="absolute inset-x-0 z-30"
      style={{
        top: `${26 + depth * 58}%`,
        opacity: 0.35 + intensity * 0.65,
        transition: signalAnimates(tier)
          ? "top var(--motion-world-drift) var(--motion-ease-world)"
          : undefined,
      }}
    >
      {/* A travelling BAND, not a dot. The first cut placed a 3px point at
          50% of a 1440px frame and it was, predictably, invisible — a signal
          crossing a world has to be legible at world scale. The line reads as
          the moment a need sweeps the layer it has reached, and the core
          carries the light. */}
      <div className="world-signal-line" />
      <div
        className="world-signal absolute top-1/2 -translate-y-1/2"
        style={{ left: `${18 + depth * 58}%` }}
      />
    </div>
  );
}

/**
 * Horizon profiles. Each is the SHAPE a working environment cuts against the
 * sky — a site's cranes and slab edges, a warehouse's racking rhythm, a
 * greenhouse's ridged span — reduced to the silhouette that survives blur.
 */
const HORIZON: Record<Stratum["id"], string> = {
  site: "M0 320 L0 190 L70 190 L70 96 L96 96 L96 190 L210 190 L240 128 L300 128 L300 190 L430 190 L430 150 L520 150 L520 190 L1200 190 L1200 320 Z",
  assembly:
    "M0 320 L0 210 L120 210 L150 160 L200 160 L230 210 L380 210 L410 160 L460 160 L490 210 L640 210 L670 160 L720 160 L750 210 L1200 210 L1200 320 Z",
  logistics:
    "M0 320 L0 220 L90 220 L90 168 L170 168 L170 220 L280 220 L280 168 L360 168 L360 220 L470 220 L470 168 L550 168 L550 220 L1200 220 L1200 320 Z",
  kitchen:
    "M0 320 L0 236 L140 236 L160 200 L240 200 L260 236 L520 236 L540 190 L620 190 L640 236 L1200 236 L1200 320 Z",
  care: "M0 320 L0 244 L200 244 L200 206 L340 206 L340 244 L620 244 L620 216 L800 216 L800 244 L1200 244 L1200 320 Z",
  cultivation:
    "M0 320 L0 258 Q60 226 120 258 Q180 226 240 258 Q300 226 360 258 Q420 226 480 258 Q540 226 600 258 L1200 258 L1200 320 Z",
  studio:
    "M0 320 L0 268 L160 268 L160 240 L260 240 L260 268 L520 268 L520 232 L640 232 L640 268 L900 268 L900 250 L1010 250 L1010 268 L1200 268 L1200 320 Z",
};
