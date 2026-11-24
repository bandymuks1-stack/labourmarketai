import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * No live browser profile or session artifact may be TRACKED — audit M-06.
 *
 * WHY AN IGNORE RULE IS NOT ENOUGH
 * --------------------------------
 * `runtime/auth/` holds real Chrome profiles containing the owner's logged-in
 * session — cookies, tokens, `Local State`. `/runtime/` is already gitignored,
 * so on paper this is covered.
 *
 * It is not, because of a working convention in this repo: `runtime/audits/*.md`
 * IS tracked despite the blanket `/runtime/` ignore, which means those files were
 * added with `git add -f`. And `git add -f` bypasses EVERY ignore rule. So the
 * habitual command for this directory is exactly the command that defeats the
 * protection. One `git add -f runtime/` publishes live owner sessions — to a
 * PUBLIC repository.
 *
 * This guard is therefore keyed on what git ACTUALLY TRACKS, not on what
 * `.gitignore` says. `git ls-files` is the only source of truth for that: a
 * filesystem scan cannot tell tracked from ignored, and re-reading `.gitignore`
 * would assert the very thing `-f` overrides.
 *
 * Deterministic and offline: one `git ls-files` call, no network, no clock.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

const TRACKED = trackedFiles();

/** Directory names that only ever exist as a real browser profile. */
const PROFILE_DIRS = [
  "chrome-debug",
  "owner-chrome-profile",
  ".playwright-ia-proof-profile",
  "runtime/auth",
] as const;

/**
 * Filenames that carry credentials or session state. Anchored to a path segment
 * so ordinary source files cannot match by coincidence.
 */
const SESSION_ARTIFACTS: ReadonlyArray<RegExp> = [
  /(^|\/)Local State$/,
  /(^|\/)Secure Preferences$/,
  /(^|\/)Cookies(-journal)?$/,
  /(^|\/)Login Data(-journal)?$/,
  /(^|\/)Web Data(-journal)?$/,
  // Playwright storage state = a real Supabase auth cookie on disk.
  //
  // This used to be the single literal `.storage-state.json`, which is the
  // same enumeration mistake `.gitignore` made twice. It would NOT have
  // caught `.storage-state.worker.json`, `.storage-state-employer.json`, or
  // the mobile sweep's `.company-state.json` (2026-08-09) — all of which
  // carry an `sb-*-auth-token`. Both patterns below describe the CLASS:
  // anything named like a storage state anywhere, and anything state-shaped
  // inside the e2e directory whatever it gets called next.
  //
  // This guard matters more than the ignore rule, because `git add -f` — the
  // habitual command in this repo — bypasses `.gitignore` entirely and this
  // is keyed on what git actually TRACKS.
  /(^|\/)\.storage-state[^/]*\.json$/,
  /(^|\/)tests\/e2e\/[^/]*state[^/]*\.json$/i,
  /(^|\/)shared_proto_db\//,
];

/**
 * THE NAME-SHAPED BACKSTOP HAD THE BLIND SPOT IT WAS WRITTEN TO BACK UP
 * ---------------------------------------------------------------------
 * On 2026-09-23 `.storage-onboarded.json` and `.storage-newcomer.json` — real
 * local Supabase sessions — were written into the e2e directory. `.gitignore`
 * missed them because neither name contains `state`; BOTH patterns above
 * missed them for exactly the same reason. A backstop that enumerates
 * spellings fails the way the rule it backs up fails, at the same moment.
 *
 * The WRITE path is closed separately: `scripts/e2e-mint-session.ts` now asks
 * `git check-ignore` about its exact output path before it obtains any session
 * material. What remains is a file arriving some other way — hand-written,
 * copied from another machine, produced by a future script. The two rules
 * below cover that, and they are DERIVED rather than spelled:
 *
 *  1. PLACE — a tracked `.json` sitting directly in the e2e directory. That is
 *     where sessions are minted, and nothing legitimate lives there: when this
 *     was written `git ls-files apps/web/tests/e2e/` held 98 files, all `.ts`,
 *     with zero `.json` anywhere beneath it. Deliberately NOT recursive — it
 *     mirrors `.gitignore`'s own non-recursive scope, and leaves a
 *     subdirectory as the obvious home for a fixture that must be committed.
 *
 *  2. CONTENT — a tracked file, anywhere, whatever it is called, whose bytes
 *     carry a session. This one has no blind spot by name OR by location.
 *
 * Neither rule needed an exemption to go green, so neither is bent around what
 * already exists.
 */
