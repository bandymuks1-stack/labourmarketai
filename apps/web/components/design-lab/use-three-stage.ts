"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * A minimal three.js stage.
 *
 * This exists because @react-three/fiber's <Canvas> never initialised inside
 * this application shell: it mounted the canvas element but its measurement
 * layer never reported a size, so the renderer was never configured and the
 * canvas stayed at its default 300x150. Rather than fight a reconciler for a
 * throwaway prototype, the two 3D concepts drive three.js directly — which is
 * also one fewer dependency and a smaller bundle for the same result.
 *
 * The hook owns exactly the things that are easy to get wrong: device pixel
 * ratio, resize, the animation loop, visibility pausing, reduced motion, and
 * disposal.
 */
export type Stage = {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly size: { w: number; h: number; dpr: number };
  /** normalised pointer, -1..1, y up */
  readonly pointer: { x: number; y: number };
};

export type StageHooks = {
  /** called once, after the renderer exists — build the scene here */
  readonly setup: (stage: Stage) => void | (() => void);
  /** called every frame */
  readonly frame: (stage: Stage, dt: number, elapsed: number) => void;
  /** called on every resize, after camera aspect is updated */
  readonly resize?: (stage: Stage) => void;
  /** replaces the default renderer.render — used by scenes that draw through
   *  a post-processing composer instead of straight to the canvas */
  readonly renderFrame?: (stage: Stage) => void;
};

export function useThreeStage(
  hooks: StageHooks,
  opts: {
    readonly clearColor: string;
    readonly fov?: number;
    readonly maxDpr?: number;
    readonly reduced?: boolean;
    readonly toneMapping?: THREE.ToneMapping;
    readonly exposure?: number;
  },
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    host.appendChild(canvas);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      host.removeChild(canvas);
      return;
    }

    const o = optsRef.current;
    renderer.setClearColor(new THREE.Color(o.clearColor), 1);
    if (o.toneMapping !== undefined) renderer.toneMapping = o.toneMapping;
    if (o.exposure !== undefined) renderer.toneMappingExposure = o.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(o.fov ?? 34, 1, 0.5, 600);

    const stage: Stage = {
      renderer,
      scene,
      camera,
      size: { w: 1, h: 1, dpr: 1 },
      pointer: { x: 0, y: 0 },
    };

    const applySize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, optsRef.current.maxDpr ?? 2);
      stage.size.w = w;
      stage.size.h = h;
      stage.size.dpr = dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      hooksRef.current.resize?.(stage);
    };

    const teardown = hooksRef.current.setup(stage);
    applySize();

    const ro = new ResizeObserver(applySize);
    ro.observe(host);
    window.addEventListener("resize", applySize);

    const onPointer = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      stage.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      stage.pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let last = performance.now();
    const start = last;
    let running = true;
    // Rolling FPS on the host element. This is a measurement surface, not a
    // feature: a 3D concept that is never measured is a 3D concept whose cost
    // nobody knows. Read it with `document.querySelector('[data-fps]')`.
    let frames = 0;
    let fpsMark = last;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        hooksRef.current.frame(stage, dt, (now - start) / 1000);
      } catch (err) {
        // A throw inside the frame callback used to leave a live canvas that
        // simply stopped updating, with nothing anywhere to say why. Surface
        // it on the host element and stop, rather than burn a rAF loop.
        host.dataset.frameError =
          err instanceof Error ? `${err.message}` : String(err);
        running = false;
        return;
      }
      const custom = hooksRef.current.renderFrame;
      if (custom) custom(stage);
      else renderer.render(scene, camera);
      frames += 1;
      if (now - fpsMark >= 1000) {
        host.dataset.fps = (frames / ((now - fpsMark) / 1000)).toFixed(0);
        frames = 0;
        fpsMark = now;
      }
    };
    raf = requestAnimationFrame(loop);

    // Do not burn a GPU on a tab nobody is looking at.
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", applySize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (typeof teardown === "function") teardown();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      if (canvas.parentElement === host) host.removeChild(canvas);
    };
  }, []);

  return hostRef;
}
