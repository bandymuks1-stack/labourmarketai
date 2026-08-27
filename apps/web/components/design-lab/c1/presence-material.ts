import * as THREE from "three";

/**
 * C1 — "THE PRESENCE": the field material.
 *
 * One buffer of points holds THREE states of the same evidence:
 *
 *   aCloud   — scattered activity, before anything is understood about it
 *   aFigure  — the same evidence, condensed into a person
 *   aRelease — the same evidence again, redistributed into the wider market
 *
 * Nothing is created or destroyed between the states, which is the argument:
 * a profile is not written, it is the same record seen at a different scale.
 * The morph is per-particle delayed by a seed, so the body ASSEMBLES from the
 * edges inwards instead of snapping.
 */

const NOISE = /* glsl */ `
  // cheap value noise — enough turbulence to make a morph feel like matter
  // moving through air, without the cost of a full simplex implementation
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  vec3 flow(vec3 p, float t) {
    float n1 = vnoise(p * 0.35 + vec3(0.0, t * 0.08, 0.0));
    float n2 = vnoise(p * 0.52 + vec3(4.7, 1.3, t * 0.06));
    float n3 = vnoise(p * 0.28 + vec3(9.1, t * 0.05, 2.2));
    return vec3(n1 - 0.5, n2 - 0.5, n3 - 0.5) * 2.0;
  }
`;

const VERT = /* glsl */ `
  attribute vec3  aCloud;
  attribute vec3  aFigure;
  attribute vec3  aRelease;
  attribute float aSeed;

  uniform float uForm;      // 0 cloud → 1 figure
  uniform float uRelease;   // 0 figure → 1 wider market
  uniform float uTime;
  uniform float uSize;
  uniform vec3  uPointer;   // world-space pointer probe
  uniform float uPointerAmp;

  varying float vSeed;
  varying float vDepth;
  varying float vHeat;

  ${NOISE}

  float ease(float x) { return x * x * (3.0 - 2.0 * x); }

  void main() {
    vSeed = aSeed;

    // per-particle stagger: the silhouette resolves progressively
    float f = ease(clamp((uForm - aSeed * 0.3) / 0.7, 0.0, 1.0));
    vec3 p = mix(aCloud, aFigure, f);

    // turbulence peaks mid-morph, so the transition is matter in motion
    float mid = sin(3.14159 * clamp(uForm, 0.0, 1.0));
    p += flow(p * 0.6 + aSeed * 12.0, uTime) * mid * 1.35;

    float r = ease(clamp((uRelease - aSeed * 0.35) / 0.65, 0.0, 1.0));
    p = mix(p, aRelease, r);

    // the world answers the hand: a soft local repulsion around the pointer
    vec3 d = p - uPointer;
    float dist = length(d);
    float push = uPointerAmp * exp(-dist * dist * 0.18);
    p += normalize(d + 1e-4) * push;

    // never fully still
    p += vec3(
      sin(uTime * 0.5 + aSeed * 31.0),
      cos(uTime * 0.43 + aSeed * 17.0),
      sin(uTime * 0.37 + aSeed * 23.0)
    ) * 0.035;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    vHeat = f * (1.0 - r) + push * 2.0;
    gl_Position = projectionMatrix * mv;
    // As the cloud condenses into a body the same number of points occupies a
    // fraction of the volume. Without compensating for that, additive blending
    // turns the figure into a white hole. Points get smaller AND dimmer as
    // they gather — density does the work brightness used to.
    float dense = 1.0 - uForm * 0.55;
    gl_PointSize = uSize * dense * (1.0 + aSeed * 0.9) * (14.0 / max(vDepth, 0.7));
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uCold;
  uniform vec3  uWarm;
  uniform float uOpacity;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uForm;

  varying float vSeed;
  varying float vDepth;
  varying float vHeat;

  void main() {
    // round, soft-edged point; no texture needed
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.02, d);

    vec3 col = mix(uCold, uWarm, clamp(vHeat * 0.85 + vSeed * 0.25, 0.0, 1.0));
    float fog = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    float dense = 1.0 - uForm * 0.58;
    gl_FragColor = vec4(col, a * uOpacity * fog * dense * (0.22 + vSeed * 0.58));
  }
`;

export type PresenceUniforms = {
  uForm: { value: number };
  uRelease: { value: number };
  uTime: { value: number };
  uSize: { value: number };
  uPointer: { value: THREE.Vector3 };
  uPointerAmp: { value: number };
  uCold: { value: THREE.Color };
  uWarm: { value: THREE.Color };
  uOpacity: { value: number };
  uFogNear: { value: number };
  uFogFar: { value: number };
};

export function createPresenceMaterial(): {
  material: THREE.ShaderMaterial;
  uniforms: PresenceUniforms;
} {
  const uniforms: PresenceUniforms = {
    uForm: { value: 0 },
    uRelease: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: 2.6 },
    uPointer: { value: new THREE.Vector3(999, 999, 999) },
    uPointerAmp: { value: 0 },
    uCold: { value: new THREE.Color(0x4a5570) },
    uWarm: { value: new THREE.Color(0xffcf9a) },
    uOpacity: { value: 0.85 },
    uFogNear: { value: 8 },
    uFogFar: { value: 34 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { material, uniforms };
}

/**
 * The photographic layer.
 *
 * Real work, real people — but never presented as a photograph. Each fragment
 * is reduced to luminance, pushed through a contrast curve, tinted to the
 * scene's warm axis and cut by a soft feathered mask, so it reads as a TRACE
 * of activity behind the figure rather than as an HR stock image.
 */
export function createFragmentMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uMap: { value: texture },
      uOpacity: { value: 0 },
      uTint: { value: new THREE.Color(0xffb877) },
      uContrast: { value: 1.55 },
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 10 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uContrast;
      uniform float uTime;
      uniform float uSeed;
      uniform vec3  uTint;
      varying vec2 vUv;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }

      void main() {
        vec3 src = texture2D(uMap, vUv).rgb;
        float l = dot(src, vec3(0.2126, 0.7152, 0.0722));
        // lift the mids, crush the blacks: a print, not a snapshot
        l = clamp((l - 0.42) * uContrast + 0.38, 0.0, 1.0);
        l = pow(l, 1.25);

        // feathered edges + a torn upper/lower boundary, so it is a fragment
        // radial feather, not a rectangular one: a rectangle with soft sides
        // still shows its corners, and a visible corner turns a trace back
        // into a photograph pasted on the scene
        vec2 q = (vUv - 0.5) * vec2(2.05, 2.35);
        float edge = 1.0 - smoothstep(0.35, 1.0, length(q));
        float tear = 0.82 + 0.18 * hash(floor(vUv * vec2(24.0, 5.0)) + uSeed);
        float mask = edge * edge * tear;

        float a = l * mask * uOpacity;
        gl_FragColor = vec4(uTint * l * 1.15, a);
      }
    `,
  });
}
