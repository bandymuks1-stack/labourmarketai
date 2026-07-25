import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards against a command's exit code being swallowed by a pipe.
 *
 * THE FAILURE MODE. `npx supabase db reset | tail -60` exits with TAIL's status,
 * not the reset's. On 2026-07-25 that made a migration chain that ABORTED look
 * like a clean pass — the error text scrolled by inside the piped output while
 * the shell reported success. A whole review round was run against a database
 * that had rolled back.
 *
 * The rule: if a build / test / database command is piped into a pager or
 * filter, the surrounding shell must set `pipefail`, otherwise only the last
 * stage's status survives. This test enforces that for the files CI actually
 * executes.
 *
 * The repo is currently clean — this is a regression pin, not a fix.
 */
const REPO = join(__dirname, "..", "..", "..", "..");

/** Commands whose failure must never be hidden. */
const RISKY_COMMAND =
  /\b(pnpm|npm|npx|node|tsx|psql|supabase|playwright|vitest|tsc)\b/;
/** Pipe targets that replace the pipeline's exit status. */
const SWALLOWING_TARGET = /\|\s*(tail|head|grep|tee|sed|awk|cat)\b/;

const hasPipefail = (text: string) =>
  /set\s+-[a-z]*o?\s*pipefail|set\s+-o\s+pipefail|set\s+-euo\s+pipefail/.test(
    text,
  );

function collect(dir: string, exts: string[], acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist")
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, exts, acc);
    else if (exts.some((e) => entry.endsWith(e))) acc.push(full);
  }
  return acc;
}

/** A single offending line, with enough context to fix it. */
type Offence = { file: string; line: number; text: string };

function scanShellLike(files: string[]): Offence[] {
  const out: Offence[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8").replace(/\r/g, "");
    if (hasPipefail(src)) continue;
    src.split("\n").forEach((line, i) => {
      const text = line.trim();
      if (text.startsWith("#")) return;
      if (RISKY_COMMAND.test(text) && SWALLOWING_TARGET.test(text)) {
        out.push({ file, line: i + 1, text });
      }
    });
  }
  return out;
}

describe("CI / test commands never hide an exit code behind a pipe", () => {
  it("no shell script pipes a risky command without pipefail", () => {
    const files = [
      ...collect(join(REPO, "scripts"), [".sh"]),
      ...collect(join(REPO, ".github"), [".sh"]),
      ...collect(join(REPO, "apps", "web", "scripts"), [".sh"]),
    ];
    const offences = scanShellLike(files);
    expect(
      offences,
      offences.map((o) => `${o.file}:${o.line}  ${o.text}`).join("\n"),
    ).toEqual([]);
  });

  it("no workflow step pipes a risky command without pipefail", () => {
    const files = collect(join(REPO, ".github", "workflows"), [
      ".yml",
      ".yaml",
    ]);
    expect(files.length).toBeGreaterThan(0);
    const offences = scanShellLike(files);
    expect(
      offences,
      offences.map((o) => `${o.file}:${o.line}  ${o.text}`).join("\n"),
    ).toEqual([]);
  });

  it("no package.json script pipes a risky command into a filter", () => {
    const offences: string[] = [];
    for (const rel of ["package.json", join("apps", "web", "package.json")]) {
      const file = join(REPO, rel);
      if (!existsSync(file)) continue;
      const scripts: Record<string, string> =
        JSON.parse(readFileSync(file, "utf8")).scripts ?? {};
      for (const [name, cmd] of Object.entries(scripts)) {
        if (RISKY_COMMAND.test(cmd) && SWALLOWING_TARGET.test(cmd)) {
          offences.push(`${rel} :: ${name} = ${cmd}`);
        }
      }
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("the detector actually fires on the pattern that caused the incident", () => {
    // Without this, the three tests above could pass by matching nothing.
    const sample = [
      "npx supabase db reset | tail -60",
      "pnpm test | grep -E 'passed'",
      "node build.js | tee out.log",
    ];
    for (const line of sample) {
      expect(RISKY_COMMAND.test(line) && SWALLOWING_TARGET.test(line)).toBe(
        true,
      );
    }
    // …and does not fire on safe shapes.
    expect(SWALLOWING_TARGET.test("pnpm test")).toBe(false);
    expect(hasPipefail("set -euo pipefail\nnpx supabase db reset | tail")).toBe(
      true,
    );
  });
});
