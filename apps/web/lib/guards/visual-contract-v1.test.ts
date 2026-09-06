import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { zIndex, Z_INDEX_LADDER } from "../../tokens/zindex";

/**
 * Visual contract v1 guard (docs/design/visual-contract-v1.md).
 *
 * S1 established the canonical primitives — Card, Button (pill), Badge,
 * ResultShell — plus the z-index token scale. Migration of the ~170 files that
 * hand-roll `card-border` is deliberately gradual; what this guard freezes is
 * the DIRECTION: raw styling can only shrink, second primitives cannot appear,
 * and the primitives stay free of product-domain semantics.
 *
 * Ratchet policy: when a slice migrates call sites, lower the baseline to the
 * new count in the same PR. Raising a baseline is a contract violation, not a
 * fix.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

// Comments legitimately NAME banned anti-patterns; strip them before negative
// scans so documentation inside a primitive never trips its own guard.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const SCAN_EXT = /\.(ts|tsx)$/;
const walk = (rel: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(join(APP, rel), { withFileTypes: true })) {
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(childRel, out);
    else if (SCAN_EXT.test(entry.name)) out.push(childRel);
  }
  return out;
};
const uiFiles = (): string[] => walk("components").filter((f) => f.startsWith("components/ui/"));
const surfaceFiles = (): string[] => [...walk("app"), ...walk("components")];

const countMatches = (src: string, needle: string): number =>
  src.split(needle).length - 1;

describe("Ratchet: raw card styling only shrinks", () => {
  // Baseline captured at S1 (2026-08-03): 327 raw usages across app/ +
  // components/ outside the canonical Card primitive. S3 removed one with the
  // FUT concept card; S2 migrated ProfileStateStrip onto <Card>. MEASURED 325
  // — the ratchet is tightened to the real count so it can only shrink again.
  // 2026-09-06: the demand read-back's two direction sections migrated onto
  // <Card compact>, removing the file's last raw usage. 325 -> 324.
  const CARD_BORDER_BASELINE = 324;

  it(`raw card-border usage stays ≤ ${CARD_BORDER_BASELINE}`, () => {
    const total = surfaceFiles()
      .filter((f) => f !== "components/ui/Card.tsx")
      .reduce((n, f) => n + countMatches(read(f), "card-border"), 0);
    expect(
      total,
      `raw card-border count grew past the baseline — new surfaces must use components/ui/Card.tsx; if you migrated call sites, LOWER the baseline`,
    ).toBeLessThanOrEqual(CARD_BORDER_BASELINE);
  });

  // Baseline at S1: 10 hand-typed pill CTA strings (result components). The
  // canonical home is Button variant="pill" / pillLinkClassName.
  const PILL_STRING = "rounded-full border border-ink-500 px-3.5 text-support";
  const PILL_BASELINE = 10;

  it(`raw pill CTA class strings stay ≤ ${PILL_BASELINE}`, () => {
    const total = surfaceFiles()
      .filter((f) => f !== "components/ui/Button.tsx")
      .reduce((n, f) => n + countMatches(read(f), PILL_STRING), 0);
    expect(
      total,
      `raw pill class strings grew — use <Button variant="pill"> or pillLinkClassName`,
    ).toBeLessThanOrEqual(PILL_BASELINE);
  });

  // Baseline at S1: 4 arbitrary z-[n] values. New stacking uses the named
  // scale (z-sticky, z-modal, …) from tokens/zindex.ts.
  const Z_ARBITRARY_BASELINE = 4;

  it(`arbitrary z-[n] usage stays ≤ ${Z_ARBITRARY_BASELINE}`, () => {
    const total = surfaceFiles().reduce(
      (n, f) => n + (read(f).match(/z-\[\d+\]/g)?.length ?? 0),
      0,
    );
    expect(
      total,
      "arbitrary z-[n] grew — use the named z-index tokens (tokens/zindex.ts)",
    ).toBeLessThanOrEqual(Z_ARBITRARY_BASELINE);
  });
});

describe("Single primitives — no parallel systems", () => {
  it("exactly one Card primitive exists (components/ui/Card.tsx)", () => {
    const definers = surfaceFiles().filter((f) =>
      /export function Card\(/.test(read(f)),
    );
    expect(definers).toEqual(["components/ui/Card.tsx"]);
  });

  it("exactly one ResultShell-style primitive exists", () => {
    const definers = surfaceFiles().filter((f) =>
      /export (function|const) \w*ResultShell/.test(read(f)),
    );
    expect(definers).toEqual(["components/ui/ResultShell.tsx"]);
  });

  it("no new score/meter/gauge component files appear", () => {
    // Numeric-score visuals invite fake precision (doctrine §7). The one
    // pre-existing file is grandfathered; anything new needs an owner gate.
    const ALLOWED = new Set(["components/app/company-score-ring.tsx"]);
    const offenders = surfaceFiles().filter(
      (f) => /(score|rating|gauge|meter)[^/]*\.tsx$/i.test(f) && !ALLOWED.has(f),
    );
    expect(offenders).toEqual([]);
  });
});

describe("Primitives stay domain-free and honest", () => {
  const DOMAIN_IMPORTS =
    /@\/lib\/(conversation|supabase|market-map|matching|booking)|result-registry/;
  const FAKE_SEMANTICS =
    /trust[- ]?score|AI[- ]?verified|reputation|rating/i;

  it("components/ui/* import no product-domain modules", () => {
    // Comments may NAME domain modules (e.g. to say the state machine stays
    // with the caller); real imports never live in comments.
    const offenders = uiFiles().filter((f) =>
      DOMAIN_IMPORTS.test(stripComments(read(f))),
    );
    expect(offenders).toEqual([]);
  });

  it("components/ui/* carry no fake rating/trust/AI-verified semantics", () => {
    const offenders = uiFiles().filter((f) =>
      FAKE_SEMANTICS.test(stripComments(read(f))),
    );
    expect(offenders).toEqual([]);
  });

  it("ResultShell never promotes a status by default", () => {
    const src = read("components/ui/ResultShell.tsx");
    // No default status — the caller must state one — and only ready/partial
    // may render content.
    expect(src).not.toMatch(/status\s*=\s*"/);
    const contentSet = src.match(/CONTENT_STATUSES[\s\S]*?\]\)/)?.[0] ?? "";
    expect(contentSet).toContain('"ready"');
    expect(contentSet).toContain('"partial"');
    expect(contentSet).not.toMatch(/"(idle|loading|error|blocked|unavailable|empty)"/);
  });
});

describe("Contract primitives keep accessible focus + touch behavior", () => {
  it("Button (incl. pill) keeps focus-visible ring, disabled semantics, 44px pill target", () => {
    const src = read("components/ui/Button.tsx");
    expect(src).toMatch(/focus-visible:ring-2/);
    expect(src).toMatch(/disabled:opacity-50/);
    expect(src).toMatch(/aria-busy/);
    const pill = src.match(/pill: "([^"]+)"/)?.[1] ?? "";
    expect(pill).toContain("min-h-11");
    expect(pill).toContain("rounded-full");
    expect(src).toMatch(/export const pillLinkClassName/);
  });

  it("interactive Card variant lights a ring when its control has focus", () => {
    const src = read("components/ui/Card.tsx");
    expect(src).toMatch(/interactive:[\s\S]*?focus-within:ring-2/);
    expect(src).toMatch(/disabled:[\s\S]*?pointer-events-none/);
  });

  it("ResultShell loading is announced and reduced-motion safe", () => {
    const src = read("components/ui/ResultShell.tsx");
    expect(src).toMatch(/aria-busy/);
    expect(src).toMatch(/motion-reduce:animate-none/);
  });
});

describe("Z-index token scale", () => {
  it("the ladder is strictly increasing", () => {
    const values = Z_INDEX_LADDER.map((k) => Number(zIndex[k]));
    for (let i = 1; i < values.length; i++) {
      expect(values[i], `${Z_INDEX_LADDER[i]} must stack above ${Z_INDEX_LADDER[i - 1]}`).toBeGreaterThan(
        values[i - 1],
      );
    }
  });

  it("the preset wires the named scale into Tailwind", () => {
    expect(read("tailwind-preset.ts")).toMatch(/zIndex:\s*\{\s*\.\.\.zIndex\s*\}/);
  });
});
