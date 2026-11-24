import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Guard for W14 — a declared funnel event is not an emitted one.
 *
 * THE DEFECT. `dashboard_viewed` is the FIRST step of the activation funnel,
 * and nothing ever sent it.
 *
 * `lib/conversation/action-registry.ts` carries `telemetryEvent: E.dashboardViewed`
 * on its entries, which looks like an emitter and reads like one. It is not.
 * The field is declared on the entry type, assigned on 13 entries, asserted by
 * `action-registry.test.ts` to be a valid event NAME — and **never read by any
 * code that emits**. Nothing anywhere passes `action.telemetryEvent` to
 * `trackFunnel`, `emitServerFunnelEvent`, or `TelemetryView`.
 *
 * WHY IT SURVIVED. `activation-funnel-telemetry.test.ts` checked that the
 * registry file CONTAINS the string `dashboardViewed`. It does. A guard that
 * greps for an identifier cannot tell a declaration from an emission, so it
 * certified coverage that did not exist — the funnel's first step reported
 * zero not because nobody opened the dashboard, but because nobody was
 * counting. Of the 13 events the registry declares, `dashboardViewed` was the
 * ONLY one with no real emitter elsewhere; the other 12 were genuinely covered,
 * which is exactly why the gap was easy to miss.
 *
 * THE RULE. Every funnel event a surface claims must be EMITTED by something
 * that actually sends it.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const REGISTRY = "lib/conversation/action-registry.ts";
const EVENTS = "lib/telemetry/funnel-events.ts";
const ROOT_PAGE = "app/[locale]/dashboard/page.tsx";

/** The three ways this app actually sends a funnel event. */
const EMIT_CALLS = /trackFunnel\s*\(|emitServerFunnelEvent\s*\(|<TelemetryView/;

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

/** Files that both name the event and contain a real emit call. */
function emittersOf(eventKey: string): string[] {
  return FILES.filter(
    (f) =>
      f.rel !== REGISTRY &&
      f.rel !== EVENTS &&
      new RegExp(`FUNNEL_EVENTS\\.${eventKey}\\b|\\bE\\.${eventKey}\\b`).test(f.code) &&
      EMIT_CALLS.test(f.code),
  ).map((f) => f.rel);
}

describe("the scan is wired to real files", () => {
  it("walks a non-trivial tree", () => {
    expect(FILES.length).toBeGreaterThan(500);
  });

  it("the registry and the event catalogue both exist", () => {
    expect(byRel(REGISTRY), REGISTRY).toBeDefined();
    expect(byRel(EVENTS), EVENTS).toBeDefined();
  });
});

describe("dashboard_viewed is actually emitted", () => {
  it("the workspace root fires it on view", () => {
    const page = byRel(ROOT_PAGE);
    expect(page, `${ROOT_PAGE} must exist`).toBeDefined();
    expect(page!.code).toMatch(/<TelemetryView/);
    expect(page!.code).toMatch(/FUNNEL_EVENTS\.dashboardViewed/);
  });

  it("it has at least one REAL emitter, not just a declaration", () => {
    expect(emittersOf("dashboardViewed")).not.toEqual([]);
  });
});

describe("every event the action registry declares has a real emitter", () => {
  // The generalisation of the defect: this is the check that would have caught
  // it. A registry declaration is a CONTRACT, never an emission.
  const declared = [
    ...new Set(
      Array.from(
        byRel(REGISTRY)!.code.matchAll(/telemetryEvent:\s*E\.([A-Za-z]+)/g),
        (m) => m[1],
      ),
    ),
  ].sort();

  it("the registry declares a non-trivial number of events (the scan is real)", () => {
    expect(declared.length).toBeGreaterThan(5);
  });

  for (const key of declared) {
    it(`${key} is emitted somewhere that actually sends it`, () => {
      expect(
        emittersOf(key),
        `${key} is declared in the registry but no file both names it and calls an emitter`,
      ).not.toEqual([]);
    });
  }
});

describe("the registry field is documented as a contract, not an emission", () => {
  it("action-registry says so, so the next reader is not misled as this guard's predecessor was", () => {
    // Read raw: the claim lives in a COMMENT, which the scan blanks.
    const src = readFileSync(join(WEB_ROOT, REGISTRY), "utf8");
    expect(src).toMatch(/NOT an emitter|does not emit|never emitted|not an emission/i);
  });
});
