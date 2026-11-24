import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * No hardcoded fallback for cryptographic key material — audit finding L-02.
 *
 * `lib/conversation/dispatch.ts` used to sign confirmation tokens with
 * `|| "dev-fallback-conversation-token-secret"` when no secret was configured.
 * On a PUBLIC repository that constant is known to everyone, so the consent gate
 * for `important_write` / `strong_irreversible` actions was signed with a
 * published key in any environment that had not set a secret.
 *
 * The fix is to THROW instead. This guard is the control that keeps the pattern
 * from coming back — reintroducing a fallback literal is a one-token edit that
 * reads as harmless ("so local dev works") and produces no other test failure.
 *
 * WHAT IT LOOKS FOR: an `||`/`??` fallback to a string literal on a line that is
 * about secret material. It deliberately does NOT try to detect every possible
 * shape — a determined rewrite can evade any source scan. It catches the exact
 * regression that already happened once, which is what a recurrence guard is for.
 *
 * Deterministic and offline: reads source files, no network, no clock.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["lib", "app", "components"] as const;

/** Identifiers that mean "this value is key material". */
const SECRET_TOKENS =
  /(SECRET|_KEY\b|PASSWORD|TOKEN|CREDENTIAL|PRIVATE_KEY|WEBHOOK_SECRET|tokenSecret|signingKey|hmacKey)/i;

/**
 * `... || "literal"` or `... ?? "literal"`.
 * Requires 8+ chars so short sentinels like `?? ""`, `?? "none"`, `?? "lt"`
 * (locale defaults) and `?? "n/a"` do not trip it.
 */
const LITERAL_FALLBACK = /(\|\||\?\?)\s*["'`][^"'`\n]{8,}["'`]/;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mts)$/.test(name)) continue;
      // A test may legitimately contain a fake secret to assert it is REJECTED.
      if (/\.test\.(ts|tsx)$/.test(name)) continue;
      out.push(full);
    }
  };
  for (const d of SCAN_DIRS) walk(join(WEB_ROOT, d));
  return out;
}

const FILES = sourceFiles();

describe("no hardcoded cryptographic fallback (audit L-02)", () => {
  it("scans a non-trivial number of source files", () => {
    // Without this, a broken walker would make every assertion below pass
    // vacuously — a guard that checked nothing while reporting green.
    expect(FILES.length).toBeGreaterThan(200);
  });

  it("never falls back to a string literal for secret material", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
        if (!SECRET_TOKENS.test(line)) return;
        if (!LITERAL_FALLBACK.test(line)) return;
        offenders.push(`${relative(WEB_ROOT, file).replace(/\\/g, "/")}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      "secret material must never fall back to a hardcoded literal — this repo is " +
        "PUBLIC, so such a literal is a published key. Throw instead (fail closed).\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("keeps the specific dev-fallback literal from audit L-02 out of the tree", () => {
    const offenders = FILES.filter((f) =>
      readFileSync(f, "utf8").includes("dev-fallback-conversation-token-secret"),
    ).map((f) => relative(WEB_ROOT, f).replace(/\\/g, "/"));
    expect(offenders, `the L-02 fallback literal is back in: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("makes the conversation token signer fail closed", () => {
    const src = readFileSync(join(WEB_ROOT, "lib/conversation/dispatch.ts"), "utf8");
    const fn = /function tokenSecret\(\)[\s\S]*?\n}/.exec(src)?.[0] ?? "";
    expect(fn, "tokenSecret() not found in lib/conversation/dispatch.ts").not.toBe("");
    expect(
      /throw new Error/.test(fn),
      "tokenSecret() must THROW when no key material is configured rather than " +
        "signing with a default. Refusing to mint a token is the safe direction.",
    ).toBe(true);
  });
});
