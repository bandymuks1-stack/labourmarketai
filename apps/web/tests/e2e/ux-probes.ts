import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { Page } from "@playwright/test";

/**
 * IN-PAGE PROBES of the ux-metrics production walk (`prod-ux-metrics.spec.ts`).
 *
 * Every function that runs INSIDE the page lives here, self-contained (Playwright
 * serialises it into the page, so it may not reference anything outside its own
 * body). They read the DOM and the performance timeline and return NUMBERS only:
 * no page text ever leaves the page. Nothing here opens a browser, clicks or types.
 */

// ── axe-core (optional) ──────────────────────────────────────────────────────

/**
 * axe-core is NOT a declared dependency of apps/web, and none is added for this
 * walk. It is present in the hoisted install (`node-linker=hoisted`) as a
 * dependency of eslint-plugin-jsx-a11y, which `pnpm install --frozen-lockfile`
 * installs in the walk job. When it resolves, its counts are reported and its
 * "critical" violations fail the page; when it does not, every line says
 * `axe=na` and the walk relies on its own checks below.
 */
export const AXE_SOURCE: string | null = (() => {
  try {
    return readFileSync(createRequire(__filename).resolve("axe-core/axe.min.js"), "utf8");
  } catch {
    return null;
  }
})();

// ── In-page probes ───────────────────────────────────────────────────────────

/** Performance buffers, installed before any page script runs. */
export function installObservers(): void {
  type Ux = { lcp: number; cls: number; lt: number[][]; loaf: number[][]; clsTop: string; clsTopValue: number; clsTopDy: number };
  const ux: Ux = { lcp: 0, cls: 0, lt: [], loaf: [], clsTop: "", clsTopValue: 0, clsTopDy: 0 };
  (window as unknown as { __ux: Ux }).__ux = ux;
  const observe = (type: string, onEntry: (e: PerformanceEntry) => void) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true });
    } catch {
      /* entry type not supported: the metric stays 0 */
    }
  };
  observe("largest-contentful-paint", (e) => {
    ux.lcp = e.startTime;
  });
  observe("layout-shift", (e) => {
    type Rect = { y: number; height: number };
    const s = e as unknown as {
      value: number;
      hadRecentInput: boolean;
      sources?: { node?: Node | null; previousRect?: Rect; currentRect?: Rect }[];
    };
    if (s.hadRecentInput) return;
    ux.cls += s.value; // plain sum, not the session-window CLS (approximate)
    // WHICH block moved most: the nearest data-testid (or tag) of the largest
    // shift's first source — a component name, never page text.
    if (s.value > ux.clsTopValue) {
      const node = s.sources?.find((x) => x.node)?.node;
      const el = node instanceof Element ? node : node?.parentElement ?? null;
      const named = el?.closest("[data-testid]");
      ux.clsTop = named?.getAttribute("data-testid") ?? el?.tagName.toLowerCase() ?? "";
      ux.clsTopValue = s.value;
      // HOW FAR it moved (px, largest vertical move among the sources): with
      // the block's final height (measure) this sizes a pending reserve from
      // a measurement instead of a guess.
      ux.clsTopDy = Math.max(
        0,
        ...(s.sources ?? []).map((x) => Math.abs((x.currentRect?.y ?? 0) - (x.previousRect?.y ?? 0))),
      );
    }
  });
  observe("longtask", (e) => ux.lt.push([e.startTime, e.duration]));
  observe("long-animation-frame", (e) =>
    ux.loaf.push([e.startTime, e.duration, (e as unknown as { blockingDuration?: number }).blockingDuration ?? 0]),
  );
}

export type Probe = { tapMin: number; locale: string; namespaces: string[] };

