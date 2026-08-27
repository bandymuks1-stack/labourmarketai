import * as THREE from "three";

/**
 * CONCEPT B — the field shader.
 *
 * The surface is not decoration: its HEIGHT is the thing. Land rises out of
 * the sea from the geographic mask; demand rises out of the land from the
 * anchor field; and a need placed by the visitor raises its own peak in the
 * same units as everything else. Contour isolines are drawn from that same
 * height, so what you read as a topographic map really is the topography of
 * the surface you are looking at — nothing is painted on.
 */

export const MAX_CENTERS = 12;

export const FIELD_WIDTH = 120;
export const FIELD_DEPTH = 88;

/**
 * The MESH is deliberately much larger than the mapped field.
 *
 * A plane that ends where the map ends has to be faded out at its own border,
 * and that fade band is visible from a low camera as a dark rectangle cutting
 * across the terrain. Extending the mesh and clamping the texture instead
 * means the map is simply surrounded by real sea, and the only thing that
 * ends the world is distance fog.
 */
export const MESH_SCALE = 2.1;

const VERT = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec4  uCenters[${MAX_CENTERS}];
  uniform vec4  uNeed;
  uniform float uLandH;
  uniform float uDemandH;
  uniform float uReveal;
  uniform float uTime;
  uniform vec2  uSpan;

  varying vec2  vUv;
  varying float vH;
  varying float vDemand;
  varying vec3  vWorld;

  float demandAt(vec2 p) {
    float d = 0.0;
    for (int i = 0; i < ${MAX_CENTERS}; i++) {
      vec4 c = uCenters[i];
      if (c.w <= 0.0) continue;
      float r = length(p - c.xy) / max(c.z, 0.001);
      d += c.w * exp(-r * r);
    }
    if (uNeed.w > 0.0) {
      float rn = length(p - uNeed.xy) / max(uNeed.z, 0.001);
      d += uNeed.w * exp(-rn * rn);
    }
    return d;
  }

  void main() {
    // the plane is built in local XY and rotated -90deg about X, so local +z
    // becomes world +y (height) and local +y becomes world -z (distance).
    vec2 p = vec2(position.x, -position.y);
    // map coordinates come from WORLD position, not from the mesh's own uv,
    // because the mesh is larger than the map (see MESH_SCALE)
    vec2 guv = vec2(position.x / uSpan.x + 0.5, position.y / uSpan.y + 0.5);
    vUv = guv;
    vec4 t = texture2D(uTex, guv);
    // Mostly the SOFT mask. Using the crisp one made a plateau with real
    // cliffs at every coastline, and from a low camera those cliffs occluded
    // whole seas — which read as black rectangular holes in the map. The
    // coast now rises rather than steps; the crisp mask still draws the line.
    float land = t.g * 0.34 + t.r * 0.66;
    float onLand = smoothstep(0.42, 0.72, land);
    float dem  = demandAt(p) * onLand;

    float h = land * uLandH + dem * uDemandH;
    vH = h;
    vDemand = dem;

    vec3 pos = position;
    pos.z = h * uReveal;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uIso;
  uniform float uFogStart;
  uniform float uFogK;
  uniform float uMode;      // 0 = person, 1 = organisation
  uniform float uReveal;

  varying vec2  vUv;
  varying float vH;
  varying float vDemand;
  varying vec3  vWorld;

  void main() {
    vec4 t = texture2D(uTex, vUv);
    float landSoft  = t.r;
    float landCrisp = t.g;
    float border    = t.b;

    // ── contour isolines, derived from the real displaced height ────────
    float e  = vH / uIso;
    float f  = fract(e);
    float df = fwidth(e);
    float iso = 1.0 - smoothstep(0.0, max(df * 1.6, 0.0015), abs(f - 0.5));

    // ── ground: near-black everywhere. The surface is read by its LINES,
    //    not by a fill, which is what keeps it an instrument and not a
    //    gradient. ──────────────────────────────────────────────────────
    vec3 sea    = vec3(0.010, 0.012, 0.018);
    vec3 ground = vec3(0.055, 0.057, 0.065);
    vec3 col = mix(sea, ground, smoothstep(0.35, 0.72, landCrisp));

    // ── demand: luminous, and ONLY at genuine peaks ─────────────────────
    float d = clamp(vDemand, 0.0, 1.6);
    float peak = smoothstep(0.28, 1.10, d);
    vec3 warm = mix(vec3(0.44, 0.19, 0.04), vec3(1.00, 0.80, 0.50), peak);
    vec3 cool = mix(vec3(0.09, 0.20, 0.34), vec3(0.62, 0.84, 1.00), peak);
    vec3 heat = mix(warm, cool, uMode);
    col = mix(col, heat, peak * 0.5);

    // ── depth, applied to the GROUND only ───────────────────────────────
    float dist = length(vWorld - cameraPosition);
    float fog = exp(-max(0.0, dist - uFogStart) * uFogK);
    col *= fog;

    // ── structure survives distance. Lines fade on sqrt(fog) rather than
    //    fog, so the far coastline stays a coastline instead of dissolving
    //    into the same grey as everything else. ─────────────────────────
    float lineFog = sqrt(fog);
    vec3 lineCol = mix(vec3(0.70, 0.72, 0.78), heat, peak * 0.85);
    col += lineCol * iso * (0.20 + 1.05 * peak)
         * smoothstep(0.30, 0.60, landCrisp) * lineFog;

    // Sea graticule: without it, water is an absence and reads as a hole in
    // the render. With it, water is water.
    vec2 g = vWorld.xz / 6.0;
    vec2 gg = abs(fract(g) - 0.5) / fwidth(g);
    float grid = 1.0 - min(min(gg.x, gg.y), 1.0);
    col += vec3(0.30, 0.36, 0.46) * grid * 0.085
         * (1.0 - smoothstep(0.15, 0.5, landCrisp)) * lineFog * 2.0;

    float cw = max(fwidth(landCrisp) * 1.5, 0.0035);
    float coast = 1.0 - smoothstep(0.0, cw, abs(landCrisp - 0.5));
    col += vec3(0.80, 0.84, 0.92) * coast * 1.9 * lineFog;

    col += vec3(0.48, 0.52, 0.60) * border * 0.30 * lineFog;

    col *= uReveal * 0.35 + 0.65;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export type FieldUniforms = {
  uTex: { value: THREE.Texture | null };
  uCenters: { value: THREE.Vector4[] };
  uNeed: { value: THREE.Vector4 };
  uLandH: { value: number };
  uDemandH: { value: number };
  uReveal: { value: number };
  uTime: { value: number };
  uIso: { value: number };
  uFogStart: { value: number };
  uFogK: { value: number };
  uMode: { value: number };
  uSpan: { value: THREE.Vector2 };
};

export function createFieldUniforms(): FieldUniforms {
  return {
    uTex: { value: null },
    uCenters: {
      value: Array.from({ length: MAX_CENTERS }, () => new THREE.Vector4(0, 0, 1, 0)),
    },
    uNeed: { value: new THREE.Vector4(0, 0, 9, 0) },
    uLandH: { value: 0.5 },
    uDemandH: { value: 4.4 },
    uReveal: { value: 0 },
    uTime: { value: 0 },
    uIso: { value: 0.42 },
    uFogStart: { value: 30 },
    uFogK: { value: 0.030 },
    uMode: { value: 0 },
    uSpan: { value: new THREE.Vector2(FIELD_WIDTH, FIELD_DEPTH) },
  };
}

export function createFieldMaterial(uniforms: FieldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
}

/** uv (0..1, v north-up) → world XZ on the field plane. */
export function uvToWorld(u: number, v: number): [number, number] {
  return [(u - 0.5) * FIELD_WIDTH, -(v - 0.5) * FIELD_DEPTH];
}

/** The JS mirror of `demandAt` — used to stand objects ON the surface. */
export function demandAtWorld(
  x: number,
  z: number,
  centers: readonly THREE.Vector4[],
  need: THREE.Vector4,
): number {
  let d = 0;
  for (const c of centers) {
    if (c.w <= 0) continue;
    const r = Math.hypot(x - c.x, z - c.y) / Math.max(c.z, 0.001);
    d += c.w * Math.exp(-r * r);
  }
  if (need.w > 0) {
    const rn = Math.hypot(x - need.x, z - need.y) / Math.max(need.z, 0.001);
    d += need.w * Math.exp(-rn * rn);
  }
  return d;
}
