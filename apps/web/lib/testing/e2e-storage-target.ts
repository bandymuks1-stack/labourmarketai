/**
 * THE SESSION-ARTEFACT TARGET GUARD — the third guard on the mint path.
 *
 * `scripts/e2e-mint-session.ts` writes a REAL Supabase session to a file whose
 * name comes from `E2E_STORAGE_FILE`. That file is a live credential: it holds
 * an `sb-<ref>-auth-token` cookie. It must land on a path the repository's
 * ignore rules ALREADY cover, or the next `git add -A` publishes a working
 * session to a PUBLIC repository — and a leaked token cannot be un-leaked by
 * deleting the file afterwards.
 *
 * WHY THIS EXISTS. `.gitignore` carried the whole burden and lost three times,
 * each time to a spelling the previous fix had not thought of:
 *
 *   2026-08-09  `.storage-state-worker.json`  dash spelling vs dot-spelled rules
 *   2026-08-09  `.company-state.json`         the rule pinned the `.storage-state` prefix
 *   2026-09-23  `.storage-onboarded.json`     no `state` substring at all
 *
 * Three times the fix was "add the spelling we just met", and three times the
 * next spelling walked straight past it. A fourth pattern is that same move a
 * fourth time. `.gitignore`'s own comment already argues against another
 * enumeration.
 *
 * So the rule is inverted, exactly as `local-supabase-guard.ts` inverted the
 * target rule: the mint script must PROVE its output path is ignored BEFORE it
 * obtains any session material, and refuses otherwise.
 *
 * THE PROOF IS ASKED OF GIT. `git check-ignore` is run against the actual
 * resolved target, so `.gitignore` remains the single source of truth and this
 * file cannot drift from it. There is deliberately NO copy of the ignore
 * pattern here — a regex in this file would be a fourth enumeration wearing a
 * different hat, and would go stale the moment `.gitignore` changed.
 *
 * Two useful properties of `git check-ignore` we rely on:
 *  - it reports a TRACKED path as not-ignored (it consults the index unless
 *    `--no-index`), so a target that is already committed also refuses — which
 *    is the right answer for a file about to receive a session token;
 *  - it needs no network, no stack and no credentials.
 *
 * This guard is about WHERE the session lands. It does not replace and never
 * relaxes `local-supabase-guard.ts`, which decides WHICH STACK may be touched
 * at all; both stay fail-closed and both run on every mint.
 *
 * Everything here is injectable so the unit test can exercise the real git
 * decision and the degraded branches without a running stack.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

/** Refusal code — grep-able, and printed on every refusal from this guard. */
export const STORAGE_TARGET_REFUSAL_CODE = "REFUSED_UNSAFE_E2E_STORAGE_TARGET";

/**
 * The documented safe convention. Named in every refusal so the reader is told
 * what to do instead of being told only that they may not do this.
 */
export const STORAGE_FILENAME_CONVENTION = ".storage-state-*.json";

/** The target when `E2E_STORAGE_FILE` is unset. Ignored by the same rules. */
export const DEFAULT_STORAGE_FILENAME = ".storage-state.json";

export class UnsafeStorageTargetError extends Error {
  constructor(reason: string) {
    super(`${STORAGE_TARGET_REFUSAL_CODE}: ${reason}`);
    this.name = "UnsafeStorageTargetError";
  }
}

/**
 * What git said about one candidate target. `unavailable` is deliberately NOT
 * merged into `not-ignored`: they refuse alike, but the operator needs to know
 * whether their filename is wrong or their git is missing.
 */
export type IgnoreVerdict =
  | { status: "ignored"; rule: string }
  | { status: "not-ignored" }
  | { status: "unavailable"; detail: string };

/** `(directory, bare filename) -> verdict`. Injected only by the unit test. */
export type IgnoreProbe = (dir: string, filename: string) => IgnoreVerdict;

/**
 * Step 1 — resolve the requested output name.
 *
 * `E2E_STORAGE_FILE` is a BARE FILENAME, never a path: it is resolved inside
 * `tests/e2e/`. A mint script that will happily write an attacker-chosen path
 * is not a thing to leave lying around in a repo, and the callers only ever
 * need a name. Traversal is refused here, before anything else looks at it.
 */
export function assertBareStorageFilename(raw: string | undefined): string {
  const requested = raw ?? DEFAULT_STORAGE_FILENAME;

  if (requested.trim() === "") {
    throw new UnsafeStorageTargetError(
      "E2E_STORAGE_FILE is empty. Leave it unset for " +
        `"${DEFAULT_STORAGE_FILENAME}", or name a file matching ` +
        `"${STORAGE_FILENAME_CONVENTION}".`,
    );
  }

  const escapes =
    isAbsolute(requested) ||
    /[\\/]/.test(requested) ||
    // A Windows drive-relative name ("C:x") is not absolute but is not local.
    /^[A-Za-z]:/.test(requested) ||
    requested === "." ||
    requested === ".." ||
    requested.split(/[\\/]/).includes("..");

  if (escapes) {
    throw new UnsafeStorageTargetError(
      `E2E_STORAGE_FILE must be a bare filename, got "${requested}". It is ` +
        "resolved inside tests/e2e/ and may not contain a path separator, a " +
        `drive letter or "..". Name it "${STORAGE_FILENAME_CONVENTION}" — ` +
        "e.g. .storage-state-manager.json.",
    );
  }

  return requested;
}

