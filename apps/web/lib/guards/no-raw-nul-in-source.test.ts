import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * No tracked SOURCE file may contain a raw 0x00 byte — PR #1112's tooling
 * finding, ratcheted.
 *
 * WHY A ONE-TIME CLEANUP IS NOT ENOUGH
 * ------------------------------------
 * A single raw NUL inside a string literal makes ripgrep classify the whole
 * file as BINARY and silently drop it from every code search. That is how a
 * hardcoded `import_session_id: null` in `vacancy-row.ts` escaped review: the
 * file was invisible to the searches that would have caught it. PRs #1112 and
 * #1114 escaped the four affected files to `\u0000` (byte-identical at
 * runtime), but nothing stopped the next raw NUL from arriving. This guard is
 * that ratchet.
 *
 * Keyed on `git ls-files` — what git actually TRACKS — for the same reason as
 * the browser-profile guard: a filesystem walk cannot tell tracked from
 * ignored, and untracked local artefacts are not the hazard here.
 *
 * The exclusion list is by EXTENSION and deliberately narrow: genuinely binary
 * asset formats where NUL bytes are structural. Everything else — including
 * any extensionless file — is read and byte-scanned. Do not add a source
 * extension here to silence a failure; escape the byte as `\u0000` instead.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

/** Binary asset formats where 0x00 is structural, never a defect. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".zip",
  ".pptx", // an Office deck is a ZIP container (docs/presentations)
  ".gz",
]);

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

/** True when the buffer carries a raw NUL byte. Exported shape kept trivial
 * so the negative control below exercises the REAL detector, not a copy. */
function hasRawNul(bytes: Buffer): boolean {
  return bytes.includes(0);
}

describe("no raw NUL bytes in tracked source files (PR #1112 ratchet)", () => {
  const tracked = trackedFiles();
  const scannable = tracked.filter(
    (f) => !BINARY_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  it("reads a real tracked-file list and actually scans source files", () => {
    // Without this, a broken git call would make the scan below pass
    // vacuously — green while checking nothing.
    expect(tracked.length).toBeGreaterThan(500);
    expect(scannable).toContain("apps/web/package.json");
    // The historically affected files must be IN scope, not excluded.
    expect(scannable).toContain("apps/web/lib/vacancy-store/vacancy-row.ts");
    expect(scannable).toContain("apps/web/lib/skills/candidate-skills.ts");
  });

  it("negative control: the detector flags a NUL-carrying buffer", () => {
    expect(hasRawNul(Buffer.from([0x61, 0x00, 0x62]))).toBe(true);
    expect(hasRawNul(Buffer.from("plain text, \\u0000 escaped", "utf8"))).toBe(
      false,
    );
  });

  it("no scannable tracked file contains a raw 0x00 byte", () => {
    const offenders: string[] = [];
    for (const file of scannable) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(REPO_ROOT, file));
      } catch {
        // A tracked-but-locally-absent path (sparse worktree) is not this
        // guard's finding; the index guard above keeps the scan non-vacuous.
        continue;
      }
      if (hasRawNul(bytes)) offenders.push(file);
    }
    expect(
      offenders,
      "raw 0x00 bytes found in tracked source files. ripgrep will treat these " +
        "as binary and silently exclude them from every code search. Replace " +
        `each raw NUL with the explicit \\u0000 escape:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
