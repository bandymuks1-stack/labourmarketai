import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PRODUCT DOES NOT EXPLAIN ITSELF TO THE PERSON USING IT.
 *
 * ── OWNER RULE, 2026-09-27 (§1), PROJECT-WIDE — not landing-only
 *
 * These were live on production `/lt`:
 *
 *   "Darbo rinka egzistuoja tikrose vietose."
 *   "Žmonės, darbai ir poreikiai yra kažkur."
 *   "Žemėlapis yra produkto dalis, o ne paveikslėlis prie teksto."
 *   "Tai rinkos, ne šios dienos veikla."
 *
 * Every one of them is the product telling a visitor what one of its components
 * MEANS, or what it IS NOT, in the product's own architectural terms. None of
 * them helps anybody decide or do anything.
 *
 * THE RULE IS NOT "REWRITE IT NICER". If a person does not need a sentence in
 * order to act or decide, it leaves the human UI. Technical truth belongs in
 * logs, telemetry, admin tooling, or the existing provenance/detail layer.
 *
 * ── WHAT THIS GUARD IS, AND HONESTLY IS NOT
 *
 * It CANNOT judge tone. What it can do is make the specific sentences the owner
 * named unrepeatable, and catch the narrow SHAPE they share — copy whose subject
 * is a component of this product rather than the person's work. A phrase list is
 * a floor, not a definition of good copy; the reviewer still has to read.
 */

const WEB = join(__dirname, "..", "..");
const MESSAGES = join(WEB, "messages");

/**
 * The exact sentences the owner banned, as substrings (fragments, so a reworded
 * wrapper around the same claim still trips). Lower-cased at comparison.
 */
const BANNED_FRAGMENTS: readonly string[] = [
  // "the labour market exists in real places"
  "darbo rinka egzistuoja tikrose vietose",
  // "people, jobs and needs are somewhere"
  "darbai ir poreikiai yra kažkur",
  // "the map is part of the product, not a picture next to text"
  "yra produkto dalis, o ne paveikslėlis",
  // "these are markets, not today's activity"
  "ne šios dienos veikla",
  // The English/other-locale siblings of the same claims.
  "the labour market exists in real places",
  "people, work and needs are somewhere",
  "part of the product, not a picture",
  "markets, not today's activity",
];

/**
 * WHERE THE BANNED COPY IS STILL ALLOWED TO SIT — AND WHY THAT IS NOT A LOOPHOLE.
 *
 * The owner's rule is "remove it from every HUMAN-VISIBLE surface", and the
 * separate instruction on the same day was "do not delete the map code or
 * capability". Those pull in opposite directions for the copy itself, so the
 * line is drawn at RENDERING, not at file contents:
 *
 *   · `landing.marketMap.*` — the three banned sentences. Its ONLY consumer is
 *     `public-market-map-band.tsx`, which is no longer rendered anywhere. Keeping
 *     the keys is what lets that component stay compiling and revivable; the
 *     tests below prove nothing renders it.
 *   · `map.origin.coverage` — a one-word badge ("Rinkos, ne veikla") shown by
 *     `<MarketMap>` only when a view's `origin === "coverage"`.
 *     `publicCoverageView()` is the only producer of that origin, and the band
 *     that called it is withdrawn.
 *
 * DELETING EITHER WOULD BE WORSE, not stricter: a component reading a removed
 * key renders the raw key path at a person (`i18n-key-resolution-static` exists
 * because that has happened), and the first attempt at this guard did exactly
 * that — deleting `landing.marketMap` broke the i18n resolution guard while the
 * band still read it. So the copy stays on disk, unreachable, and the
 * reachability is what is pinned.
 */
const EXEMPT_KEY_PATHS: readonly string[] = ["map.origin.coverage"];

/** Namespaces whose ONLY consumer is a component nothing renders. */
const WITHDRAWN_NAMESPACES: readonly string[] = ["landing.marketMap."];

type Json = Record<string, unknown>;

function* flatten(node: unknown, path = ""): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path, node];
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Json)) {
      yield* flatten(v, path ? `${path}.${k}` : k);
    }
  }
}

const localeFiles = readdirSync(MESSAGES).filter((f) => f.endsWith(".json"));