/** Every number of one page. Returns counts only — no text leaves the page. */
export function measure({ tapMin, locale, namespaces }: Probe): Record<string, number> {
  const out: Record<string, number> = {};
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false; // also drops sr-only text
    return typeof el.checkVisibility === "function"
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true })
      : true;
  };
  const de = document.documentElement;
  const vw = de.clientWidth;

  // Layout: document overflow + boxes clipped past the right edge (`overflow-x: hidden`
  // on html/body would hide those from scrollWidth alone).
  out.overflow_px = Math.max(0, Math.max(de.scrollWidth, document.body?.scrollWidth ?? 0) - vw);
  let offedge = 0;
  const all = document.querySelectorAll("body *");
  out.dom_nodes = all.length;
  let t3d = 0;
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.transform.startsWith("matrix3d") || cs.perspective !== "none" || cs.transformStyle === "preserve-3d") t3d++;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.right <= vw + 1 || cs.position === "fixed") continue;
    let scroller = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll") {
        scroller = true;
        break;
      }
    }
    if (!scroller && cs.visibility !== "hidden") offedge++;
  }
  out.offedge_boxes = offedge;
  out.t3d = t3d;

  // Landmarks + headings.
  out.main_count = [...document.querySelectorAll('main, [role="main"]')].filter((m) =>
    typeof m.checkVisibility === "function" ? m.checkVisibility() : true,
  ).length;
  const level = (h: Element) => Number(h.getAttribute("aria-level") || (/^H[1-6]$/.test(h.tagName) ? h.tagName[1] : 2));
  let h1 = 0;
  let skips = 0;
  let prev = 0;
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
    if (!visible(h)) continue;
    const l = level(h);
    if (l === 1) h1++;
    if (prev && l > prev + 1) skips++;
    prev = l;
  }
  out.h1_count = h1;
  out.heading_skips = skips;
  const navs = [...document.querySelectorAll('nav, [role="navigation"]')].filter(visible);
  out.nav_systems = navs.filter((x) => !navs.some((o) => o !== x && o.contains(x))).length;
  out.tablists = [...document.querySelectorAll('[role="tablist"]')].filter(visible).length;

  // Interactive elements: tap size, accessible names, primary CTAs.
  const INTERACTIVE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"]';
  const BUTTON_INPUTS = ["button", "submit", "reset", "image"];
  const hasName = (el: Element): boolean => {
    if ((el.getAttribute("aria-label") ?? "").trim()) return true;
    const by = el.getAttribute("aria-labelledby");
    if (by && by.split(/\s+/).some((id) => (document.getElementById(id)?.textContent ?? "").trim())) return true;
    if ((el.getAttribute("title") ?? "").trim()) return true;
    // Form fields are named by their label, never by their content: a
    // select's option text and a checkbox/radio's default value "on" are not
    // accessible names (Codex review on #2794).
    const isField =
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && !BUTTON_INPUTS.includes(el.type));
    if (isField) {
      const labelled = [...((el as HTMLInputElement).labels ?? [])].some((l) => (l.textContent ?? "").trim());
      if (labelled) return true;
      // A text-like placeholder is the last-resort name browsers expose.
      const textLike = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "range", "color", "file"].includes(el.type));
      return textLike && !!((el as HTMLInputElement).placeholder ?? "").trim();
    }
    if ((el.textContent ?? "").trim()) return true;
    if (el.querySelector('img[alt]:not([alt=""]), svg title, [aria-label]')) return true;
    if (el instanceof HTMLInputElement && el.value) return true; // button-type inputs
    return false;
  };
  // WHICH components hold the small targets / primary CTAs: nearest
  // data-testid (else tag), counted — component names only, never text.
  const smallBy = new Map<string, number>();
  const ctaBy = new Map<string, number>();
  const componentTally = (el: Element, m: Map<string, number>) => {
    const k = el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.tagName.toLowerCase();
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  (window as unknown as { __uxComponents?: unknown }).__uxComponents = { smallBy, ctaBy };
  let tapTotal = 0;
  let tapSmall = 0;
  let unlabeled = 0;
  let unlabeledFields = 0;
  let primary = 0;
  let brandFill = 0;
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el) || el.closest("[inert]")) continue;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === "none") continue;
    tapTotal++;
    const r = el.getBoundingClientRect();
    let small = r.width < tapMin || r.height < tapMin;
    // WCAG 2.5.8 inline exception: a link inside a sentence.
    if (small && el.tagName === "A" && cs.display === "inline") {
      const parentText = (el.parentElement?.textContent ?? "").trim().length;
      if (parentText > (el.textContent ?? "").trim().length + 1) small = false;
    }
    // A small checkbox/radio inside a big enough label is a big enough target.
    if (small && el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      const lab = el.closest("label") ?? el.labels?.[0];
      const lr = lab?.getBoundingClientRect();
      if (lr && lr.width >= tapMin && lr.height >= tapMin) small = false;
    }
    if (small) {
      tapSmall++;
      componentTally(el, smallBy);
    }
    const isField = el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["button", "submit", "reset", "image"].includes(el.type));
    if (!hasName(el)) {
      if (isField) unlabeledFields++;
      else unlabeled++;
    }
    const cls = typeof el.className === "string" ? el.className : "";
    if (el.tagName === "A" || el.tagName === "BUTTON") {
      // Design system: Button variant="primary" and buttonLinkClassName() carry `bg-gradient-cta`
      // (components/ui/Button.tsx); a solid brand fill is the other "primary-looking" pattern.
      if (/\bbg-gradient-cta\b/.test(cls)) {
        primary++;
        componentTally(el, ctaBy);
      }
      else if (/(^|\s)bg-brand-blue(\s|$)/.test(cls)) brandFill++;
    }
  }
  out.tap_total = tapTotal;
  out.tap_small = tapSmall;
  out.unlabeled_controls = unlabeled;
  out.unlabeled_fields = unlabeledFields;
  out.primary_cta_count = primary;
  out.brand_fill_cta_count = brandFill;
  out.img_no_alt =
    [...document.querySelectorAll("img:not([alt])")].filter(visible).length +
    [...document.querySelectorAll('[role="img"]:not([aria-label]):not([aria-labelledby])')].filter(
      (el) => visible(el) && !el.querySelector("title"),
    ).length;

  // Text: font size, contrast, LT leaking into other locales, raw keys.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgbaCache = new Map<string, number[] | null>();
  /** Any CSS colour → sRGB [r, g, b, a] by painting one pixel (handles rgb(), oklch(), color(), …). */
  const rgba = (c: string): number[] | null => {
    if (rgbaCache.has(c)) return rgbaCache.get(c)!;
    let v: number[] | null = null;
    if (ctx && c && c !== "transparent" && !/^rgba\([^)]*,\s*0\)$/.test(c)) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      v = [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    } else if (c === "transparent" || /^rgba\([^)]*,\s*0\)$/.test(c)) {
      v = [0, 0, 0, 0];
    }
    rgbaCache.set(c, v);
    return v;
  };
  /** Effective background behind `el`: alpha layers of its ancestors composited down to the
   *  first opaque one (white canvas when none). APPROXIMATE: it follows the DOM, not the paint
   *  order (an absolutely positioned overlay, a sibling image or ancestor opacity are not seen);
   *  a background-image (gradient/photo) on the way makes the pair "unknown", not a fail. */
  const backgroundOf = (el: Element): number[] | null => {
    const layers: number[][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = rgba(cs.backgroundColor);
      if (c && c[3]! > 0) {
        layers.push(c);
        if (c[3]! >= 0.999) break;
      }
    }
    let base = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) {
      const [r, g, b, a] = layers[i]!;
      base = [r! * a! + base[0]! * (1 - a!), g! * a! + base[1]! * (1 - a!), b! * a! + base[2]! * (1 - a!)];
    }
    return base;
  };
  const lum = ([r, g, b]: number[]) => {
    const ch = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r!) + 0.7152 * ch(g!) + 0.0722 * ch(b!);
  };

  const LT_ONLY = locale === "pl" ? /[čėįšųūžČĖĮŠŲŪŽ]/ : /[ąčęėįšųūžĄČĘĖĮŠŲŪŽ]/; // ą ę are Polish too
  const KEY_LIKE = /\b[a-z][a-zA-Z0-9]+(?:\.[a-zA-Z0-9_]+){2,}\b/g;
  const KEY_NS = /\b([a-z][a-zA-Z0-9]+)((?:\.[a-zA-Z0-9_]+)+)\b/g;
  const NOT_KEY_TAIL = /^(?:pdf|csv|json|xlsx?|docx?|png|jpe?g|svg|txt|ai|lt|eu|com|org|net|io|de|nl|pl|ru|en|no|se|dk|lv|ee|\d+)$/i;
  const ns = new Set(namespaces);
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  const seen = new Map<Element, boolean>();
  const textParents = new Set<Element>();
  let textNodes = 0;
  let minFont = Infinity;
  let smallText = 0;
  let ltLeak = 0;
  let rawKeys = 0;
  let rawKeyLike = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    if (!text.trim()) continue;
    const p = node.parentElement;
    if (!p || SKIP.has(p.tagName)) continue;
    let v = seen.get(p);
    if (v === undefined) {
      v = visible(p);
      seen.set(p, v);
    }
    if (!v) continue;
    textNodes++;
    textParents.add(p);
    const size = parseFloat(getComputedStyle(p).fontSize);
    if (size < minFont) minFont = size;
    if (size < 12) smallText++;
    // Person-entered text (inputs, names marked translate=no) is not UI copy. APPROXIMATE: a
    // Lithuanian company or place name in shared data still counts.
    const userText = !!p.closest('input, textarea, [contenteditable], [translate="no"]');
    if (locale !== "lt" && !userText && LT_ONLY.test(text)) ltLeak++;
    rawKeyLike += (text.match(KEY_LIKE) ?? []).length;
    for (const m of text.matchAll(KEY_NS)) {
      const tail = m[2]!.split(".").pop() ?? "";
      if (ns.has(m[1]!) && !NOT_KEY_TAIL.test(tail)) rawKeys++;
    }
  }
  out.text_nodes = textNodes;
  out.min_font_px = Number.isFinite(minFont) ? minFont : 0;
  out.font_lt12 = smallText;
  out.lt_leak = ltLeak;
  out.raw_keys = rawKeys;
  out.raw_key_like = rawKeyLike;

  let checked = 0;
  let failed = 0;
  let unknown = 0;
  let budget = 2500; // bound the work on very long pages
  for (const p of textParents) {
    if (budget-- <= 0) break;
    if (p.closest(':disabled, [aria-disabled="true"]')) continue; // WCAG 1.4.3 exempts inactive controls
    const cs = getComputedStyle(p);
    const fg = rgba(cs.color);
    const bg = backgroundOf(p);
    if (!fg || !bg) {
      unknown++;
      continue;
    }
    const a = fg[3]!;
    const fgOver = [fg[0]! * a + bg[0]! * (1 - a), fg[1]! * a + bg[1]! * (1 - a), fg[2]! * a + bg[2]! * (1 - a)];
    const [l1, l2] = [lum(fgOver), lum(bg)].sort((x, y) => y - x);
    const ratio = (l1! + 0.05) / (l2! + 0.05);
    const px = parseFloat(cs.fontSize);
    const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    checked++;
    if (ratio < (large ? 3 : 4.5)) failed++;
  }
  out.contrast_checked = checked;
  out.contrast_fail = failed;
  out.contrast_unknown = unknown;

  // Motion.
  const anims = document.getAnimations().filter((x) => x.playState === "running");
  out.anim_running = anims.length;
  out.anim_infinite = anims.filter((x) => x.effect?.getTiming().iterations === Infinity).length;

  // Web vitals + long tasks / long animation frames AFTER the load event (the observation window).
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const ux = (window as unknown as {
    __ux?: { lcp: number; cls: number; lt: number[][]; loaf: number[][]; clsTop: string; clsTopValue: number; clsTopDy: number };
  }).__ux;
  const loadEnd = nav?.loadEventEnd || performance.now();
  out.ttfb_ms = nav ? nav.responseStart : 0;
  out.dcl_ms = nav ? nav.domContentLoadedEventEnd : 0;
  out.load_ms = nav ? nav.loadEventEnd : 0;
  out.html_kb = nav ? nav.encodedBodySize / 1024 : 0;
  out.lcp_ms = ux?.lcp ?? 0;
  out.cls_x10000 = Math.round((ux?.cls ?? 0) * 10_000);
  out.cls_top_x10000 = Math.round((ux?.clsTopValue ?? 0) * 10_000);
  out.cls_top_dy_px = Math.round(ux?.clsTopDy ?? 0);
  // The final height of the block named by cls_top (0 when it is not a testid).
  const topBlock = ux?.clsTop ? document.querySelector(`[data-testid="${CSS.escape(ux.clsTop)}"]`) : null;
  out.cls_top_h_px = topBlock ? Math.round(topBlock.getBoundingClientRect().height) : 0;
  const lt = (ux?.lt ?? []).filter(([s]) => s! >= loadEnd);
  out.longtasks_total = ux?.lt.length ?? 0;
  out.longtasks_after = lt.length;
  out.longtask_after_ms = lt.reduce((s, [, d]) => s + d!, 0);
  const loaf = (ux?.loaf ?? []).filter(([s]) => s! >= loadEnd);
  out.loaf_after = loaf.length;
  out.loaf_block_after_ms = loaf.reduce((s, [, , b]) => s + b!, 0);

  // Failure surfaces.
  const shown = (id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return el && visible(el) ? 1 : 0;
  };
  out.error_boundary = shown("error-boundary-message") + shown("global-error-message");
  out.not_found = shown("branded-not-found");
  return out;
}

