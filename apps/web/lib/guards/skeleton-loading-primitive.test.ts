/**
 * Guard — SKELETON LOADING PRIMITIVE is canonical.
 *
 * The production readiness baseline (2026-08-03, STEP 5) recorded "loading
 * inconsistency" as an open systemic defect with no owner: three route
 * loaders, each hand-rolling the same `animate-pulse` + `bg-ink-800/50`
 * markup in a slightly different rhythm, and no primitive.
 *
 * This guard closes it and keeps it closed:
 *   (a) every route-level `loading.tsx` composes the shared primitive rather
 *       than re-declaring the placeholder markup;
 *   (b) `animate-pulse` is declared in exactly one place, so the animation
 *       cannot drift;
 *   (c) a route loader stays a SYNCHRONOUS server component — an async one
 *       suspends and destroys the instant paint the Suspense boundary exists
 *       for, and a `"use client"` one drags a message namespace into the
 *       client bundle the allowlist guard deliberately excludes;
 *   (d) the primitive's accessibility contract holds: it announces only when
 *       it has real text to announce, and never claims a status region with
 *       nothing in it;
 *   (e) a skeleton never renders words — a placeholder that shows copy is
 *       showing content that does not exist yet.
 *
 * Pure source assertions. Runs in CI via `pnpm -F web test`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const APP_DIR = join(APP_ROOT, "app");
const PRIMITIVE = join(APP_ROOT, "components", "app", "skeleton.tsx");

const read = (p: string) => readFileSync(p, "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const rel = (abs: string) => abs.slice(APP_ROOT.length + 1).replace(/\\/g, "/");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

const loadingFiles = () =>
  walk(APP_DIR).filter((f) => /[\\/]loading\.tsx$/.test(f));

describe("(a) every route loader composes the shared primitive", () => {
  it("the primitive exists", () => {
    expect(existsSync(PRIMITIVE)).toBe(true);
  });

  it("there is at least one route loader to check", () => {
    expect(loadingFiles().length).toBeGreaterThan(0);
  });

  it("no loading.tsx re-declares the placeholder markup", () => {
    const offenders: string[] = [];
    for (const file of loadingFiles()) {
      const src = code(read(file));
      // The two fills the primitive owns. Seeing either one spelled out in a
      // route file means the markup was copied instead of composed.
      if (/bg-ink-800\/50/.test(src) || /bg-ink-700\//.test(src)) {
        offenders.push(rel(file));
      }
      if (!/from\s+["']@\/components\/app\/skeleton["']/.test(src)) {
        offenders.push(`${rel(file)} (no primitive import)`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("(b) the pulse animation is declared once", () => {
  it("animate-pulse appears in the primitive and in no route loader", () => {
    expect(read(PRIMITIVE)).toContain("animate-pulse");
    const offenders = loadingFiles()
      .filter((f) => /animate-pulse/.test(code(read(f))))
      .map(rel);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("(c) a route loader stays a synchronous server component", () => {
  it("no loading.tsx is async or a client component", () => {
    const offenders: string[] = [];
    for (const file of loadingFiles()) {
      const src = code(read(file));
      if (/export\s+default\s+async\s+function/.test(src)) {
        offenders.push(`${rel(file)} (async)`);
      }
      if (/^\s*["']use client["']/m.test(read(file))) {
        offenders.push(`${rel(file)} (use client)`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the detectors are real", () => {
    expect(
      /export\s+default\s+async\s+function/.test(
        "export default async function X() {}",
      ),
    ).toBe(true);
    expect(/^\s*["']use client["']/m.test('"use client";\n')).toBe(true);
  });
});

describe("(d) the primitive's accessibility contract", () => {
  const src = read(PRIMITIVE);

  it("announces only when it has real text — no empty status region", () => {
    // The labelled branch must supply BOTH the role and the sr-only text.
    expect(src).toContain('role: "status"');
    expect(src).toContain('className="sr-only"');
    // The unlabelled branch must hide itself rather than claim a status.
    expect(src).toContain('"aria-hidden": true');
    // The two branches are chosen by whether a non-empty label was given.
    expect(src).toMatch(/const labelled =[\s\S]{0,120}trim\(\)\.length > 0/);
  });

  it("individual blocks are hidden from assistive technology", () => {
    // Each block is decorative; only the container may carry the status.
    expect(src).toMatch(/function SkeletonBlock[\s\S]*?aria-hidden/);
  });
});

describe("(e) a skeleton never renders words", () => {
  it("no route loader contains user-visible text", () => {
    const offenders: string[] = [];
    for (const file of loadingFiles()) {
      const src = code(read(file));
      // Any text node between tags that is not whitespace or JSX braces.
      const textNodes = src.match(/>[^<>{}\s][^<>{}]*</g) ?? [];
      if (textNodes.length > 0) {
        offenders.push(`${rel(file)}: ${textNodes.join(" | ").slice(0, 120)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the detector is real", () => {
    const withText = code('<div>Loading your profile</div>');
    expect((withText.match(/>[^<>{}\s][^<>{}]*</g) ?? []).length).toBe(1);
  });
});
