/**
 * THE STRATA — the world model behind labourmarket.ai's visual identity.
 *
 * WHY A MODEL AND NOT A PICTURE. The landing had six stacked bands in a
 * centred column: the visual signature of every B2B SaaS page ever shipped.
 * The fix is not a nicer hero. A hero is a picture you scroll past; what this
 * product needs is a WORLD it visibly lives inside, because the thing being
 * sold is precisely that work is one connected system — people, skills,
 * employers, projects, places, demand, supply, history, opportunity — and a
 * column of cards says the opposite of that with its shape alone.
 *
 * So the page becomes a vertical cut through the working world. Scrolling is
 * descent. Content sits INSIDE the world rather than on top of a decorative
 * background, and a single signal travels the full depth, which is the product
 * story rendered as motion rather than asserted as copy.
 *
 * WHY A CROSS-SECTION RATHER THAN A WIDE SCENE. The two directions the owner
 * sketched were a vertical cut and a great station hall. A station is a
 * horizontal, wide-format idea: it composes beautifully at 1440px and collapses
 * into an unreadable smudge at 390px, which is exactly the failure this train
 * is meant to avoid — "mobile must not be a shrunken desktop". A vertical cut
 * is natively portrait. The same model drives both, with depth traded for
 * sequence, so mobile keeps the Living World idea instead of a postcard of it.
 *
 * WHAT THIS FILE IS. Pure data and pure math — no React, no DOM, no CSS. The
 * scene is derived from it, so the world can be reasoned about and TESTED
 * (a parallax curve is a claim about behaviour, and claims get guards here).
 */

/** A layer of the working world. Order is depth order: index 0 is the surface. */
export interface Stratum {
  /** Stable id — also the CSS custom-property suffix for its atmosphere. */
  readonly id: StratumId;
  /**
   * The work this layer holds. Deliberately environments, NOT job titles: the
   * world shows where work happens, and the profession taxonomy stays the
   * product's job (49 slugs in messages/{locale}/professions.json). Coupling
   * the scene to that catalogue would make an artistic composition change
   * every time a profession is added.
   */
  readonly environment: string;
  /**
   * Depth plane 0..1 (0 = nearest the viewer, 1 = deepest). Drives blur,
   * scale, opacity and parallax together so a layer cannot drift out of its
   * own depth — the single number that keeps the world coherent.
   */
  readonly depth: number;
  /**
   * Where this layer's ground line sits, as a fraction of the 320-unit
   * viewBox height. Presence is placed against THIS, not against the layer
   * box: the first cut derived worker positions from the band alone and put
   * them at y 26–134 while the horizons live at y 190–268, so the people
   * floated in the sky above the workplaces they were supposed to be in.
   */
  readonly horizonY: number;
}

export type StratumId =
  | "site"        // construction — where a need is most visibly physical
  | "assembly"    // manufacturing / production
  | "logistics"   // warehouse / transport — the connective tissue
  | "kitchen"     // food, hospitality
  | "care"        // healthcare, caregiving — the largest real supply we hold
  | "cultivation" // greenhouse / green economy
  | "studio";     // office, technical, services — work with no visible material

/**
 * SEVEN LAYERS, ORDERED BY DEPTH, NOT BY IMPORTANCE.
 *
 * The order is a composition decision: physical, material work sits nearest
 * the viewer because it is the most legible as an image, and abstract work
 * sits deepest because it reads as light and structure rather than objects.
 * It is NOT a ranking of professions — `care` is the largest single supply in
 * production (4,094 browsable vacancies) and sits mid-depth purely because
 * that is where it composes.
 */
export const STRATA: readonly Stratum[] = [
  { id: "site", environment: "construction", depth: 0.0, horizonY: 190 / 320 },
  { id: "assembly", environment: "manufacturing", depth: 0.16, horizonY: 210 / 320 },
  { id: "logistics", environment: "warehouse-transport", depth: 0.33, horizonY: 220 / 320 },
  { id: "kitchen", environment: "food-hospitality", depth: 0.5, horizonY: 236 / 320 },
  { id: "care", environment: "healthcare-care", depth: 0.66, horizonY: 244 / 320 },
  { id: "cultivation", environment: "green-economy", depth: 0.83, horizonY: 258 / 320 },
  { id: "studio", environment: "office-technical", depth: 1.0, horizonY: 268 / 320 },
] as const;

/** Depth-derived visual properties. One source, so depth can never disagree
 *  with itself across blur, scale, opacity and parallax. */
