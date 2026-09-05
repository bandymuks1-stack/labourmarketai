import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  STRATA,
  depthCue,
  presencePoints,
  signalAt,
  stratumProgress,
} from "@/lib/visual/strata";
import {
  resolveVisualTier,
  signalAnimates,
  strataBudget,
  type DeviceSignals,
} from "@/lib/visual/capability";

/**
 * THE LIVING WORLD IS A SYSTEM, AND A SYSTEM CAN BE WRONG IN WAYS A PICTURE
 * CANNOT.
 *
 * Six of the eight renders it took to reach this composition failed for
 * reasons that are checkable in code, not matters of taste: depth ordering
 * inverted twice, parallax that would have run backwards, three darkening
 * layers stacking to black, a capability probe that demotes capable devices.
 * Every one of those is pinned here so the next person tuning the scene
 * cannot silently undo the thing that made it read.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

/** Source with comments stripped. These guards are about what the code DOES;
 *  the modules deliberately DISCUSS the anti-patterns they avoid, and a naive
 *  text match would fail on the very documentation that prevents a relapse. */
const code = (...p: string[]) =>
  read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("depth behaves like depth", () => {
  it("deeper strata are hazier, smaller and fainter — monotonically", () => {
    for (let i = 1; i < STRATA.length; i += 1) {
      const near = depthCue(STRATA[i - 1].depth);
      const far = depthCue(STRATA[i].depth);
      expect(far.blurPx).toBeGreaterThanOrEqual(near.blurPx);
      expect(far.scale).toBeLessThanOrEqual(near.scale);
      expect(far.opacity).toBeLessThanOrEqual(near.opacity);
    }
  });

  it("NEAR layers parallax MORE than far ones", () => {
    // The single thing decorative parallax gets backwards. If a distant layer
    // travels further than a near one the scene reads as inside-out, and no
    // amount of blur rescues it.
    expect(depthCue(0).parallax).toBeGreaterThan(depthCue(1).parallax);
    for (let i = 1; i < STRATA.length; i += 1) {
      expect(depthCue(STRATA[i].depth).parallax).toBeLessThanOrEqual(
        depthCue(STRATA[i - 1].depth).parallax,
      );
    }
  });

  it("the deepest layer still renders — depth thins, it never erases", () => {
    const deepest = depthCue(1);
    expect(deepest.opacity).toBeGreaterThan(0.3);
    expect(deepest.scale).toBeGreaterThan(0.8);
  });

  it("out-of-range depth is clamped rather than producing NaN geometry", () => {
    for (const bad of [-4, 9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cue = depthCue(bad);
      for (const v of [cue.blurPx, cue.scale, cue.opacity, cue.parallax]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("the scene renders identically on the server and in the browser", () => {
  it("presence points are deterministic", () => {
    // Math.random here would tear the world apart at hydration AND make every
    // screenshot review meaningless, because the scene under critique would
    // not be the scene that shipped.
    for (let i = 0; i < STRATA.length; i += 1) {
      expect(presencePoints(i, STRATA[i].depth, STRATA[i].horizonY)).toEqual(
        presencePoints(i, STRATA[i].depth, STRATA[i].horizonY),
      );
    }
  });

  it("presence thins with depth, and no layer is ever empty", () => {
    const near = presencePoints(0, 0, 0.6).length;
    const far = presencePoints(6, 1, 0.84).length;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(3);
  });

  it("presence stands ON its layer's ground line, never in the sky above it", () => {
    // The first cut derived y from the layer box and put workers at y 26–134
    // while the horizons live at y 190–268 — people floating above the
    // workplaces they were supposed to be standing in.
    for (const s of STRATA) {
      const i = STRATA.indexOf(s);
      for (const pt of presencePoints(i, s.depth, s.horizonY)) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(1);
        expect(Math.abs(pt.y - s.horizonY)).toBeLessThan(0.06);
      }
    }
  });

  it("the module uses no non-deterministic source", () => {
    const src = code("lib", "visual", "strata.ts");
    expect(src).not.toMatch(/Math\.random|Date\.now|new Date\(/);
  });
});

describe("the signal travels, and still means something at rest", () => {
  it("depth advances monotonically across the journey", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const { depth } = signalAt(t);
      expect(depth).toBeGreaterThanOrEqual(prev);
      prev = depth;
    }
  });

  it("it is brightest mid-flight and faded at both ends", () => {
    expect(signalAt(0.5).intensity).toBeGreaterThan(signalAt(0.05).intensity);
    expect(signalAt(0.5).intensity).toBeGreaterThan(signalAt(0.95).intensity);
  });

  it("a stratum stages its own entrance rather than all moving at once", () => {
    expect(stratumProgress(0, 3)).toBe(0);
    expect(stratumProgress(1, STRATA.length - 1)).toBe(1);
  });

  it("the renderer actually USES the per-layer progress", () => {
    // It was written, documented and guarded while the renderer multiplied
    // the document-wide scroll — so all seven layers moved together and the
    // helper was dead code the guard claimed was live.
    const field = code("components", "world", "world-field.tsx");
    expect(field).toContain("stratumProgress(progress, index)");
    expect(field).toMatch(/travel\s*=\s*tier === "still" \? 0 : local \*/);
  });

  it("the scrim and the signal paint ABOVE the strata", () => {
    // Every stratum is a stacking context (transform + opacity), so anything
    // left at z-auto is painted under all of them regardless of DOM order.
    const field = code("components", "world", "world-field.tsx");
    expect(field).toMatch(/world-scrim[^"]*z-20/);
    expect(field).toMatch(/absolute inset-x-0 z-30/);
  });
});

describe("capability detection does not repeat the WebGL bug", () => {
  const base: DeviceSignals = {
    prefersReducedMotion: false,
    prefersReducedData: false,
    cores: null,
    memoryGb: null,
    coarsePointer: false,
  };

  it("UNKNOWN signals resolve to the full world, never to a demotion", () => {
    // The original defect generalised: `null` means "not reported under these
    // conditions", not "not capable". Firefox and Safari report no
    // deviceMemory at all — treating absence as weakness would permanently
    // demote them, which is the same category error one API along.
    expect(resolveVisualTier(base)).toBe("full");
  });

  it("a STATED preference always wins over any hardware guess", () => {
    expect(
      resolveVisualTier({ ...base, prefersReducedMotion: true, cores: 32, memoryGb: 32 }),
    ).toBe("still");
  });

  it("only a POSITIVELY reported weak signal demotes", () => {
    expect(resolveVisualTier({ ...base, memoryGb: 1 })).toBe("reduced");
    expect(resolveVisualTier({ ...base, cores: 2 })).toBe("reduced");
    expect(resolveVisualTier({ ...base, memoryGb: 8, cores: 8 })).toBe("full");
  });

  it("a coarse pointer is NOT treated as weakness", () => {
    // A phone is not a slow computer. Demoting every touch device is how a
    // scene ends up worst exactly where most workers will see it.
    expect(resolveVisualTier({ ...base, coarsePointer: true })).toBe("full");
  });

  it("the failIfMajorPerformanceCaveat anti-pattern is absent from the tree", () => {
    // Checked against CODE, not prose: capability.ts documents the bug at
    // length on purpose, and that documentation is the thing most likely to
    // stop it recurring.
    for (const src of [
      code("lib", "visual", "capability.ts"),
      code("components", "world", "world-field.tsx"),
    ]) {
      expect(src).not.toContain("failIfMajorPerformanceCaveat");
      expect(src).not.toMatch(/getContext\(\s*["']webgl/);
    }
  });

  it("every tier still renders a recognisable world", () => {
    for (const tier of ["full", "reduced", "still"] as const) {
      expect(strataBudget(tier)).toBeGreaterThanOrEqual(4);
      expect(strataBudget(tier)).toBeLessThanOrEqual(STRATA.length);
    }
    expect(signalAnimates("still")).toBe(false);
  });
});

describe("the world stays a background, and a token citizen", () => {
  it("it is hidden from assistive tech and cannot be clicked", () => {
    const field = read("components", "world", "world-field.tsx");
    expect(field).toContain('aria-hidden="true"');
    expect(field).toContain("pointer-events-none");
  });

  it("no component names a raw colour — atmosphere resolves to tokens", () => {
    const field = read("components", "world", "world-field.tsx");
    expect(field).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(field).toMatch(/var\(--c-strata-/);
  });

  it("the atmosphere palette exists in BOTH themes", () => {
    const css = read("app", "globals.css");
    // The base palette lives in the theme-independent :root block; the dark
    // theme overrides it. Both must define the full atmosphere or the world
    // loses its material identity in one theme and nobody notices until a
    // screenshot in the other.
    // Anchored on the RULE, not on the first textual mention — the file's
    // header comment names both themes, and slicing there put the whole
    // palette on the wrong side of the split.
    const darkRule = css.indexOf(':root[data-theme="dark"] {');
    expect(darkRule, "dark theme rule not found").toBeGreaterThan(-1);
    const base = css.slice(0, darkRule);
    const dark = css.slice(darkRule);
    for (const id of ["site", "kitchen", "studio", "haze", "void"]) {
      expect(base, `base is missing --c-strata-${id}`).toContain(`--c-strata-${id}:`);
      expect(dark, `dark is missing --c-strata-${id}`).toContain(`--c-strata-${id}:`);
    }
  });

  it("reduced motion is enforced in CSS too, not only in JS", () => {
    const css = read("app", "globals.css");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("[data-world-field]");
    expect(block).toMatch(/animation: none/);
  });

  it("mobile gets its own framing rather than a crop of the desktop one", () => {
    // `slice` at 390px showed about a quarter of the profile and turned
    // horizons into abstract blocks. Both framings must stay present.
    const field = read("components", "world", "world-field.tsx");
    expect(field).toContain('preserveAspectRatio="xMidYMin slice"');
    expect(field).toContain('preserveAspectRatio="xMidYMax meet"');
    expect(field).toContain("sm:hidden");
  });
});
