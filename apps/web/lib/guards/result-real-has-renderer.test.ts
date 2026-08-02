import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONVERSATION_ACTIONS } from "@/lib/conversation/action-registry";
import { CONVERSATION_RESULTS } from "@/lib/conversation/result-registry";

/**
 * A result declared `real` MUST have an inline renderer.
 *
 * W11 audit P0-4. `dataReadiness: "real"` does two things at once, and only one
 * of them is obvious. It advertises a verified data path — and it makes
 * `canRenderInline` return true, which sends `ResultBody` down the inline
 * branch and SKIPS the honest fallback:
 *
 *     if (canRenderInline(kind, context)) return <InlineResult … />;   // ← taken
 *     …fallback with the "open full screen" button…                   // ← never runs
 *
 * `project`, `evidence` and `invoice` were all marked `real` with no matching
 * `case` in `InlineResult`. Each therefore fell to `default:` and rendered the
 * single sentence "Preparing this result." — with no button to
 * `/dashboard/projects`, `/dashboard/documents` or `/dashboard/finance`. The
 * readiness flag did not merely overstate; it actively suppressed the way
 * forward that `result-body.tsx` calls "the NO REGRESSION guarantee".
 *
 * The registry's existing guard only pinned that `openedBy` action ids exist.
 * Nothing pinned that a `real` result can actually render. This is that
 * missing invariant.
 *
 * Read as TEXT rather than by rendering: the renderers are client components
 * with heavy transitive imports (Leaflet, chart and Supabase modules), and the
 * fact under test is a structural one — does a `case` exist for this kind. A
 * text scan states that directly and cannot be satisfied by a component that
 * renders nothing.
 */

const WEB = join(__dirname, "..", "..");
const RESULT_BODY = join(WEB, "components", "app", "workspace", "result-body.tsx");
const source = readFileSync(RESULT_BODY, "utf8");

/** The `InlineResult` switch body — not the whole file. */
function inlineSwitchBody(): string {
  const start = source.indexOf("function InlineResult");
  expect(start, "InlineResult must exist in result-body.tsx").toBeGreaterThan(-1);
  const sw = source.indexOf("switch (kind)", start);
  expect(sw, "InlineResult must switch on kind").toBeGreaterThan(-1);
  return source.slice(sw);
}

/** Kinds with an explicit `case "…":` in InlineResult. */
function renderedKinds(): Set<string> {
  const body = inlineSwitchBody();
  return new Set(
    [...body.matchAll(/case\s+"([a-z-]+)"\s*:/g)].map((m) => m[1]),
  );
}

describe("every `real` result has an inline renderer (W11 P0-4)", () => {
  const rendered = renderedKinds();

  it("found the InlineResult switch and its cases", () => {
    expect(rendered.size).toBeGreaterThan(0);
  });

  it("no `real` result falls through to the pending stub", () => {
    const orphaned = CONVERSATION_RESULTS.filter(
      (r) => r.dataReadiness === "real" && !rendered.has(r.kind),
    ).map((r) => r.kind);

    expect(
      orphaned,
      `These results claim dataReadiness "real" but have no case in InlineResult, ` +
        `so canRenderInline() is true and the honest fallback — the only thing ` +
        `offering "open full screen" — is skipped. They render "Preparing this ` +
        `result." and dead-end. Either add a case, or set dataReadiness to ` +
        `"unverified": ${orphaned.join(", ")}`,
    ).toEqual([]);
  });

  it("every case in InlineResult belongs to a declared result kind", () => {
    // The other direction: a renderer for a kind the registry does not declare
    // is dead code that no `?result=` value can reach.
    const declared = new Set<string>(CONVERSATION_RESULTS.map((r) => r.kind));
    const stray = [...rendered].filter((k) => !declared.has(k));
    expect(stray, `renderer(s) for undeclared result kind(s): ${stray.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("the honest fallback still exists and still offers the full screen", () => {
  it("ResultBody keeps the fallback branch with its open-full button", () => {
    // If this disappears, `unverified` stops being honest degradation and
    // starts being a hidden capability — the regression this slice exists to
    // prevent.
    expect(source).toContain('data-testid="result-body-fallback"');
    expect(source).toContain('data-testid="result-body-open-full"');
    expect(source).toContain("descriptor.advancedRoute");
  });

  it("an unverified result is explained, not silently blanked", () => {
    expect(source).toContain("fallbackUnverified");
  });
});

describe("results that are unverified today are unverified on purpose", () => {
  // Pins the W11 P0-4 trio specifically, so a later PR cannot quietly flip one
  // back to `real` without adding its renderer — the guard above would catch
  // it, but this states the intent by name.
  const byKind = Object.fromEntries(
    CONVERSATION_RESULTS.map((r) => [r.kind, r]),
  );

  // `journal` is in this list although the W11 audit did not name it: the
  // guard above found it, and it is the only one of the four that a real
  // action resolves to (`worker.log-work`, first-match-wins over `invoice`).
  for (const kind of ["project", "evidence", "invoice", "journal"] as const) {
    it(`${kind} is unverified until it has a renderer`, () => {
      const r = byKind[kind];
      expect(r, `result kind "${kind}" disappeared from the registry`).toBeDefined();
      if (r.dataReadiness === "real") {
        // Allowed — but ONLY with a renderer. Re-state the reason on failure.
        expect(
          renderedKinds().has(kind),
          `"${kind}" was promoted to "real" without a case in InlineResult`,
        ).toBe(true);
      }
    });
  }
});

describe("every advancedRoute is a route that exists", () => {
  // W11 P2-4: `company.assign-worker` pointed at /dashboard/company/projects,
  // a directory holding only `new/` — no page.tsx — so the "open full screen"
  // affordance for a `strong_irreversible` action led to a 404.
  //
  // This matters twice as much after this slice: flipping four results to
  // `unverified` makes MORE people take the fallback route, and a fallback is
  // only honest degradation if it lands somewhere real.
  //
  // Static routes only. A dynamic segment needs an id this guard has no way to
  // supply, and asserting on `[id]/page.tsx` would prove nothing about whether
  // the concrete link resolves.
  const appDir = join(WEB, "app", "[locale]");
  const isStatic = (route: string) => !route.includes("[");
  const resolves = (route: string) => {
    try {
      readFileSync(join(appDir, ...route.split("/").filter(Boolean), "page.tsx"));
      return true;
    } catch {
      return false;
    }
  };

  it("every result's advancedRoute resolves to a page.tsx", () => {
    const missing = CONVERSATION_RESULTS.filter(
      (r) => isStatic(r.advancedRoute) && !resolves(r.advancedRoute),
    ).map((r) => `${r.kind} → ${r.advancedRoute}`);
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("every action's advancedRoute resolves to a page.tsx", () => {
    const missing = CONVERSATION_ACTIONS.filter(
      (a) => isStatic(a.advancedRoute) && !resolves(a.advancedRoute),
    ).map((a) => `${a.id} → ${a.advancedRoute}`);
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("checked a meaningful number of routes", () => {
    // Guards that silently check nothing are how P2-4 survived this long.
    const checked = [
      ...CONVERSATION_RESULTS.map((r) => r.advancedRoute),
      ...CONVERSATION_ACTIONS.map((a) => a.advancedRoute),
    ].filter(isStatic);
    expect(checked.length).toBeGreaterThanOrEqual(30);
  });
});