export interface DepthCue {
  /** Atmospheric blur in px. Deeper = hazier. */
  readonly blurPx: number;
  /** Scale multiplier. Deeper = smaller, as perspective requires. */
  readonly scale: number;
  /** Opacity. Deeper = thinner, so near layers stay dominant. */
  readonly opacity: number;
  /**
   * Parallax coefficient: viewport fraction a layer travels per unit of
   * scroll. Near layers move MORE than deep ones — the actual optics of
   * looking through a scene, and the thing most decorative parallax gets
   * backwards.
   */
  readonly parallax: number;
}

/**
 * Depth → cues.
 *
 * The curves are deliberately non-linear. Linear interpolation across seven
 * layers produces evenly-spaced planes, which reads as a stack of sheets —
 * the flat look this world exists to escape. Blur and parallax use an
 * exponential falloff so the near layers separate sharply and the far ones
 * compress into atmosphere, which is how real depth is perceived.
 */
export function depthCue(depth: number): DepthCue {
  const d = clamp01(depth);
  return {
    blurPx: round(d * d * 14, 2),
    scale: round(1 - d * 0.14, 4),
    opacity: round(1 - d * 0.55, 4),
    parallax: round(0.42 * Math.pow(1 - d, 1.6), 4),
  };
}

/**
 * How far a layer has been travelled through, 0..1, for a given scroll
 * progress across the whole world.
 *
 * Each stratum owns an equal slice of the descent and this returns the
 * progress WITHIN that slice, so a layer can stage its own entrance without
 * every layer animating at once — the difference between a world that reveals
 * itself and a page where everything moves whenever you touch the wheel.
 */
export function stratumProgress(scrollProgress: number, index: number): number {
  const total = STRATA.length;
  if (index < 0 || index >= total) return 0;
  const slice = 1 / total;
  const start = index * slice;
  return clamp01((clamp01(scrollProgress) - start) / slice);
}

/**
 * THE SIGNAL — a demand entering the world and travelling to the people who
 * can answer it.
 *
 * This is the one piece of motion that is allowed to be conspicuous, because
 * it is the product's actual claim: a need does not stop at a job ad, it
 * travels through the system and comes back as work, evidence and a next
 * opportunity. Everything else in the scene is atmosphere.
 *
 * Returns the signal's position as depth (0..1) plus its intensity, so the
 * renderer can place and fade it without re-deriving the curve.
 */
export function signalAt(t: number): { readonly depth: number; readonly intensity: number } {
  const p = clamp01(t);
  // Ease-in-out: a signal accelerates into the world and settles when it
  // arrives, rather than sliding at a constant machine speed.
  const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  // Brightest mid-flight, faded at both ends: it emerges and it lands.
  const intensity = round(Math.sin(p * Math.PI), 4);
  return { depth: round(eased, 4), intensity };
}

/**
 * PRESENCE — the people at work inside a layer.
 *
 * A cross-section with buildings and no people is a landscape. This product
 * is about the labour market, so the world has to be INHABITED or it argues
 * the wrong thing: the third render looked like architecture at night, which
 * is a pretty picture of exactly the wrong subject.
 *
 * Points are DETERMINISTIC from (stratum index, i) rather than random. Two
 * reasons, both load-bearing: a scene that reshuffles every render cannot be
 * screenshot-reviewed or regression-tested, and server and client must agree
 * or React hydration tears the world apart on first paint.
 *
 * Density falls with depth — more visible people near, fewer far — which is
 * the same perspective rule the depth cues follow, applied to life instead of
 * geometry.
 */
export interface PresencePoint {
  /** Horizontal position, 0..1 of the layer width. */
  readonly x: number;
  /** Vertical offset within the layer's band, 0..1. */
  readonly y: number;
  /** Relative brightness 0..1 — not every worker is lit the same. */
  readonly glow: number;
}

export function presencePoints(
  stratumIndex: number,
  depth: number,
  horizonY: number,
): readonly PresencePoint[] {
  const count = Math.max(3, Math.round(14 * (1 - clamp01(depth) * 0.72)));
  const line = clamp01(horizonY);
  const out: PresencePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = hash(stratumIndex * 977 + i * 131);
    const b = hash(stratumIndex * 397 + i * 733);
    const c = hash(stratumIndex * 613 + i * 251);
    out.push({
      x: round(a, 4),
      // ON the ground line: a narrow band straddling it, never the open sky
      // above it. `b` spreads them across roughly ±4% of the frame so a row
      // of workers reads as standing at slightly different distances rather
      // than ruled along a wire.
      y: round(clamp01(line - 0.045 + b * 0.075), 4),
      glow: round(0.35 + c * 0.65, 4),
    });
  }
  return out;
}

/** Deterministic 0..1 from an integer. A small integer hash, not Math.random:
 *  the same input must give the same world on the server and in the browser. */
function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0xffffffff;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
