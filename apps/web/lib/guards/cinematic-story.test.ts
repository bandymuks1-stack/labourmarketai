import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAMERA_CONSTRUCTION,
  CAMERA_HOSPITALITY,
  CHAPTER_FIRST_SCENE,
  CHAPTER_KEYS,
  LAYOUT,
  LINES,
  OVERVIEW,
  SCENE_CHAPTERS,
  SCENES,
  backdropsNeeded,
  restingCamera,
  type Camera,
} from "@/components/marketing/public/cinematic-script";

/**
 * THE CINEMATIC STORY (owner directive 2026-10-02, premium design programme).
 *
 * One continuous story — one persistent set of entities on one stage — that
 * replaces the static transition on Home, /for-workers and /for-companies. These
 * guards pin the properties that make it a story rather than a carousel, and the
 * properties that make it safe: existing motion stack only, a real reduced-motion
 * composition, lazy photographs, honest copy.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const LOCALES = ["en", "lt", "de", "pl", "ru", "nl"] as const;
const cinema = (loc: string) => (JSON.parse(read(`messages/${loc}.json`)) as { publicCinema: Record<string, unknown> }).publicCinema;

function flat(o: unknown, p = ""): [string, string][] {
  if (typeof o === "string") return [[p, o]];
  if (Array.isArray(o)) return o.flatMap((v, i) => flat(v, `${p}[${i}]`));
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k));
  return [];
}

describe("the script is one continuous story", () => {
  it("has nine scenes plus the static overview, and a camera for each", () => {
    expect(SCENES).toBe(9);
    expect(OVERVIEW).toBe(9);
    expect(CAMERA_CONSTRUCTION).toHaveLength(10);
    expect(CAMERA_HOSPITALITY).toHaveLength(10);
  });

  it("the same person is on stage in every scene (persistence, not slides)", () => {
    for (let i = 0; i <= OVERVIEW; i++) expect(LAYOUT.person[i], `person @${i}`).toBeDefined();
  });

  it("the company side persists from the first meeting to the end", () => {
    for (let i = 1; i <= 9; i++) expect(LAYOUT.org[i], `org @${i}`).toBeDefined();
  });

  it("every entity stays on the stage, desktop and phone", () => {
    for (const [id, table] of Object.entries(LAYOUT)) {
      for (const [scene, p] of Object.entries(table)) {
        for (const [x, y] of [p.d, p.m]) {
          expect(x, `${id}@${scene} x`).toBeGreaterThanOrEqual(8);
          expect(x, `${id}@${scene} x`).toBeLessThanOrEqual(94);
          expect(y, `${id}@${scene} y`).toBeGreaterThanOrEqual(8);
          expect(y, `${id}@${scene} y`).toBeLessThanOrEqual(94);
        }
      }
    }
  });

  it("a relationship line is only drawn between two entities that are on stage in that scene", () => {
    for (const [scene, lines] of Object.entries(LINES)) {
      for (const l of lines) {
        expect(LAYOUT[l.from][Number(scene)], `${l.from} @${scene}`).toBeDefined();
        expect(LAYOUT[l.to][Number(scene)], `${l.to} @${scene}`).toBeDefined();
      }
    }
  });

  it("the camera never reveals the edge of the photograph", () => {
    const check = (c: { s: number; x: number; y: number; o: string }, label: string) => {
      const [ox, oy] = c.o.split(" ").map((v) => parseFloat(v) / 100) as [number, number];
      const xr = [-(1 - ox) * (c.s - 1) * 100, ox * (c.s - 1) * 100];
      const yr = [-(1 - oy) * (c.s - 1) * 100, oy * (c.s - 1) * 100];
      expect(c.x, `${label} x`).toBeGreaterThanOrEqual(xr[0]!);
      expect(c.x, `${label} x`).toBeLessThanOrEqual(xr[1]!);
      expect(c.y, `${label} y`).toBeGreaterThanOrEqual(yr[0]!);
      expect(c.y, `${label} y`).toBeLessThanOrEqual(yr[1]!);
    };
    for (const [name, cams] of [["construction", CAMERA_CONSTRUCTION], ["hospitality", CAMERA_HOSPITALITY]] as const) {
      cams.forEach((c: Camera, i) => {
        check(c, `${name}[${i}]`);
        if (c.m) check({ ...c.m }, `${name}[${i}].m`);
      });
    }
  });

  it("the camera actually moves: no two consecutive scenes share the same framing", () => {
    for (const cams of [CAMERA_CONSTRUCTION, CAMERA_HOSPITALITY]) {
      for (let i = 1; i < SCENES; i++) {
        const a = cams[i - 1]!;
        const b = cams[i]!;
        expect(a.bg !== b.bg || a.s !== b.s || a.x !== b.x || a.y !== b.y, `scene ${i}`).toBe(true);
      }
    }
  });

  it("explains the five things: find work, find people, run the work, keep the record, move forward", () => {
    expect(CHAPTER_KEYS).toHaveLength(5);
    const lit = new Set(Object.values(SCENE_CHAPTERS).flat());
    expect([...lit].sort()).toEqual([0, 1, 2, 3, 4]);
    for (const first of CHAPTER_FIRST_SCENE) expect(first).toBeLessThan(SCENES);
    expect(CHAPTER_FIRST_SCENE).toHaveLength(5);
  });

  it("photographs are mounted lazily: a scene needs only itself and the next", () => {
    expect(backdropsNeeded(CAMERA_CONSTRUCTION, 0).length).toBeLessThanOrEqual(2);
    expect(backdropsNeeded(CAMERA_CONSTRUCTION, 8).length).toBeLessThanOrEqual(2);
    expect(restingCamera(CAMERA_CONSTRUCTION, "van", 5).bg).toBe("van");
  });
});

describe("the component uses the existing stack only and degrades honestly", () => {
  const src = read("components/marketing/public/cinematic-story.tsx");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("no WebGL, canvas, particles, or new animation framework", () => {
    expect(code).not.toMatch(/from "(three|gsap|lenis|@react-three|lottie|motion)[^"]*"/);
    expect(code).not.toMatch(/WebGL|<canvas|getContext\(/);
    expect(code).not.toMatch(/cyan/i);
  });

  it("scene is chosen by IntersectionObserver, never a scroll handler that sets state; no timers loop", () => {
    expect(code).toMatch(/new IntersectionObserver/);
    expect(code).not.toMatch(/setInterval/);
    // the only scroll listener writes one CSS variable (depth) and is passive
    expect(code).toMatch(/addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
    expect(code).toMatch(/style\.setProperty\("--p"/);
  });

  it("reduced motion renders the complete composition and unpins", () => {
    expect(code).toMatch(/prefers-reduced-motion: reduce/);
    expect(code).toMatch(/reduced \? OVERVIEW/);
    const css = read("app/globals.css");
    const block = css.slice(css.indexOf("CINEMATIC STORY"));
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cine-pin \{ position: relative; \}/);
    expect(block).toMatch(/\.cine-bd, \.cine-ent \{ transition: none/);
  });

  it("the stage is decorative to assistive tech; the whole story is a real ordered list", () => {
    expect(code).toMatch(/className="cine-stage"[^>]*aria-hidden/);
    expect(code).toMatch(/<ol className="cine-beats">/);
    expect(code).toMatch(/sr-only motion-reduce:not-sr-only/);
  });

  it("keyboard: chapter rail buttons are real buttons with a visible focus ring and a 44px floor", () => {
    expect(code).toMatch(/<button[\s\S]{0,200}type="button"/);
    expect(code).toMatch(/min-h-11/);
    expect(code).toMatch(/focus-visible:ring-2/);
  });

  it("the stage is labelled as an example and uses only registered photographs", () => {
    expect(code).toMatch(/copy\.sample/);
    expect(code).not.toMatch(/["'`]\/(hero|people|images)\//);
  });

  it("opacity and transform only: no layout-property transitions in the story CSS", () => {
    const css = read("app/globals.css");
    const block = css.slice(css.indexOf("CINEMATIC STORY"));
    for (const m of block.matchAll(/transition:\s*([^;]+);/g)) {
      expect(m[1], m[0]).not.toMatch(/\b(left|top|width|height|margin|padding)\b/);
    }
  });
});

describe("pages mount the story and keep their canonical routes", () => {
  it("home: hero, then the working entry, then the story (full-bleed), then the two doors", () => {
    const f = read("app/[locale]/focus-landing/focus-landing.tsx");
    expect(f).toMatch(/<CinematicStorySection audience="home"/);
    expect(f.indexOf("<HomeWorldHero")).toBeLessThan(f.indexOf("<PublicEntry"));
    expect(f.indexOf("<PublicEntry")).toBeLessThan(f.indexOf("<CinematicStorySection"));
    expect(f.indexOf("<CinematicStorySection")).toBeLessThan(f.indexOf("<HomeSides"));
  });
  it("/for-workers and /for-companies mount it and still end on their canonical action", () => {
    const w = read("app/[locale]/(marketing)/for-workers/page.tsx");
    const c = read("app/[locale]/(marketing)/for-companies/page.tsx");
    expect(w).toMatch(/<CinematicStorySection audience="workers"/);
    expect(c).toMatch(/<CinematicStorySection[^>]*world="hospitality"[^>]*audience="companies"|<CinematicStorySection[^>]*audience="companies"[^>]*world="hospitality"/);
    expect(w).toMatch(/href="\/auth\/signup"/);
    expect(c).toMatch(/href="\/company-need"/);
  });
});

describe("cinematic copy — complete in six languages and honest", () => {
  const en = flat(cinema("en")).map(([k]) => k).sort();

  it("every locale has exactly the English keys, and nine scenes with a title and a body", () => {
    for (const loc of LOCALES) {
      expect(flat(cinema(loc)).map(([k]) => k).sort(), loc).toEqual(en);
      expect((cinema(loc).scenes as unknown[]).length, loc).toBe(9);
      expect((cinema(loc).chapters as unknown[]).length, loc).toBe(5);
    }
  });

  it("is translated, not copied: each non-English locale differs from English", () => {
    const e = new Map(flat(cinema("en")));
    for (const loc of LOCALES.filter((l) => l !== "en")) {
      const same = flat(cinema(loc)).filter(([k, v]) => e.get(k) === v && v.length > 12);
      expect(same, loc).toEqual([]);
    }
  });

  it("keeps the placeholders the component fills", () => {
    for (const loc of LOCALES) {
      const c = cinema(loc) as { scenes: { body: string }[]; addedBy: string; nextMeta: string };
      expect(c.scenes[0]!.body, loc).toContain("{name}");
      expect(c.scenes[0]!.body, loc).toContain("{trade}");
      expect(c.addedBy, loc).toContain("{name}");
      expect(c.nextMeta, loc).toContain("{name}");
    }
  });

  it("makes none of the claims the truth table marks unsupported", () => {
    const all = LOCALES.flatMap((l) => flat(cinema(l)).map(([, v]) => v)).join("\n");
    const forbidden: RegExp[] = [
      /\bdemo\b/i,
      /guarantee/i,
      /free forever/i,
      /whole (team|brigade)/i,
      /attendance|on site today|who is on site/i,
      /capacity (plan|grid|forecast)/i,
      /(?<![\p{L}\p{N}])(AI|artificial intelligence)(?![\p{L}\p{N}])/iu,
      /\bverified\b/i, // the story says "confirmed by a manager", never "verified"
      /\b(hired|booked|matched)\b/i, // nothing in the story claims an outcome the product does not record
    ];
    for (const re of forbidden) {
      const hits = all.split("\n").filter((l) => re.test(l));
      expect(hits, String(re)).toEqual([]);
    }
  });

  it("the translation scene only promises what the contract promises: readable in the viewer's language, original kept", () => {
    const c = cinema("en") as { scenes: { body: string }[]; translateTag: string };
    expect(c.scenes[2]!.body).toMatch(/original kept beside/);
    expect(c.translateTag).toMatch(/original kept/);
  });
});
