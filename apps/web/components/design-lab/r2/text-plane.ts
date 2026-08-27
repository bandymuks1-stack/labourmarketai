import * as THREE from "three";

/**
 * ROUND 2 — typography that lives IN the world.
 *
 * Round 1's text sat in a DOM layer above a 3D screensaver. Here a label is a
 * real object at a real depth: particles pass in front of it, it is occluded
 * by geometry, it takes the scene's fog and its own distance blur. That is the
 * whole point of §7 — text and space as one composition.
 *
 * Canvas → CanvasTexture rather than an SDF font library: it adds no
 * dependency, renders at device resolution, and lets a label carry the exact
 * tracking and weight the concept's type system asks for.
 */

export type LabelStyle = {
  readonly font?: string;
  readonly size?: number;
  readonly color?: string;
  readonly letterSpacing?: number;
  readonly uppercase?: boolean;
  readonly align?: CanvasTextAlign;
  /** optional rule drawn under the text, in the same colour */
  readonly rule?: boolean;
  readonly padding?: number;
};

export type TextPlane = {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly aspect: number;
  dispose(): void;
};

const DPR = 3;

/**
 * Renders one line (or several, separated by \n) into a plane whose height is
 * `worldHeight` and whose width follows the measured text.
 */
export function makeTextPlane(
  text: string,
  worldHeight: number,
  style: LabelStyle = {},
): TextPlane {
  const size = style.size ?? 64;
  const font = style.font ?? `500 ${size}px Manrope, system-ui, sans-serif`;
  const color = style.color ?? "#ffffff";
  const tracking = style.letterSpacing ?? 0;
  const pad = style.padding ?? size * 0.35;
  const lines = (style.uppercase ? text.toUpperCase() : text).split("\n");

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const widths = lines.map(
    (l) => measure.measureText(l).width + tracking * Math.max(0, l.length - 1),
  );
  const textW = Math.max(...widths, 1);
  const lineH = size * 1.16;
  const w = Math.ceil(textW + pad * 2);
  const h = Math.ceil(lineH * lines.length + pad * 2 + (style.rule ? size * 0.5 : 0));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(w * DPR));
  canvas.height = Math.max(2, Math.round(h * DPR));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  lines.forEach((line, i) => {
    const y = pad + lineH * (i + 0.5);
    let x =
      style.align === "center"
        ? (w - widths[i]) / 2
        : style.align === "right"
          ? w - pad - widths[i]
          : pad;
    if (tracking === 0) {
      ctx.fillText(line, x, y);
    } else {
      // canvas letterSpacing is not universally supported; step it manually so
      // the tracking a concept asks for is the tracking it gets
      for (const ch of line) {
        ctx.fillText(ch, x, y);
        x += ctx.measureText(ch).width + tracking;
      }
    }
  });

  if (style.rule) {
    ctx.fillRect(pad, h - pad - size * 0.25, textW, Math.max(1, size * 0.035));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const aspect = w / h;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(worldHeight * aspect, worldHeight),
    material,
  );
  mesh.renderOrder = 10;

  return {
    mesh,
    material,
    aspect,
    dispose() {
      texture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}
