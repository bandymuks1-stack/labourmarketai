/**
 * Guard: one helper for "click until the client-side result shows"
 * (tests/e2e/click-until-visible.ts; owner decision 2026-11-16).
 *
 * A click that lands before hydration is a silent no-op, so a single click
 * followed by an expect on a client-toggled element is a timing lottery. It
 * failed the same way in three places (learning-practice L-8, skills-chain
 * K-7, and a third lane case), each patched locally with its own retry loop.
 *
 * What a static check can tell reliably, and so what this pins:
 * 1. No spec defines its own copy of the loop under a helper name; the shared
 *    helper is imported instead (the open list below shrinks to zero).
 * 2. In the production walks (prod-*.spec.ts) the "click once if it happens to
 *    be visible" idiom may not grow. Many of its uses are honest optional
 *    clicks (accept a prompt if it shows), which a static check cannot tell
 *    from a hydration race, so each file keeps its current count as a ceiling.
 *    A new client-toggled open must use clickUntilVisible.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const E2E = resolve(__dirname, "..", "..", "tests", "e2e");
const specs = readdirSync(E2E).filter((f) => f.endsWith(".spec.ts"));
const read = (f: string) => readFileSync(resolve(E2E, f), "utf8");

/** Local copies still to move onto the shared helper (empty: every spec imports it). */
const LOCAL_COPY_PENDING: ReadonlySet<string> = new Set<string>();

/** `if (await x.isVisible()…) await x.click(` — a click that happens only when visible. */
const ONCE_IF_VISIBLE = /if \(await ([\w.]+)\.isVisible\(\)(?:\.catch\(\(\) => false\))?\) await \1\.click\(/g;

/** Ceilings per production walk, as of 2026-11-16. Lower one when you replace a use. */
const ONCE_IF_VISIBLE_CEILING: Readonly<Record<string, number>> = {
  "prod-billing-test-mode.spec.ts": 2,
  "prod-brigade-formation.spec.ts": 1,
  "prod-chat-continuity.spec.ts": 1,
  "prod-company-talent-history.spec.ts": 1,
  "prod-fresh-activation.spec.ts": 1,
  "prod-invited-worker.spec.ts": 1,
  "prod-learning-practice.spec.ts": 1,
  "prod-manager-chat.spec.ts": 1,
  "prod-project-execution.spec.ts": 1,
  "prod-recognition-chain.spec.ts": 2,
  "prod-staff-review-notice.spec.ts": 2,
};

describe("one click-until-visible helper", () => {
  it("the helper exists and retries only while the target is hidden", () => {
    const src = readFileSync(resolve(E2E, "click-until-visible.ts"), "utf8");
    expect(src).toMatch(/export async function clickUntilVisible\(/);
    expect(src).toMatch(/if \(!\(await target\.isVisible\(\)\.catch\(\(\) => false\)\)\)/);
    expect(src).toMatch(/\.toPass\(\{ timeout \}\)/);
  });

  it("no spec defines its own copy", () => {
    const copies = specs.filter(
      (f) =>
        !LOCAL_COPY_PENDING.has(f) &&
        /async function (clickUntil|clickUntilVisible|openInvitePanel)\b/.test(read(f)),
    );
    expect(copies).toEqual([]);
  });

  it("the pending list only names files that still hold a copy", () => {
    for (const f of LOCAL_COPY_PENDING) {
      expect(read(f), `${f}: drop it from LOCAL_COPY_PENDING once it imports the helper`).toMatch(
        /async function clickUntil\b/,
      );
    }
  });

  it("production walks do not grow the click-once-if-visible idiom", () => {
    const over: string[] = [];
    for (const f of specs.filter((s) => s.startsWith("prod-"))) {
      const n = read(f).match(ONCE_IF_VISIBLE)?.length ?? 0;
      const ceiling = ONCE_IF_VISIBLE_CEILING[f] ?? 0;
      if (n > ceiling) over.push(`${f}: ${n} > ${ceiling} — use clickUntilVisible for a client-toggled open`);
    }
    expect(over).toEqual([]);
  });
});