describe("no internal or self-explaining copy in the human UI", () => {
  it("scans every locale catalogue", () => {
    expect(localeFiles.length).toBeGreaterThanOrEqual(11);
  });

  it("none of the banned sentences survives anywhere in the copy", () => {
    const offenders: string[] = [];
    for (const file of localeFiles) {
      const messages = JSON.parse(
        readFileSync(join(MESSAGES, file), "utf8"),
      ) as Json;
      for (const [path, value] of flatten(messages)) {
        if (EXEMPT_KEY_PATHS.includes(path)) continue;
        if (WITHDRAWN_NAMESPACES.some((ns) => path.startsWith(ns))) continue;
        const haystack = value.toLowerCase();
        for (const fragment of BANNED_FRAGMENTS) {
          if (haystack.includes(fragment)) {
            offenders.push(`${file} → ${path}: "${fragment}"`);
          }
        }
      }
    }
    expect(
      offenders,
      `internal/self-explaining copy reached the human UI:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("ANTI-VACUITY: the fragment list really does match the old copy", () => {
    // A banned-phrase guard that matches nothing is decoration. This proves the
    // list would have caught the production strings it was written against.
    const wasLive = [
      "Darbo rinka egzistuoja tikrose vietose.",
      "Žmonės, darbai ir poreikiai yra kažkur.",
      "Žemėlapis yra produkto dalis, o ne paveikslėlis prie teksto.",
      "Tai rinkos, ne šios dienos veikla.",
    ];
    for (const sentence of wasLive) {
      const hit = BANNED_FRAGMENTS.some((f) =>
        sentence.toLowerCase().includes(f),
      );
      expect(hit, `the list must catch: ${sentence}`).toBe(true);
    }
  });

  it("the withdrawn namespace has exactly ONE consumer, and it is the withdrawn band", () => {
    /*
     * This is what keeps the `landing.marketMap` exemption from becoming a
     * loophole. The banned sentences may stay on disk only while the single
     * component that reads them renders nowhere. If a second consumer appears,
     * the copy is live again and this fails.
     */
    const consumers: string[] = [];
    const stack = [join(WEB, "app"), join(WEB, "components"), join(WEB, "lib")];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(p);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue;
        const rel = p.slice(WEB.length + 1).replace(/\\/g, "/");
        // `lib/guards/**` is not rendered UI. It is excluded because the
        // landing-freeze record and this file both NAME the namespace in prose
        // to explain the withdrawal — a scan that counted those would report the
        // explanation as a consumer, which it did on the first run.
        if (rel.startsWith("lib/guards/")) continue;
        // Comments stripped for the same reason, one layer down: a component may
        // legitimately mention the namespace while explaining that it is dead.
        const code = readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        if (/["'`]landing\.marketMap/.test(code)) {
          consumers.push(rel);
        }
      }
    }
    expect(consumers.sort()).toEqual([
      "components/marketing/public-market-map-band.tsx",
    ]);
  });

  it("the exempted badge really is out of human reach", () => {
    // The exemption above is only honest while no rendered surface produces a
    // coverage-origin map. `publicCoverageView()` is the only producer, and the
    // band that rendered it is withdrawn from the landing.
    const focus = readFileSync(
      join(WEB, "app", "[locale]", "focus-landing", "focus-landing.tsx"),
      "utf8",
    );
    expect(focus).not.toMatch(/<PublicMarketMapBand/);
    // If some other surface starts rendering it, this fails and the exemption
    // has to be revisited rather than silently covering live copy.
    const callers: string[] = [];
    const stack = [join(WEB, "app"), join(WEB, "components")];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        if (name.name === "node_modules" || name.name === ".next") continue;
        const p = join(dir, name.name);
        if (name.isDirectory()) {
          stack.push(p);
          continue;
        }
        if (!name.name.endsWith(".tsx") || name.name.includes(".test.")) continue;
        if (p.endsWith("public-market-map-band.tsx")) continue;
        if (/<PublicMarketMapBand/.test(readFileSync(p, "utf8"))) {
          callers.push(p.slice(WEB.length + 1));
        }
      }
    }
    expect(callers, "the withdrawn band is rendered again").toEqual([]);
  });
});