const E2E_DIR = "apps/web/tests/e2e/";
const E2E_TRACKED_JSON = /^apps\/web\/tests\/e2e\/[^/]+\.json$/;

/**
 * Exact paths permitted to be a tracked `.json` directly in the e2e directory.
 * EMPTY, and it should stay that way: prefer a subdirectory, which rule 1 does
 * not cover. An entry here is a standing exemption on the one directory real
 * sessions are minted into, so it needs a reason written next to it.
 */
const E2E_JSON_ALLOWED: ReadonlyArray<string> = [];

/**
 * Assembled from pieces on purpose: written out whole, this guard's own source
 * would contain the thing it searches for and the rule would flag the file that
 * defines it. The JS regex is built from the same constant, so the two spellings
 * cannot drift apart.
 */
const SSR_COOKIE_VALUE = '"base64-' + "eyJ";

/**
 * Byte-level signals that a file IS a session, derived from what
 * `scripts/e2e-mint-session.ts` actually writes rather than from what a leak
 * might plausibly look like.
 *
 * Note what is NOT here. A bare `sb-<ref>-auth-token` is the cookie NAME and
 * appears in 20+ tracked source files as an ordinary constant, so it carries
 * no signal on its own — only as a JSON `name` VALUE. And a plaintext token
 * field alone would have MISSED the 2026-09-23 artefact: @supabase/ssr stores
 * the session as `base64-` + base64url(session JSON), so the token names are
 * encoded, never in plaintext. base64url of an object opening with a quoted
 * key always begins `eyJ` — hence the first signal.
 *
 * Patterns are POSIX ERE for `git grep -E`; the JS regexes re-check each hit
 * to say which signal fired.
 */
const SESSION_CONTENT_SIGNALS: ReadonlyArray<{ ere: string; js: RegExp; why: string }> = [
  {
    ere: SSR_COOKIE_VALUE,
    js: new RegExp(SSR_COOKIE_VALUE),
    why: "an @supabase/ssr session cookie value (base64url of the session JSON)",
  },
  {
    ere: '"name"[[:space:]]*:[[:space:]]*"sb-[A-Za-z0-9._-]{1,64}-auth-token',
    js: /"name"\s*:\s*"sb-[A-Za-z0-9._-]{1,64}-auth-token/,
    why: "the Supabase auth cookie name sitting in a JSON `name` field",
  },
  {
    ere: '"(access_token|refresh_token)"[[:space:]]*:[[:space:]]*"',
    js: /"(?:access_token|refresh_token)"\s*:\s*"/,
    why: "a plaintext session token field",
  },
];

/** A three-part JWT literal — a bearer token pasted anywhere, e.g. an audit. */
const JWT_LITERAL_ERE = "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}";
const JWT_LITERAL = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/**
 * Deliberately committed synthetic tokens, allowlisted by the EXACT LITERAL
 * and never by path: a path exemption would keep covering the file after
 * someone pastes a different — possibly real — token into it.
 */
const ALLOWED_SYNTHETIC_TOKENS: ReadonlyArray<string> = [
  // lib/api/api-identity.test.ts — {"alg":"HS256"} / {"sub":"x"} / "signature"
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl",
  // scripts/mcp-contract-check.ts — {"sub":"contract-check"} / "not-a-real-signature"
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb250cmFjdC1jaGVjayJ9.bm90LWEtcmVhbC1zaWduYXR1cmU",
];

/**
 * `git grep` searches what git TRACKS, for the same reason `git ls-files` is
 * used above: a filesystem walk cannot tell tracked from ignored. `-a` scans
 * every tracked file including binary ones, so renaming a session to `.png`
 * does not hide it (measured at ~1.5s over 6388 files / 339MB).
 *
 * Exit status 1 means "no matches", which is the healthy case here — it is
 * inspected rather than thrown on, and any other status still throws.
 */
