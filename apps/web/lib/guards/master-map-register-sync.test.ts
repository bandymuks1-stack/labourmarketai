import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CAPABILITY_REGISTER } from "../product-gate/capability-register";

/**
 * THE MASTER DOCUMENTS STAY TRUE (owner command 2026-10-18: "all four documents must be continuously
 * updated by the actual changes so they never become a stale one-off report").
 *
 * docs/master/ holds four connected documents. This guard ties the MASTER-MAP to the capability
 * register: when a capability changes state, the register snapshot line must change in the same PR,
 * or CI fails here. The four documents must exist and link each other.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const DOCS = join(ROOT, "docs", "master");
const NAMES = [
  "LABOURMARKET-MASTER-MAP",
  "LABOURMARKET-FUNCTIONAL-AUDIT",
  "LABOURMARKET-IMPROVEMENT-OPPORTUNITIES",
  "LABOURMARKET-EXECUTION-ROADMAP",
] as const;
const ORDER = [
  "BUILT_AND_USABLE",
  "PARTIAL",
  "BUILT_NOT_CONNECTED",
  "BLOCKED",
  "ARCHITECTURE_ONLY",
  "MISSING",
  "RETIRED",
] as const;

describe("docs/master — the four living documents", () => {
  it("all four exist and link the other three", () => {
    for (const name of NAMES) {
      const path = join(DOCS, `${name}.md`);
      expect(existsSync(path), name).toBe(true);
      const text = readFileSync(path, "utf8");
      for (const other of NAMES) {
        if (other === name) continue;
        expect(text, `${name} links ${other}`).toContain(`${other}.md`);
      }
    }
  });

  it("the MASTER-MAP register snapshot matches the capability register", () => {
    const counts = new Map<string, number>();
    for (const row of CAPABILITY_REGISTER) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    // every status in the register is one the snapshot names
    for (const status of counts.keys()) expect(ORDER as readonly string[]).toContain(status);
    const line =
      `> Register snapshot: ${CAPABILITY_REGISTER.length} capabilities — ` +
      ORDER.map((s) => `${s} ${counts.get(s) ?? 0}`).join(" · ");
    const map = readFileSync(join(DOCS, "LABOURMARKET-MASTER-MAP.md"), "utf8");
    expect(
      map,
      `docs/master/LABOURMARKET-MASTER-MAP.md must carry the current register snapshot:\n${line}`,
    ).toContain(line);
  });

  it("the public documents carry no production host address", () => {
    for (const name of NAMES) {
      const text = readFileSync(join(DOCS, `${name}.md`), "utf8");
      expect(text, name).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    }
  });
});