export type AxeCounts = { critical: number; serious: number; moderate: number; minor: number; nodes: number; criticalRules: string[] };

export async function runAxe(page: Page): Promise<AxeCounts | null> {
  if (!AXE_SOURCE) return null;
  const work = (async () => {
    // Evaluated through the DevTools protocol (not a <script> tag), so the page's CSP does not block it.
    await page.evaluate(`(() => { ${AXE_SOURCE}\n; return typeof window.axe; })()`);
    return page.evaluate(async () => {
      type Violation = { id: string; impact?: string | null; nodes: unknown[] };
      const axe = (window as unknown as { axe?: { run: (c: Document, o: object) => Promise<{ violations: Violation[] }> } }).axe;
      if (!axe) return null;
      const r = await axe.run(document, { resultTypes: ["violations"] });
      const c: AxeCounts = { critical: 0, serious: 0, moderate: 0, minor: 0, nodes: 0, criticalRules: [] };
      for (const v of r.violations) {
        const k = (v.impact ?? "minor") as "critical" | "serious" | "moderate" | "minor";
        if (k in c) c[k]++;
        c.nodes += v.nodes.length;
        if (k === "critical") c.criticalRules.push(v.id); // axe rule ids (e.g. "button-name"), never page content
      }
      return c;
    });
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => {
    timer = setTimeout(() => r(null), 20_000);
  });
  try {
    return await Promise.race([work.catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The largest layout shift's source, as a component name only: the nearest
 *  data-testid (or a tag), reduced to [A-Za-z0-9_-] so no page text can leak. */
export function clsTopSource(): string {
  const ux = (window as unknown as { __ux?: { clsTop?: string } }).__ux;
  return (ux?.clsTop ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) || "none";
}

/** Top components holding small tap targets and primary CTAs, as
 *  `name:count,name:count` — names reduced to [A-Za-z0-9_-], no page text. */
export function componentTops(): { small: string; cta: string } {
  const c = (window as unknown as { __uxComponents?: { smallBy: Map<string, number>; ctaBy: Map<string, number> } }).__uxComponents;
  const fmt = (m: Map<string, number> | undefined, n: number) =>
    m && m.size
      ? [...m]
          .sort((a, b) => b[1] - a[1])
          .slice(0, n)
          // 500–504 are zero-padded: walk-brakes reads a bare 50x as an HTTP 5xx.
          .map(([k, v]) => `${k.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "x"}:${v >= 500 && v <= 504 ? `0${v}` : v}`)
          .join(",")
      : "none";
  return { small: fmt(c?.smallBy, 3), cta: fmt(c?.ctaBy, 8) };
}