function gitGrep(args: readonly string[]): string[] {
  try {
    const out = execFileSync("git", ["grep", ...args, "--", "."], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split("\n").filter(Boolean);
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    if (status === 1) return [];
    throw err;
  }
}

/** `path:line:text` hits for the ERE patterns. */
function grepLines(patterns: readonly string[]): string[] {
  return gitGrep(["-a", "-n", "-E", ...patterns.flatMap((p) => ["-e", p])]);
}

/** Files containing a fixed literal. */
function grepFilesFixed(literal: string): string[] {
  return gitGrep(["-a", "-l", "-F", "-e", literal]);
}

/** JWT literals in a line that are not a known synthetic fixture. */
function unallowedJwts(text: string): string[] {
  return [...text.matchAll(JWT_LITERAL)]
    .map((m) => m[0])
    .filter((t) => !ALLOWED_SYNTHETIC_TOKENS.includes(t));
}

/** Which session signals a single grep hit line carries. */
function sessionReasons(text: string): string[] {
  const reasons = SESSION_CONTENT_SIGNALS.filter((s) => s.js.test(text)).map((s) => s.why);
  const jwts = unallowedJwts(text);
  if (jwts.length > 0) reasons.push(`${jwts.length} JWT literal(s) that are not known fixtures`);
  return reasons;
}

/** Playwright storage state is the `{cookies:[], origins:[]}` object shape. */
function isStorageStateShaped(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  return Array.isArray(obj.cookies) && Array.isArray(obj.origins);
}

describe("no tracked browser profiles or session artifacts (audit M-06)", () => {
  it("reads a real tracked-file list", () => {
    // Without this a broken git call would make every assertion below pass
    // vacuously — green while checking nothing.
    expect(TRACKED.length).toBeGreaterThan(500);
    expect(TRACKED).toContain("apps/web/package.json");
  });

  it("tracks no file inside a browser-profile directory", () => {
    const offenders = TRACKED.filter((f) =>
      PROFILE_DIRS.some((d) => f === d || f.startsWith(`${d}/`) || f.includes(`/${d}/`)),
    );
    expect(
      offenders,
      "these tracked files live inside a LIVE browser profile. This repo is PUBLIC — " +
        "committing them publishes the owner's session. Remove them from the index " +
        `(git rm --cached) and rotate the exposed session:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("tracks no browser session/credential artifact anywhere", () => {
    const offenders = TRACKED.filter((f) => SESSION_ARTIFACTS.some((re) => re.test(f)));
    expect(
      offenders,
      `tracked session/credential artifacts found:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * RULE 1 — PLACE. See the block comment above `E2E_TRACKED_JSON`.
   */
  it("tracks no JSON directly inside the e2e directory", () => {
    // Without this the rule would pass just as happily against a checkout that
    // has no e2e directory at all.
    expect(
      TRACKED.filter((f) => f.startsWith(E2E_DIR)).length,
      "the e2e directory is not tracked here — this rule would be checking nothing",
    ).toBeGreaterThan(50);

    const offenders = TRACKED.filter(
      (f) => E2E_TRACKED_JSON.test(f) && !E2E_JSON_ALLOWED.includes(f),
    );
    expect(
      offenders,
      "these tracked JSON files sit in the directory e2e sessions are minted " +
        "into. This repo is PUBLIC. If one holds a session, `git rm --cached` it " +
        "and rotate the session; if it is a genuine fixture, move it into a " +
        "subdirectory (not covered by this rule) or add it to E2E_JSON_ALLOWED " +
        `with a reason:\n${offenders.join("\n")}`,
    ).toEqual([]);

    const stale = E2E_JSON_ALLOWED.filter((f) => !TRACKED.includes(f));
    expect(
      stale,
      `these E2E_JSON_ALLOWED entries are no longer tracked — remove them rather ` +
        `than leave a standing exemption on that directory:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * RULE 2 — CONTENT. Name-independent and location-independent.
   */
  it("tracks no file whose CONTENT carries a session", () => {
    const offenders: string[] = [];
    const unparsed: string[] = [];
    for (const line of grepLines([...SESSION_CONTENT_SIGNALS.map((s) => s.ere), JWT_LITERAL_ERE])) {
      // `git grep -n` prints `path:line:text`; a path here never contains `:`.
      const parsed = /^([^:]+):(\d+):([\s\S]*)$/.exec(line);
      if (!parsed) {
        unparsed.push(line);
        continue;
      }
      const [, file, lineNo, text] = parsed;
      const reasons = sessionReasons(text);
      if (reasons.length > 0) offenders.push(`${file}:${lineNo} — ${reasons.join("; ")}`);
    }

    // A hit that cannot be parsed must never be dropped: silently skipping it
    // would report "clean" about a line git DID match.
    expect(
      unparsed,
      "git grep returned hits this rule could not read — they were matches, so " +
        `they cannot be treated as clean:\n${unparsed.join("\n")}`,
    ).toEqual([]);

    expect(
      offenders,
      "these tracked files carry session material in their BYTES, whatever they " +
        "are named. This repo is PUBLIC — remove them from the index " +
        `(git rm --cached) and rotate the exposed session:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * ANTI-VACUITY for rule 2. Every assertion above passes when `git grep` finds
   * nothing — including when it finds nothing because it is broken, pointed at
   * the wrong directory, or because a pattern stopped matching. These controls
   * are what fail in that case.
   */
  it("proves the content scan and its detectors really fire", () => {
    expect(
      grepFilesFixed('"@supabase/ssr"').length,
      "git grep found no file declaring the Supabase SSR dependency — the scan " +
        "itself is not working, so rule 2 is green while checking nothing",
    ).toBeGreaterThan(0);

    // Assembled, never written whole: a literal here would be a real hit
    // against this file and would red the rule it is meant to prove.
    const syntheticJwt = [
      "eyJhbGciOiJIUzI1NiJ9",
      "eyJzdWIiOiJjb250cm9sIn0",
      "c3ludGhldGljLXNpZ25hdHVyZQ",
    ].join(".");
    // Built with JSON.stringify rather than written out: the quoted `name` key
    // next to the cookie name is itself a signal, so a literal would be a real
    // hit against this file.
    const syntheticCookie = JSON.stringify({
      name: "sb-127-auth-token",
      value: `${SSR_COOKIE_VALUE.slice(1)}ZmFrZSJ9`,
    });

    expect(ALLOWED_SYNTHETIC_TOKENS).not.toContain(syntheticJwt);
    expect(unallowedJwts(syntheticJwt)).toEqual([syntheticJwt]);
    expect(unallowedJwts(ALLOWED_SYNTHETIC_TOKENS[0])).toEqual([]);
    expect(sessionReasons(syntheticCookie).length).toBeGreaterThan(0);
    expect(sessionReasons(`{"access_token"` + `: "x"}`).length).toBeGreaterThan(0);
    // An ordinary source line must stay clean, or rule 2 is a false-positive mill.
    expect(sessionReasons(`const cookieName = \`sb-\${projectRef}-auth-token\`;`)).toEqual([]);

    const staleTokens = ALLOWED_SYNTHETIC_TOKENS.filter((t) => grepFilesFixed(t).length === 0);
    expect(
      staleTokens,
      "these allowlisted synthetic tokens are no longer tracked anywhere — " +
        "remove the entry rather than leave a standing exemption for a literal " +
        `nothing uses:\n${staleTokens.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * RULE 2b — SHAPE. Catches a committed storage state whose token fields were
   * scrubbed or expired: harmless bytes, but it means an artefact got committed
   * and the next one may not be scrubbed.
   */
  it("tracks no Playwright storage-state-shaped JSON", () => {
    const trackedJson = TRACKED.filter((f) => f.endsWith(".json"));
    const offenders: string[] = [];
    let read = 0;
    for (const file of trackedJson) {
      let raw: string;
      try {
        raw = readFileSync(join(REPO_ROOT, file), "utf8");
      } catch (err) {
        // Only a file deleted from the working tree may be skipped — it holds
        // nothing to leak. Anything else is a real read failure and must not be
        // swallowed into a silent pass.
        if ((err as { code?: string }).code === "ENOENT") continue;
        throw err;
      }
      read += 1;
      if (isStorageStateShaped(raw)) offenders.push(file);
    }

    // Anti-vacuity: an empty or mass-skipped list cannot stand in for a clean one.
    expect(read, "read almost no tracked JSON — this rule checks nothing").toBeGreaterThan(50);
    expect(
      isStorageStateShaped(
        JSON.stringify({ cookies: [{ name: "sb-127-auth-token" }], origins: [] }),
      ),
    ).toBe(true);
    expect(isStorageStateShaped(JSON.stringify({ name: "web", dependencies: {} }))).toBe(false);
    expect(isStorageStateShaped("not json at all")).toBe(false);

    expect(
      offenders,
      "these tracked JSON files have the Playwright storageState shape " +
        `({cookies,origins}) — they are session artefacts:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * The `runtime/` exception is narrow ON PURPOSE: only human-readable audit and
   * planning markdown. If anything else appears there, the `git add -f` habit has
   * started sweeping in more than intended — which is the mechanism this whole
   * finding is about.
   */
  it("tracks only markdown under runtime/", () => {
    const offenders = TRACKED.filter((f) => f.startsWith("runtime/") && !f.endsWith(".md"));
    expect(
      offenders,
      "only markdown may be force-added under runtime/. Non-markdown here means " +
        `\`git add -f runtime/\` pulled in more than intended:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the env files untracked", () => {
    const offenders = TRACKED.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".example"));
    expect(offenders, `tracked env files: ${offenders.join(", ")}`).toEqual([]);
  });
});
