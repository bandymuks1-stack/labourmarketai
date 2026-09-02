import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO CONTROL BYTES IN GUARD, TEST, SCRIPT OR CI-GATE SOURCE.
 *
 * THE DEFECT CLASS. A guard regex written through a non-raw string pipeline
 * (a Python heredoc, a template that "helpfully" unescapes) turns `\b` into
 * U+0008 — a real backspace character inside the pattern. The regex still
 * compiles. It never matches anything. Every assertion built on it that
 * expects `false` / `[]` passes against ANY tree, and the guard reads green
 * while guarding nothing.
 *
 * THE RECORD. 2026-07-30 (21b0b0ce) repaired three such regexes and wrote
 * that "the tree was swept … none remain". It was not swept: on 2026-08-29
 * an independent audit found NINE more in four CI guard files plus ONE in
 * the CI product-gate script — some written AFTER the "fix", through the same
 * pipeline. Two of them were the only assertions that the production-QA
 * provisioning script grants no privilege. This file is the sweep, run on
 * every CI pass, so the class cannot return silently.
 *
 * WHAT IT GUARANTEES. No scanned file contains a byte in U+0000–U+0008,
 * U+000B, U+000C, U+000E–U+001F — except the files in ALLOWED, each of which
 * must still contain one (a stale allowlist entry fails). Tabs, newlines and
 * carriage returns are allowed everywhere.
 *
 * WHAT IT DOES NOT GUARANTEE. That a `\b` is the RIGHT boundary for its
 * pattern — that is each guard's own negative control. Product runtime
 * modules are outside this scan.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");

/**
 * Files that carry a control byte ON PURPOSE. Each entry must still contain
 * one, so an entry cannot outlive its reason.
 */
const ALLOWED: ReadonlyMap<string, string> = new Map([
  [
    "scripts/esco/import-esco.mjs",
    "U+0001 is the composite-key separator inside template strings (not a regex)",
  ],
]);

/** Byte-level predicate: no regex, so the rule cannot itself be miswritten. */
export function firstControlByte(buf: Buffer): { offset: number; byte: number } | null {
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return { offset: i, byte: b };
  }
  return null;
}

const SOURCE_EXT = /\.(ts|tsx|mts|cts|mjs|cjs|js)$/;

function walk(dir: string, keep: (p: string) => boolean, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".git")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, keep, out);
    else if (SOURCE_EXT.test(p) && keep(p)) out.push(p);
  }
}

const toRepoRel = (p: string): string => relative(REPO, p).replaceAll("\\", "/");

/** Every file whose job is to GUARD, PROVE or GATE — the places a dead regex hides. */
export function guardSourceFiles(): string[] {
  const out: string[] = [];
  walk(join(WEB, "lib"), (p) => /\.test\.[cm]?tsx?$/.test(p) || p.includes(join("lib", "guards")), out);
  walk(join(WEB, "tests"), () => true, out);
  walk(join(WEB, "scripts"), () => true, out);
  walk(join(REPO, "scripts"), () => true, out);
  walk(join(REPO, ".github", "scripts"), () => true, out);
  return out;
}

export function scanForControlBytes(files: readonly string[]): string[] {
  const offenders: string[] = [];
  for (const f of files) {
    const hit = firstControlByte(readFileSync(f));
    if (hit) {
      const line = readFileSync(f, "utf8").slice(0, hit.offset).split("\n").length;
      offenders.push(`${toRepoRel(f)}:${line} U+${hit.byte.toString(16).padStart(4, "0")}`);
    }
  }
  return offenders;
}

describe("no control bytes in guard, test, script or CI-gate source", () => {
  const files = guardSourceFiles();
  const rel = files.map(toRepoRel);

  it("the scan is not vacuous — it sees the guards, the e2e tree and the CI scripts", () => {
    // A moved directory must fail loudly, not pass on zero files.
    expect(files.length).toBeGreaterThan(400);
    for (const pinned of [
      "apps/web/lib/guards/prod-qa-identity.test.ts",
      "apps/web/lib/guards/product-gate.test.ts",
      "apps/web/lib/guards/risk-signal-advisory.test.ts",
      "apps/web/lib/guards/ux-2-0-actions.test.ts",
      ".github/scripts/product-gate.mjs",
      ".github/scripts/migration-safety.mjs",
      "apps/web/lib/guards/no-control-bytes-in-guard-source.test.ts",
    ]) {
      expect(rel, `${pinned} must be in the scan`).toContain(pinned);
    }
  });

  it("no scanned file contains a control byte (outside the documented allowlist)", () => {
    const offenders = scanForControlBytes(files).filter(
      (line) => !ALLOWED.has(line.slice(0, line.indexOf(":"))),
    );
    expect(offenders).toEqual([]);
  });

  it("every allowlist entry still earns its place", () => {
    for (const [file, reason] of ALLOWED) {
      expect(rel, `${file} (${reason}) must exist in the scan`).toContain(file);
      const hit = firstControlByte(readFileSync(join(REPO, file)));
      expect(hit, `${file} no longer contains a control byte — drop the allowlist entry`).not.toBeNull();
    }
  });
});

describe("NEGATIVE CONTROL — the sweep really detects the defect", () => {
  it("in memory: a backspace where a boundary was meant is found; tabs and newlines are not", () => {
    expect(firstControlByte(Buffer.from("/\\bagent\\b/", "utf8"))).toBeNull();
    expect(firstControlByte(Buffer.from("line\tone\r\nline two\n", "utf8"))).toBeNull();
    const dead = Buffer.from("/\u0008agent\u0008/", "utf8");
    expect(firstControlByte(dead)).toEqual({ offset: 1, byte: 0x08 });
    expect(firstControlByte(Buffer.from([0x61, 0x00, 0x62]))).toEqual({ offset: 1, byte: 0x00 });
    expect(firstControlByte(Buffer.from([0x61, 0x1f, 0x62]))).toEqual({ offset: 1, byte: 0x1f });
  });

  it("on disk: a planted file with the exact historical defect is reported with its line", () => {
    const dir = mkdtempSync(join(tmpdir(), "control-byte-control-"));
    try {
      const planted = join(dir, "planted.test.ts");
      writeFileSync(
        planted,
        "const ok = 1;\nconst RE = /\u0008grant\\s+select\u0008/i;\n",
        "utf8",
      );
      const report = scanForControlBytes([planted]);
      expect(report).toHaveLength(1);
      expect(report[0]).toMatch(/planted\.test\.ts:2 U\+0008$/);
      // And the same scanner, on a clean sibling, reports nothing.
      const clean = join(dir, "clean.test.ts");
      writeFileSync(clean, "const RE = /\\bgrant\\s+select\\b/i;\n", "utf8");
      expect(scanForControlBytes([clean])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