/**
 * Step 2 — resolve the target and prove it is inside the intended E2E storage
 * area. Defence in depth behind step 1: containment is asserted on the
 * RESOLVED path, so it holds whatever the name turned out to mean on this
 * platform rather than relying on the string check alone.
 */
export function resolveStorageTargetPath(
  e2eDir: string,
  filename: string,
): string {
  const dir = resolve(e2eDir);
  const out = resolve(dir, filename);
  const prefix = dir.endsWith(sep) ? dir : `${dir}${sep}`;

  if (out === dir || !out.startsWith(prefix)) {
    throw new UnsafeStorageTargetError(
      `"${filename}" resolves to "${out}", which is outside the intended ` +
        `E2E storage area "${dir}". A minted session is a live credential and ` +
        "is written to that directory only.",
    );
  }

  return out;
}

/**
 * Ask git whether this exact target is covered by the repository's ignore
 * rules. `cwd` is the target's own directory and the argument is the bare
 * filename, so nothing has to guess a repo root or quote a path — the repo
 * path on this machine contains spaces, which is also why no shell is used.
 */
export function gitCheckIgnoreProbe(
  dir: string,
  filename: string,
): IgnoreVerdict {
  const res = spawnSync("git", ["check-ignore", "-v", "--", filename], {
    cwd: dir,
    encoding: "utf8",
  });

  if (res.error) {
    return {
      status: "unavailable",
      detail: `could not run git: ${res.error.message}`,
    };
  }

  // 0 = ignored, 1 = not ignored, anything else = git itself failed.
  if (res.status === 0) {
    const rule = (res.stdout ?? "").split(/\r?\n/)[0]?.trim() ?? "";
    return { status: "ignored", rule: rule || "(matched, rule not reported)" };
  }
  if (res.status === 1) {
    return { status: "not-ignored" };
  }

  return {
    status: "unavailable",
    detail:
      `git check-ignore exited ${res.status}` +
      `${res.stderr ? `: ${res.stderr.trim()}` : ""}`,
  };
}

export type StorageTarget = {
  /** The bare filename, as accepted. */
  filename: string;
  /** The absolute path the session will be written to. */
  path: string;
  /** The `.gitignore` rule git matched — printed as the receipt line. */
  ignoreRule: string;
};

/**
 * Steps 2 + 3 — containment, then the derived ignore decision. Throws
 * `UnsafeStorageTargetError` unless git confirms THIS target is ignored.
 *
 * Call this BEFORE minting. Nothing is written and no session material is
 * obtained when it throws.
 */
export function assertIgnoredStorageTarget(input: {
  filename: string;
  e2eDir: string;
  probe?: IgnoreProbe;
}): StorageTarget {
  const { filename, e2eDir } = input;
  const probe = input.probe ?? gitCheckIgnoreProbe;

  const path = resolveStorageTargetPath(e2eDir, filename);
  const dir = resolve(e2eDir);

  // Without this, a wrong cwd surfaces as "could not run git", which reads as
  // "git is missing" and sends the operator after the wrong problem.
  if (!existsSync(dir)) {
    throw new UnsafeStorageTargetError(
      `the E2E storage directory "${dir}" does not exist — run this from ` +
        "apps/web. Refusing rather than creating a directory no ignore rule " +
        "has been written for.",
    );
  }

  const verdict = probe(dir, filename);

  if (verdict.status === "unavailable") {
    throw new UnsafeStorageTargetError(
      `could not verify that "${filename}" is ignored — ${verdict.detail}. ` +
        "Refusing rather than assuming: an unverified target may be " +
        "committable, and a minted session is a live credential.",
    );
  }

  if (verdict.status === "not-ignored") {
    throw new UnsafeStorageTargetError(
      `"${filename}" is NOT covered by the repository's ignore rules, so the ` +
        "session this would write is one `git add -A` away from being " +
        "committed — to a PUBLIC repository. Use the documented convention " +
        `"${STORAGE_FILENAME_CONVENTION}" (e.g. .storage-state-manager.json). ` +
        "The answer comes from `git check-ignore` against this exact path, so " +
        "adding a new ignore pattern to make an arbitrary name pass is the " +
        "enumeration that has already failed three times — do not.",
    );
  }

  return { filename, path, ignoreRule: verdict.rule };
}
