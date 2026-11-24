/**
 * Guard — ONE CONFIRMATION ARCHITECTURE (W2).
 *
 * Spec: `docs/product/SINGLE_WORKSPACE_SPECIFICATION_V1.md` §6.2.
 *
 * The UX audit found FOUR confirmation mechanisms competing for one job:
 * native `window.confirm`, custom modals, hand-rolled two-step widgets, and
 * the conversation registry's `ConfirmationTier`. W2 collapses them to one:
 *
 *   - the RENDERING is always inline and two-step (`components/ui/InlineConfirm`);
 *   - the POLICY is the registry's tier.
 *
 * This guard is the reason it cannot quietly come back. It is STRENGTHENED,
 * never disabled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const PRODUCT_FILES = [
  ...walk(join(webRoot, "components")),
  ...walk(join(webRoot, "app")),
  ...walk(join(webRoot, "lib")),
].filter((f) => !f.includes(join("lib", "guards")));

describe("one confirmation architecture", () => {
  it("no product code calls window.confirm / alert / prompt", () => {
    const offenders: string[] = [];
    for (const f of PRODUCT_FILES) {
      const src = readFileSync(f, "utf8");
      if (/\bwindow\.(confirm|alert|prompt)\s*\(/.test(src)) {
        offenders.push(f.replace(webRoot, "").replace(/\\/g, "/"));
      }
    }
    expect(
      offenders,
      `blocking browser dialogs are banned — use components/ui/InlineConfirm:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the single confirmation component exists and is inline, not modal", () => {
    const p = join(webRoot, "components", "ui", "InlineConfirm.tsx");
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, "utf8");
    // Both entry points of the ONE mechanism.
    expect(src).toContain("export function InlineConfirm");
    expect(src).toContain("export function InlineConfirmBar");
    // It must never become a dialog.
    expect(src).not.toMatch(/role=["']dialog["']/);
    expect(src).not.toMatch(/<Dialog\b|<Modal\b|showModal\(/);
    // The tiers must mirror the conversation registry's policy.
    for (const tier of ["reversible_write", "important_write", "strong_irreversible"]) {
      expect(src, `tier ${tier} missing`).toContain(tier);
    }
  });

  it("the tiers stay in sync with the conversation action registry", () => {
    const registry = readFileSync(
      join(webRoot, "lib", "conversation", "action-registry.ts"),
      "utf8",
    );
    const confirm = readFileSync(
      join(webRoot, "components", "ui", "InlineConfirm.tsx"),
      "utf8",
    );
    // Every writing tier the registry can propose must be renderable.
    for (const tier of ["reversible_write", "important_write", "strong_irreversible"]) {
      expect(registry, `registry lost tier ${tier}`).toContain(tier);
      expect(confirm, `InlineConfirm cannot render tier ${tier}`).toContain(tier);
    }
  });

  it("the converted call sites really use the shared component", () => {
    for (const rel of [
      ["components", "app", "journal-entry-row.tsx"],
      ["components", "app", "worker-trade-profile.tsx"],
      ["components", "app", "journal-entry-edit-launcher.tsx"],
    ]) {
      const src = readFileSync(join(webRoot, ...rel), "utf8");
      expect(src, `${rel.join("/")} does not use the shared confirmation`).toMatch(
        /InlineConfirm(Bar)?/,
      );
      expect(src, `${rel.join("/")} still calls a blocking dialog`).not.toMatch(
        /window\.(confirm|alert|prompt)\s*\(/,
      );
    }
  });
});
