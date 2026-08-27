/**
 * ROUND 2 — human presence, built rather than drawn.
 *
 * The brief asks for humanity without stock-photo HR design. A traced
 * silhouette would be someone's specific body; a photograph would be someone's
 * specific face. So the presence here is composed from primitives — head,
 * neck, shoulders, torso, arms — as a 2D signed-distance field, smooth-unioned
 * so it reads as ONE body rather than as parts.
 *
 * That gives three things a bitmap could not: it is unmistakably a person at a
 * glance, it belongs to nobody in particular, and it is a FIELD — so particles
 * can be told how far inside the body they are, and the edge can breathe.
 */

export type HumanMask = {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** 0 outside, 1 well inside; smooth across the edge */
  readonly at: (u: number, v: number) => number;
  /** sample n points inside the figure, in -0.5..0.5 space, y up */
  readonly samplePoints: (n: number, seed?: number) => Float32Array;
};

function smin(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function sdCircle(px: number, py: number, cx: number, cy: number, r: number) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdCapsule(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

/**
 * The figure, in a 0..1 box with y DOWN (canvas convention). Proportions are
 * deliberately calm and slightly abstract — head a touch small, shoulders
 * broad, no facial features at all.
 */
function figureSdf(x: number, y: number): number {
  const head = sdCircle(x, y, 0.5, 0.155, 0.096);
  const neck = sdCapsule(x, y, 0.5, 0.24, 0.5, 0.3, 0.045);
  const shoulders = sdCapsule(x, y, 0.325, 0.335, 0.675, 0.335, 0.062);
  const torso = sdCapsule(x, y, 0.5, 0.35, 0.5, 0.66, 0.135);
  const hips = sdCapsule(x, y, 0.44, 0.64, 0.56, 0.64, 0.1);
  const armL = sdCapsule(x, y, 0.335, 0.35, 0.29, 0.6, 0.05);
  const armR = sdCapsule(x, y, 0.665, 0.35, 0.715, 0.585, 0.05);
  const foreL = sdCapsule(x, y, 0.29, 0.6, 0.325, 0.75, 0.041);
  const foreR = sdCapsule(x, y, 0.715, 0.585, 0.69, 0.735, 0.041);
  const legL = sdCapsule(x, y, 0.455, 0.66, 0.44, 0.94, 0.062);
  const legR = sdCapsule(x, y, 0.545, 0.66, 0.565, 0.94, 0.062);

  let d = head;
  for (const part of [neck, shoulders, torso, hips]) d = smin(d, part, 0.055);
  for (const part of [armL, armR, foreL, foreR]) d = smin(d, part, 0.035);
  for (const part of [legL, legR]) d = smin(d, part, 0.045);
  return d;
}

export function buildHumanMask(size = 512): HumanMask {
  const w = Math.round(size * 0.62);
  const h = size;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const field = new Float32Array(w * h);

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      // map the narrow canvas into the sdf's square space
      const x = 0.5 + (i / w - 0.5) * 0.62;
      const y = j / h;
      const d = figureSdf(x, y);
      // 1 well inside, 0 outside, soft across ~0.02
      const v = Math.min(1, Math.max(0, -d / 0.022));
      field[j * w + i] = v;
      const k = (j * w + i) * 4;
      const b = Math.round(v * 255);
      img.data[k] = b;
      img.data[k + 1] = b;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const at = (u: number, v: number) => {
    const i = Math.round(u * (w - 1));
    const j = Math.round(v * (h - 1));
    if (i < 0 || j < 0 || i >= w || j >= h) return 0;
    return field[j * w + i];
  };

  const samplePoints = (n: number, seed = 7) => {
    const out = new Float32Array(n * 2);
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    let written = 0;
    let guard = 0;
    while (written < n && guard < n * 400) {
      guard += 1;
      const u = rand();
      const v = rand();
      // rejection sample against the field, so density follows the body and
      // the edge stays soft instead of stamped
      if (rand() > at(u, v) * 0.96 + 0.02) continue;
      out[written * 2] = (u - 0.5) * 0.62;
      out[written * 2 + 1] = 0.5 - v;
      written += 1;
    }
    // if rejection ran dry, fill the remainder along the torso axis
    for (let k = written; k < n; k += 1) {
      out[k * 2] = (rand() - 0.5) * 0.1;
      out[k * 2 + 1] = 0.1 - rand() * 0.5;
    }
    return out;
  };

  return { canvas, width: w, height: h, at, samplePoints };
}
