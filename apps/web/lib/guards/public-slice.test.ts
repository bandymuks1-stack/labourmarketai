import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PUBLIC_IMAGERY } from "@/components/marketing/public/public-imagery";

/**
 * PUBLIC ACQUISITION SLICE — guards (premium convergence, 2026-10-02).
 * Truth table: docs/public/PUBLIC_SLICE_TRUTH_TABLE_2026-10-02.md.
 */
const WEB = join(__dirname, "..", "..");
const PUBLIC_DIR = join(WEB, "components", "marketing", "public");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const LOCALES = ["en", "lt", "de", "pl", "ru", "nl"] as const;
const slice = (loc: string) =>
  (JSON.parse(read(`messages/${loc}.json`)) as { publicSlice: Record<string, unknown> }).publicSlice;

function flat(o: unknown, p = ""): [string, string][] {
  if (typeof o === "string") return [[p, o]];
  if (Array.isArray(o)) return o.flatMap((v, i) => flat(v, `${p}[${i}]`));
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k));
  return [];
}

describe("imagery registry — nothing public is shipped unlabelled", () => {
  it("every registered image exists on disk and has an honest status", () => {
    for (const [k, img] of Object.entries(PUBLIC_IMAGERY)) {
      expect(existsSync(join(WEB, "public", img.src)), `${k}: ${img.src}`).toBe(true);
      expect(["sample_fixture", "marketing_photo", "real_portrait"]).toContain(img.status);
    }
  });

  it("public components name no image file except through the registry", () => {
    for (const f of readdirSync(PUBLIC_DIR).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(PUBLIC_DIR, f), "utf8");
      expect(src, `${f} hard-codes an image path`).not.toMatch(/["'`]\/(hero|people|images)\/[^"'`]+\.(webp|jpe?g|png)/);
    }
  });

  it("every component that renders a sample_fixture photograph shows the Example label", () => {
    const hero = read("components/marketing/public/world-heroes.tsx");
    const transition = read("components/marketing/public/work-record-transition.tsx");
    const moments = read("components/marketing/public/product-moments.tsx");
    expect(hero).toMatch(/SamplePill/);
    expect(transition).toMatch(/copy\.sample/);
    // product-moments shows the kitchen photo only inside a MomentCard (always labelled).
    expect(moments).toMatch(/sampleLabel=/);
  });

  it("the sample imagery is never presented as a real user", () => {
    for (const loc of LOCALES) {
      const imagery = JSON.stringify(slice(loc).imagery);
      expect(imagery, loc).not.toMatch(/verified|confirmed|real user|testimonial/i);
    }
  });
});

describe("public slice copy — complete, honest, plain", () => {
  const en = flat(slice("en")).map(([k]) => k).sort();

  it("every locale has exactly the same keys as English", () => {
    // `en` still carries the persona name/org via playercards.sample, never here.
    for (const loc of LOCALES) {
      expect(flat(slice(loc)).map(([k]) => k).sort(), loc).toEqual(en);
    }
  });

  it("provenance is recorded and no locale claims native review", () => {
    const prov = JSON.parse(readFileSync(join(WEB, "..", "..", "docs", "public", "PUBLIC_SLICE_COPY_PROVENANCE.json"), "utf8")) as {
      locales: Record<string, string>;
    };
    for (const loc of LOCALES) expect(Object.keys(prov.locales)).toContain(loc);
    expect(Object.values(prov.locales)).not.toContain("NATIVE_REVIEWED");
  });

  it("makes none of the claims the truth table marks unsupported or too broad", () => {
    const all = LOCALES.flatMap((l) => flat(slice(l)).map(([, v]) => v))
      .join("\n")
      .replace(/LabourMarket\.ai/gi, "LabourMarket");
    const forbidden: RegExp[] = [
      /free forever/i, // owner wording is "launch pricing"
      /you decide who sees your history/i, // PARTIAL — see truth table section C
      /\bdemo\b/i,
      /guarantee/i,
      /whole (team|brigade)/i, // whole-team assignment is NOT_BUILT
      /attendance|on site today|who is on site/i, // attendance is not modelled
      /capacity (plan|grid|forecast)/i, // DEM-8 MISSING
      /universal (score|rating)(?! )/i,
      /(?<![\p{L}\p{N}])(AI|artificial intelligence)(?![\p{L}\p{N}])/iu, // no AI claims on the acquisition story
    ];
    for (const re of forbidden) {
      // "never as one universal score" is an honesty statement, allowed in en only.
      const hits = all.split("\n").filter((l) => re.test(l) && !/never as one universal score/i.test(l));
      expect(hits, String(re)).toEqual([]);
    }
  });

  it("states the verified free-for-people fact and the real visibility rule in English", () => {
    const w = JSON.stringify(slice("en").workers);
    expect(w).toMatch(/free for people/i);
    expect(w).toMatch(/Nobody finds you until you switch visibility on/);
    expect(w).toMatch(/not confirmed/i); // unconfirmed work stays the worker's own record
  });
});

describe("page composition", () => {
  const w = read("app/[locale]/(marketing)/for-workers/page.tsx");
  const c = read("app/[locale]/(marketing)/for-companies/page.tsx");

  it("each acquisition page has one hero, the shared transition and a closing CTA to the same route as its hero", () => {
    for (const [name, src] of [["workers", w], ["companies", c]] as const) {
      expect((src.match(/<(Workers|Companies)WorldHero/g) ?? []).length, name).toBe(1);
      expect(src, name).toMatch(/<WorkRecordTransitionSection/);
      expect(src, name).toMatch(/<PublicCtaEnd/);
    }
    const heroes = read("components/marketing/public/world-heroes.tsx");
    expect(heroes).toMatch(/href="\/auth\/signup" ctaId="workers_hero"/);
    expect(w).toMatch(/href="\/auth\/signup"/);
    expect(heroes).toMatch(/href="\/company-need" ctaId="companies_hero"/);
    expect(c).toMatch(/href="\/company-need"/);
  });

  it("the homepage mounts the transition and the two-door fork", () => {
    const home = read("app/[locale]/focus-landing/focus-landing.tsx");
    expect(home).toMatch(/<HomeWorldHero/);
    expect(home).toMatch(/<WorkRecordTransitionSection embedded/);
    expect(home).toMatch(/<HomeSides/);
  });

  it("the transition never loops and honours reduced motion", () => {
    const t = read("components/marketing/public/work-record-transition.tsx");
    expect(t).toMatch(/prefers-reduced-motion: reduce/);
    expect(t).toMatch(/played\.current/);
    expect(t).not.toMatch(/setInterval/);
    expect(t).toMatch(/motion-reduce:/);
  });
});
