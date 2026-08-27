import { EUROPE_GEO, MAP_H, MAP_W, project } from "@/components/app/europe-geo";

/**
 * CONCEPT B — the ground truth of the field.
 *
 * Rasterises the repository's EXISTING Europe geometry into a single RGBA
 * texture the field shader reads:
 *
 *   R — land mask, softened. Drives ELEVATION, so the continent physically
 *       rises out of the sea instead of being painted on a flat plane.
 *   G — land mask, crisp. Drives the COASTLINE hairline (via fwidth).
 *   B — country outlines.
 *   A — 255.
 *
 * The geometry is `components/app/europe-geo.ts`, generated from world-atlas
 * countries-110m, i.e. Natural Earth — PUBLIC DOMAIN. It is already committed
 * and already shipped by the production market map; this concept adds no new
 * geographic asset and no new licence.
 */

export type GeoTexture = {
  readonly canvas: HTMLCanvasElement;
  /** UV of a lon/lat pair inside the same texture. */
  readonly uvOf: (lng: number, lat: number) => [number, number];
};

const SCALE = 1; // 1000 x 740 is plenty — the field is 220 x 160 vertices

export function buildGeoTexture(): GeoTexture {
  const w = MAP_W * SCALE;
  const h = MAP_H * SCALE;

  // ── crisp pass: land fill + country outlines ─────────────────────────
  const crisp = document.createElement("canvas");
  crisp.width = w;
  crisp.height = h;
  const cc = crisp.getContext("2d")!;
  cc.fillStyle = "#000000";
  cc.fillRect(0, 0, w, h);
  cc.save();
  cc.scale(SCALE, SCALE);
  const paths = EUROPE_GEO.map((c) => new Path2D(c.d));
  cc.fillStyle = "#ffffff";
  for (const p of paths) cc.fill(p, "nonzero");
  cc.restore();

  const borders = document.createElement("canvas");
  borders.width = w;
  borders.height = h;
  const bc = borders.getContext("2d")!;
  bc.fillStyle = "#000000";
  bc.fillRect(0, 0, w, h);
  bc.save();
  bc.scale(SCALE, SCALE);
  bc.strokeStyle = "#ffffff";
  bc.lineWidth = 1.1;
  bc.lineJoin = "round";
  for (const p of paths) bc.stroke(p);
  bc.restore();

  // ── soft pass: the same land, blurred, for elevation ─────────────────
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const sc = soft.getContext("2d")!;
  sc.fillStyle = "#000000";
  sc.fillRect(0, 0, w, h);
  sc.filter = "blur(7px)";
  sc.drawImage(crisp, 0, 0);
  sc.filter = "none";

  // ── compose the channels ─────────────────────────────────────────────
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const oc = out.getContext("2d")!;
  const softData = sc.getImageData(0, 0, w, h).data;
  const crispData = cc.getImageData(0, 0, w, h).data;
  const borderData = bc.getImageData(0, 0, w, h).data;
  const img = oc.createImageData(w, h);
  for (let i = 0; i < w * h; i += 1) {
    img.data[i * 4] = softData[i * 4];
    img.data[i * 4 + 1] = crispData[i * 4];
    img.data[i * 4 + 2] = borderData[i * 4];
    img.data[i * 4 + 3] = 255;
  }
  oc.putImageData(img, 0, 0);

  // Clamp-to-edge means the border row/column is what the world outside the
  // map looks like. Force it to open sea so a coastline touching the frame
  // (Russia, north Africa) does not smear outward forever.
  oc.globalCompositeOperation = "source-over";
  oc.fillStyle = "rgba(0,0,0,255)";
  oc.fillRect(0, 0, w, 2);
  oc.fillRect(0, h - 2, w, 2);
  oc.fillRect(0, 0, 2, h);
  oc.fillRect(w - 2, 0, 2, h);

  return {
    canvas: out,
    uvOf(lng, lat) {
      const [x, y] = project(lng, lat);
      // texture V is flipped relative to the SVG viewBox
      return [x / MAP_W, 1 - y / MAP_H];
    },
  };
}

/**
 * Places where the field has weight. Real European cities, used ONLY as
 * spatial anchors for an illustrative demand surface — no volume, no rate,
 * no count is claimed anywhere on this concept.
 */
export const ANCHORS: readonly {
  readonly name: string;
  readonly lng: number;
  readonly lat: number;
  readonly weight: number;
}[] = [
  { name: "Vilnius", lng: 25.28, lat: 54.69, weight: 0.9 },
  { name: "Warsaw", lng: 21.01, lat: 52.23, weight: 0.85 },
  { name: "Berlin", lng: 13.4, lat: 52.52, weight: 1.0 },
  { name: "Stockholm", lng: 18.07, lat: 59.33, weight: 0.82 },
  { name: "Copenhagen", lng: 12.57, lat: 55.68, weight: 0.7 },
  { name: "Amsterdam", lng: 4.9, lat: 52.37, weight: 0.86 },
  { name: "Paris", lng: 2.35, lat: 48.86, weight: 0.95 },
  { name: "Munich", lng: 11.58, lat: 48.14, weight: 0.78 },
  { name: "Milan", lng: 9.19, lat: 45.46, weight: 0.74 },
  { name: "Madrid", lng: -3.7, lat: 40.42, weight: 0.72 },
  { name: "Dublin", lng: -6.26, lat: 53.35, weight: 0.6 },
  { name: "Riga", lng: 24.11, lat: 56.95, weight: 0.55 },
];
