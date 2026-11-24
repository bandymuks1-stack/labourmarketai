/**
 * Guard — THE MARKETPLACE WORKS WITH EVERY AI PROVIDER OFF.
 *
 * This is the acceptance the AI work is measured against, and it is the one
 * most easily lost by accident. Wiring a provider chain makes AI reachable;
 * nothing about that should make it REQUIRED. The failure mode is not dramatic
 * — nobody sets out to make booking depend on a model. It happens one import at
 * a time, and it is invisible in a repo where AI is disabled by default,
 * because with the runtime off the new dependency simply returns nothing and
 * the caller quietly returns nothing too.
 *
 * So this guard pins the STRUCTURE rather than the behaviour: the core
 * marketplace domains do not reach the AI runtime at all, and the two surfaces
 * that deliberately do are enhancement surfaces that degrade to an honest
 * "off". A structural pin survives whether AI is on or off, which is exactly
 * what a behavioural assertion in a repo with AI disabled cannot do.
 *
 * WHAT THIS IS NOT: proof that the product works in production with AI off.
 * That needs a browser and a real session, and this file cannot supply either.
 * It is proof that the DEPENDENCY does not exist — which is the part that can
 * regress silently in a pull request.
 *
 * Pure source assertions.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
/** Strip comments so the scans check real CODE, not prose that mentions AI. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.tsx?$/.test(abs)) acc.push(abs);
  }
  return acc;
}
const rel = (abs: string) => abs.slice(APP_ROOT.length + 1).replace(/\\/g, "/");

/**
 * The domains a worker and an employer cannot do without. If any of these
 * needs a model to function, the product is not usable by someone who has not
 * configured one — which today is everyone.
 */
const CORE_MARKETPLACE_DOMAINS = [
  "lib/booking",
  "lib/demand",
  "lib/engagements",
  "lib/journal",
  "lib/leave",
  "lib/feedback",
  "lib/notifications",
  "lib/opportunities",
  "lib/scouting",
  "lib/profile",
] as const;

/** Any import that reaches the AI stack, canonical runtime or legacy island. */
const AI_IMPORT = /from\s+["'](?:@\/lib\/ai(?:\/[^"']*)?|@\/lib\/config\/ai)["']/;

/**
 * The ONLY core-domain files permitted to reach the AI runtime.
 *
 * Both are named for what they are — an ENHANCEMENT bolted onto a domain that
 * already works without them. Neither is on a path a user must traverse: the
 * journal accepts an entry and the profile accepts a bio whether or not these
 * ever return anything. The list may shrink; it must not grow without someone
 * deciding, in review, that a core domain may now require a model.
 */
const AI_ENHANCEMENT_ALLOWLIST = [
  "lib/journal/journal-ai-suggestions-actions.ts",
  "lib/profile/cv-ai-structuring-actions.ts",
] as const;

describe("core marketplace domains do not depend on the AI runtime", () => {
  it("no core domain file imports lib/ai outside the enhancement allowlist", () => {
    const offenders: string[] = [];
    for (const domain of CORE_MARKETPLACE_DOMAINS) {
      const dir = join(APP_ROOT, domain);
      expect(existsSync(dir), `${domain} is missing — update this guard`).toBe(true);
      for (const abs of walk(dir)) {
        const r = rel(abs);
        if (/\.test\.tsx?$/.test(r)) continue;
        if ((AI_ENHANCEMENT_ALLOWLIST as readonly string[]).includes(r)) continue;
        if (AI_IMPORT.test(code(read(abs)))) offenders.push(r);
      }
    }
    expect(
      offenders,
      `a core marketplace domain now reaches the AI runtime:\n${offenders.join("\n")}\n\n` +
        `The marketplace must work with every provider disabled. If this file is\n` +
        `genuinely an optional ENHANCEMENT that degrades to nothing, add it to\n` +
        `AI_ENHANCEMENT_ALLOWLIST deliberately. If it is on a path a user must\n` +
        `traverse, it does not belong there at all.`,
    ).toEqual([]);
  });

  it("every allowlisted enhancement still exists (the list cannot rot)", () => {
    for (const f of AI_ENHANCEMENT_ALLOWLIST) {
      expect(existsSync(join(APP_ROOT, f)), `${f} is gone — shrink the allowlist`).toBe(
        true,
      );
    }
  });
});

describe("the AI enhancements degrade to an honest nothing", () => {
  it.each(AI_ENHANCEMENT_ALLOWLIST)(
    "%s returns an explicit off state rather than a fabricated one",
    (f) => {
      const src = read(join(APP_ROOT, f));
      // An enhancement that cannot run must SAY so. The alternative — returning
      // an empty success — is the shape that lets a disabled runtime look like
      // a model that had no suggestions, and those are different facts.
      expect(/status:\s*["']off["']/.test(src), `${f} has no "off" state`).toBe(true);
      // And it must not treat a non-suggestion outcome as usable output.
      expect(
        /outcome\.status\s*!==\s*["']suggestion["']/.test(code(src)),
        `${f} does not check the outcome status before using the value`,
      ).toBe(true);
    },
  );
});

describe("the AI runtime is still OFF by default", () => {
  it("nothing in the repo enables a provider without the operator", () => {
    // The env example is the operator's contract. Every AI enable flag ships
    // false there; a `true` in this file would mean a fresh deployment starts
    // with a provider live, which is the opposite of the whole design.
    const envExample = read(join(APP_ROOT, "..", "..", ".env.example"));
    const enableFlags = envExample.match(/^AI_[A-Z_]*ENABLED=.*$/gm) ?? [];
    expect(enableFlags.length).toBeGreaterThan(0);
    for (const line of enableFlags) {
      expect(line, `${line} must ship false`).toMatch(/=false\s*$/);
    }
    expect(envExample).toMatch(/^AI_PROVIDER_MODE=disabled\s*$/m);
  });

  it("the local runtime documents that it needs NO key", () => {
    // The placeholder-key habit is what made a keyless provider unrepresentable
    // in the first place. If this instruction disappears it will come back.
    const doc = read(join(APP_ROOT, "..", "..", "docs/ai/local-runtime-setup.md"));
    expect(doc).toMatch(/no API key|needs no key|NO key/i);
  });

  // Detector self-tests — a guard that cannot fail is not a guard.
  it("the AI import detector is real", () => {
    expect(AI_IMPORT.test('import { runAiAgent } from "@/lib/ai/run-agent-server";')).toBe(
      true,
    );
    expect(AI_IMPORT.test('import x from "@/lib/ai/runtime/types";')).toBe(true);
    expect(AI_IMPORT.test('import { AI_ASSIST_ENABLED } from "@/lib/config/ai";')).toBe(
      true,
    );
    // A lookalike path must NOT match.
    expect(AI_IMPORT.test('import x from "@/lib/airports/codes";')).toBe(false);
    expect(AI_IMPORT.test('import x from "@/lib/ai-workspace/ai-context";')).toBe(false);
    // A commented-out import must NOT match.
    expect(AI_IMPORT.test(code('// import x from "@/lib/ai/run-agent-server";'))).toBe(
      false,
    );
  });
});
