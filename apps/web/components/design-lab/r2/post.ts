import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * ROUND 2 — the finishing pass.
 *
 * Bloom is the only effect that earns its cost here, and it is tuned to lift
 * emissive material rather than to fog the whole frame — "premium is not more
 * glow" (§5). The grade pass afterwards does the work glow usually pretends
 * to do: a gentle filmic curve, a vignette, and a very fine grain so large
 * flat gradients do not band on an 8-bit display.
 *
 * All three passes come from three's own examples, so this adds no dependency.
 */

const GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.055 },
    uLift: { value: new THREE.Color(0, 0, 0) },
    uTime: { value: 0 },
    uSaturation: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    uniform float uSaturation;
    uniform vec3  uLift;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // saturation, around luma
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);

      // a lift keeps the blacks from being dead digital zero
      c += uLift * (1.0 - smoothstep(0.0, 0.35, l));

      // vignette, elliptical and gentle
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.92);
      float v = 1.0 - dot(q, q) * uVignette;
      c *= clamp(v, 0.0, 1.0);

      // fine grain — dithers the gradients, and reads as film not as noise
      float g = hash(vUv * 1024.0 + fract(uTime) * 91.0) - 0.5;
      c += g * uGrain * (0.35 + 0.65 * (1.0 - l));

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export type Post = {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass | null;
  readonly grade: ShaderPass;
  setSize(w: number, h: number, dpr: number): void;
  dispose(): void;
};

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: {
    readonly bloom: boolean;
    readonly bloomStrength?: number;
    readonly bloomRadius?: number;
    readonly bloomThreshold?: number;
    readonly vignette?: number;
    readonly grain?: number;
    readonly lift?: THREE.Color;
    readonly saturation?: number;
  },
): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let bloom: UnrealBloomPass | null = null;
  if (opts.bloom) {
    bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      opts.bloomStrength ?? 0.42,
      opts.bloomRadius ?? 0.55,
      opts.bloomThreshold ?? 0.82,
    );
    composer.addPass(bloom);
  }

  const grade = new ShaderPass(GRADE);
  grade.uniforms.uVignette.value = opts.vignette ?? 0.9;
  grade.uniforms.uGrain.value = opts.grain ?? 0.055;
  grade.uniforms.uSaturation.value = opts.saturation ?? 1;
  if (opts.lift) grade.uniforms.uLift.value = opts.lift;
  grade.renderToScreen = true;
  composer.addPass(grade);

  return {
    composer,
    bloom,
    grade,
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      // bloom runs at half the composer's resolution — it is a blur, and
      // nobody has ever noticed a blur being half resolution
      bloom?.setSize(Math.max(1, (w * dpr) / 2), Math.max(1, (h * dpr) / 2));
    },
    dispose() {
      composer.dispose();
    },
  };
}
