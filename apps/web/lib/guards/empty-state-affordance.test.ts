import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Affordance guard for the shared <EmptyState> (slice first-use-empty-states-v1).
 *
 * An empty state must offer at most ONE real action — never a dead "#"/empty
 * link, never a disabled control dressed as a button, and never more than one
 * primary CTA. The component is the single chokepoint every first-use surface
 * (journal / inbox / worker evidence) renders through, so pinning it here keeps
 * all of them honest. Pure source assertions; runs in CI via `pnpm -F web test`.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

const CMP = "components/app/empty-state.tsx";

describe("Guard: <EmptyState> offers at most one real, non-fake CTA", () => {
  const src = read(CMP);

  it("never renders a dead '#' or empty href, nor a disabled control", () => {
    expect(src).not.toMatch(/href="#"/);
    expect(src).not.toMatch(/href=""/);
    expect(src).not.toMatch(/\bdisabled\b|aria-disabled/i);
  });

  it("takes a single optional CTA (one primary action, never a list of CTAs)", () => {
    // One cta prop, not an array — structurally impossible to render two.
    expect(src).toMatch(/cta\?:\s*\{\s*label:\s*string;\s*href:\s*string/);
    expect(src).not.toMatch(/cta\s*:\s*\{[^}]*\}\[\]/); // no cta[] array prop
  });

  it("internal routes go through <Link>; only same-page anchors use <a>", () => {
    expect(src).toMatch(/isInternalRoute/);
    expect(src).toMatch(/href\.startsWith\("\/"\)/);
    expect(src).toMatch(/<Link\b/);
  });

  it("carries no fake AI / matching / verification / payment copy in the shell", () => {
    expect(src).not.toMatch(/\bAI[\s-]*(?:match|verif|confirm)/i);
    expect(src).not.toMatch(/stripe|checkout|subscription|\bpayment\b/i);
  });
});

// The first-use empty states the component powers must each pass a SINGLE
// primary CTA at most (the journal one is primary; inbox has none; evidence is
// secondary). This pins the per-surface intent at the call sites.
describe("Guard: first-use surfaces wire EmptyState with a single honest CTA", () => {
  it("journal empty state has exactly one CTA → the on-page composer anchor", () => {
    const src = read("app/[locale]/dashboard/journal/page.tsx");
    // The journal-empty CTA points at the real on-page composer (not a dead #).
    expect(src).toMatch(/href:\s*"#journal-composer"/);
    // The header "+ New entry" gradient is gated to non-empty, so the empty
    // surface shows a single primary (no duplicate primary CTA).
    expect(src).toMatch(/\(entries \?\? \[\]\)\.length > 0 && \(\s*<a/);
  });

  it("inbox empty state shows no CTA (passive queue, no fake action)", () => {
    const src = read("app/[locale]/dashboard/inbox/page.tsx");
    const open = src.indexOf("inbox-empty-state");
    expect(open).toBeGreaterThan(0);
    // The EmptyState mount for the inbox passes no `cta` prop.
    const slice = src.slice(open, open + 240);
    expect(slice).not.toMatch(/cta=/);
  });
});
