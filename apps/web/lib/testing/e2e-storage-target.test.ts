import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  DEFAULT_STORAGE_FILENAME,
  STORAGE_FILENAME_CONVENTION,
  STORAGE_TARGET_REFUSAL_CODE,
  UnsafeStorageTargetError,
  assertBareStorageFilename,
  assertIgnoredStorageTarget,
  gitCheckIgnoreProbe,
  resolveStorageTargetPath,
  type IgnoreProbe,
} from "./e2e-storage-target";

/**
 * The real directory sessions are minted into. These tests run the REAL
 * `git check-ignore` against it: the whole point of the guard is that the
 * decision is DERIVED from `.gitignore`, so a test that re-stated the ignore
 * pattern in test code would prove nothing — it would pass even if the guard
 * and `.gitignore` had drifted apart, which is the exact failure being fixed.
 *
 * Nothing here writes a file. `assertIgnoredStorageTarget` only resolves and
 * asks git; minting happens in the script, after it returns.
 */
const E2E_DIR = join(__dirname, "..", "..", "tests", "e2e");

describe("e2e storage target — the derived git decision", () => {
  /**
   * ANTI-VACUITY CONTROL. Every refusal below would also "pass" if git were
   * missing or the directory wrong, because the guard is fail-closed and
   * refuses when it cannot tell. This case is the one that fails in that
   * situation, so it is what keeps the rest honest.
   */
  it("accepts a conventionally named target that git confirms is ignored", () => {
    const target = assertIgnoredStorageTarget({
      filename: ".storage-state-manager.json",
      e2eDir: E2E_DIR,
    });

    expect(target.path).toBe(resolve(E2E_DIR, ".storage-state-manager.json"));
    // The rule text comes from git, not from this test — it proves a real
    // `.gitignore` line was matched rather than a default-allow.
    expect(target.ignoreRule).toContain(".gitignore:");
  });

  it("accepts the default target used when E2E_STORAGE_FILE is unset", () => {
    const filename = assertBareStorageFilename(undefined);
    expect(filename).toBe(DEFAULT_STORAGE_FILENAME);
    expect(() =>
      assertIgnoredStorageTarget({ filename, e2eDir: E2E_DIR }),
    ).not.toThrow();
  });

  /**
   * The three spellings that actually leaked, plus one that has not been
   * invented yet. `.storage-onboarded.json` and `.storage-newcomer.json` are
   * the 2026-09-23 incident: real local sessions, untracked in the working
   * tree, matched by no ignore rule because neither name contains "state".
   */
  const REFUSED = [
    ".storage-onboarded.json",
    ".storage-newcomer.json",
    ".company-state.json.bak",
    "session.json",
    ".storage-fresh.json",
  ];

  for (const filename of REFUSED) {
    it(`refuses "${filename}" — git says it is not ignored`, () => {
      // Guard the guard: confirm git itself agrees, so the refusal is the
      // derived decision and not an incidental string check.
      expect(gitCheckIgnoreProbe(resolve(E2E_DIR), filename).status).toBe(
        "not-ignored",
      );

      expect(() =>
        assertIgnoredStorageTarget({ filename, e2eDir: E2E_DIR }),
      ).toThrow(UnsafeStorageTargetError);
    });
  }

  it("names the safe convention and the refusal code when it refuses", () => {
    let message = "";
    try {
      assertIgnoredStorageTarget({
        filename: ".storage-onboarded.json",
        e2eDir: E2E_DIR,
      });
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain(STORAGE_TARGET_REFUSAL_CODE);
    expect(message).toContain(STORAGE_FILENAME_CONVENTION);
    expect(message).toContain(".storage-state-manager.json");
  });

  it("refuses a target that is already tracked", () => {
    // `git check-ignore` consults the index, so a committed path reports as
    // not-ignored. That is the right answer for a file about to be handed a
    // session token, and this pins the behaviour we rely on.
    expect(() =>
      assertIgnoredStorageTarget({ filename: "auth.spec.ts", e2eDir: E2E_DIR }),
    ).toThrow(UnsafeStorageTargetError);
  });
});

describe("e2e storage target — the name may not escape tests/e2e/", () => {
  const ESCAPES = [
    "../.storage-state-escape.json",
    "../../../.storage-state-escape.json",
    "sub/.storage-state-escape.json",
    "..\\.storage-state-escape.json",
    "/etc/.storage-state-escape.json",
    "C:\\Windows\\.storage-state-escape.json",
    "..",
    ".",
    "   ",
  ];

  for (const raw of ESCAPES) {
    it(`refuses "${raw}"`, () => {
      expect(() => assertBareStorageFilename(raw)).toThrow(
        UnsafeStorageTargetError,
      );
    });
  }

  it("asserts containment on the RESOLVED path, not just the string", () => {
    // Defence in depth: even if a name reached this step, the resolved target
    // must still sit inside the intended directory.
    expect(() =>
      resolveStorageTargetPath(E2E_DIR, `..${sep}outside.json`),
    ).toThrow(UnsafeStorageTargetError);

    expect(resolveStorageTargetPath(E2E_DIR, ".storage-state.json")).toBe(
      resolve(E2E_DIR, ".storage-state.json"),
    );
  });
});

describe("e2e storage target — fail-closed when git cannot answer", () => {
  it("refuses rather than assuming when the probe is unavailable", () => {
    const broken: IgnoreProbe = () => ({
      status: "unavailable",
      detail: "could not run git: ENOENT",
    });

    expect(() =>
      assertIgnoredStorageTarget({
        filename: ".storage-state-manager.json",
        e2eDir: E2E_DIR,
        probe: broken,
      }),
    ).toThrow(/could not verify/);
  });

  it("accepts only an explicit ignored verdict", () => {
    const ignored: IgnoreProbe = () => ({
      status: "ignored",
      rule: ".gitignore:1:/stub",
    });

    expect(
      assertIgnoredStorageTarget({
        filename: ".storage-state-stub.json",
        e2eDir: E2E_DIR,
        probe: ignored,
      }).ignoreRule,
    ).toBe(".gitignore:1:/stub");
  });
});

/**
 * The ORDER is the security property, not just the presence of the checks.
 *
 * Both guards must complete before any session material exists: once
 * `generateLink`/`verifyOtp` have run, a refusal is a refusal with a live
 * token already minted. This pins the order in source so a later refactor
 * cannot quietly move the output-path check back below the mint, which is
 * where it used to sit.
 */
describe("e2e-mint-session.ts runs both guards before it mints", () => {
  const SOURCE = readFileSync(
    join(__dirname, "..", "..", "scripts", "e2e-mint-session.ts"),
    "utf8",
  );

  const at = (needle: string): number => {
    const i = SOURCE.indexOf(needle);
    expect(i, `expected to find "${needle}" in e2e-mint-session.ts`).toBeGreaterThan(-1);
    return i;
  };

  it("resolves the name, asserts the local stack, then asserts the target — all before minting", () => {
    const name = at("assertBareStorageFilename(process.env.E2E_STORAGE_FILE)");
    const localStack = at("resolveLocalSupabaseEnv(REPO_ROOT)");
    const ignored = at("assertIgnoredStorageTarget({");
    const mint = at("admin.auth.admin.generateLink");
    const write = at("writeFileSync(out,");

    expect(name).toBeLessThan(localStack);
    expect(localStack).toBeLessThan(ignored);
    expect(ignored).toBeLessThan(mint);
    expect(mint).toBeLessThan(write);
  });

  it("still refuses a non-local target with the untouched refusal code", () => {
    // The output-path guard is additive. The local-stack guard keeps its own
    // code and its own refusal path — see local-supabase-guard.test.ts for its
    // behaviour; this only proves it was not replaced or bypassed here.
    expect(SOURCE).toContain("REFUSED_NON_LOCAL_E2E_SESSION_MINT");
    expect(SOURCE).toContain("NonLocalTargetError");
  });
});
