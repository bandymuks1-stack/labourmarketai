import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Guard for W14 — analytics locale truth.
 *
 * THE DEFECT. The client tracker (`lib/telemetry/task.ts`) reads the real
 * locale off the path, but every SERVER-emitted event hardcoded `locale: "lt"`.
 * `pilot_events` therefore held a MIX — honest locales from the browser, a
 * fabricated one from every server action — and a locale breakdown over that
 * table looks perfectly plausible while over-reporting Lithuanian by however
 * many events happen to be emitted server-side. Nothing on the chart marked
 * which rows were guessed.
 *
 * THE RULE. A telemetry row records the locale it OBSERVED, or says it does not
 * know. It never guesses, and it never guesses the default.
 *
 * Note the fallback is `"unknown"`, not `defaultLocale`. Falling back to "lt"
 * would reproduce the original bug with better intentions: an unmeasured row
 * would still enter the data as a measured one. This mirrors the planning
 * projection, which NAMES a source it could not read rather than dropping it.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const RESOLVER = "lib/telemetry/server-locale.ts";

function sourceFiles(): { rel: string; code: string }[] {
  const out: { rel: string; code: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const src = readFileSync(full, "utf8");
      out.push({
        rel: relative(WEB_ROOT, full).split(sep).join("/"),
        // Comments blanked so prose describing the old bug is not mistaken
        // for the old bug.
        code: src
          .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length)),
      });
    }
  };
  for (const d of ["app", "components", "lib"]) walk(join(WEB_ROOT, d));
  return out;
}

const FILES = sourceFiles();
const byRel = (rel: string) => FILES.find((f) => f.rel === rel);

describe("the scan is wired to real files", () => {
  it("walks a non-trivial tree", () => {
    expect(FILES.length).toBeGreaterThan(500);
  });

  it("the resolver exists where the emitters import it from", () => {
    expect(byRel(RESOLVER), RESOLVER).toBeDefined();
  });
});

describe("no telemetry row hardcodes a locale", () => {
  it("nothing passes a literal locale into a telemetry event", () => {
    // Matches `locale: "xx"` inside the telemetry emit shape. The resolver
    // itself is exempt — it is where the honest fallback is DEFINED.
    const bad: string[] = [];
    for (const { rel, code } of FILES) {
      if (rel === RESOLVER) continue;
      if (!/recordTelemetryEvent|emitServerFunnelEvent/.test(code)) continue;
      code.split("\n").forEach((line, i) => {
        if (/\blocale:\s*["'][a-z]{2}["']/.test(line)) {
          bad.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});

describe("the server emitters resolve the real locale", () => {
  const EMITTERS = ["lib/telemetry/server-funnel.ts", "lib/demand/demand-request.ts"] as const;

  for (const rel of EMITTERS) {
    it(`${rel} calls the resolver`, () => {
      const f = byRel(rel);
      expect(f, `${rel} must exist`).toBeDefined();
      expect(f!.code).toMatch(/serverEventLocale\(\)/);
    });
  }

  it("the shared server emitter resolves attribution AND locale before inserting", () => {
    const src = byRel("lib/telemetry/server-funnel.ts")!.code;
    // THE PROPERTY: both resolvers are awaited CONCURRENTLY, in one
    // Promise.all, before the insert. Pinning the exact two-element literal
    // instead made this fail the moment a third resolver was added to the same
    // call (W14 item 5's preview marker) — a green-to-red flip that said
    // nothing about the behaviour it exists to protect.
    const all = src.match(/Promise\.all\(\[([\s\S]*?)\]\)/);
    expect(all, "the emitter must resolve its inputs in one Promise.all").toBeTruthy();
    expect(all![1]).toMatch(/analyticsAttributionMetadata\(\)/);
    expect(all![1]).toMatch(/serverEventLocale\(\)/);
    // Still fire-and-forget: a telemetry failure must never break the action.
    expect(src).toMatch(/\.catch\(/);
    expect(src).toMatch(/^\s*void /m);
  });
});

describe("the fallback is honest, not the default locale", () => {
  const src = byRel(RESOLVER)!.code;

  it('resolves to "unknown" when the request locale cannot be read', () => {
    expect(src).toMatch(/export const UNKNOWN_LOCALE = "unknown"/);
    expect(src).toMatch(/catch\s*\{[\s\S]*return UNKNOWN_LOCALE;/);
  });

  it("never falls back to a real locale code", () => {
    // A `?? "lt"` here would be the original defect wearing a helper's clothes.
    expect(src).not.toMatch(/["'](lt|en|ru|nl|de)["']/);
    expect(src).not.toMatch(/defaultLocale/);
  });

  it("reads the request locale rather than a path or a header it parses itself", () => {
    expect(src).toMatch(/from "next-intl\/server"/);
    expect(src).toMatch(/getLocale\(\)/);
  });

  it("is server-only, so it cannot be imported into a client bundle", () => {
    expect(src).toMatch(/import "server-only"/);
  });

  it("bounds the value to the column width the insert allows (16)", () => {
    expect(src).toMatch(/slice\(0, 16\)/);
  });
});

describe("the client tracker is unchanged — it already read the real locale", () => {
  it("still derives the locale from the path", () => {
    const src = byRel("lib/telemetry/task.ts")!.code;
    expect(src).toMatch(/function currentLocale/);
    expect(src).toMatch(/document\.location\.pathname/);
  });
});
