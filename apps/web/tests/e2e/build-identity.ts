import { expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE SERVER UNDER TEST MUST BE THIS BUILD.
 *
 * On 2026-08-28 a `next start -p 3100` left running from ANOTHER WORKTREE —
 * 22 commits behind, carrying the previous `DetailsHashOpener` — answered the
 * e2e suite for a whole session. `scripts/e2e-local.ts` always uses the fixed
 * port 3100 and `reuseExistingServer` cannot tell this build from a stranger's,
 * so the suite tested somebody else's code and reported it as this branch's
 * behaviour. The deep-link specs saw `scrollY` stay at exactly 0 with the
 * target element present, intermittently, and it read exactly like a product
 * race. It was not one.
 *
 * #1332 closed the door for local-stack runs (`reuseExistingServer: !LOCAL_STACK`,
 * so Playwright now errors with "port is already used" rather than inheriting
 * a server it did not start). That is a good lock on the front door, but it
 * only covers the case where Playwright starts the server. It says nothing
 * about `E2E_NO_SERVER=1` runs, about a developer pointing `E2E_BASE_URL` at
 * something they built yesterday, or about CI reusing a warm environment.
 *
 * This is the second lock, and it checks identity rather than availability:
 * does the thing answering `baseURL` serve the build that is on disk right now?
 *
 * ## How it knows
 *
 * Next embeds the build id in the served HTML, so no new route, no new
 * endpoint and no product surface is needed to ask the question — the answer
 * is already in the page. `.next/BUILD_ID` changes on every production build,
 * so a foreign or stale server fails the comparison immediately and loudly.
 *
 * Never a warning, never a skip-on-mismatch: a wrong target must fail, because
 * the entire cost of the incident above was that it did not.
 */

/** `apps/web/.next/BUILD_ID`, or null when nothing has been built here. */
export function localBuildId(): string | null {
  const file = join(__dirname, "..", "..", ".next", "BUILD_ID");
  if (!existsSync(file)) return null;
  const id = readFileSync(file, "utf8").trim();
  return id === "" ? null : id;
}

/**
 * Fail unless `baseURL` is served by the build in `.next/BUILD_ID`.
 *
 * Returns quietly when there is no local build to compare against — that is a
 * genuinely unknown answer, not a passing one, and the caller is expected to
 * be running against a dev server it started itself. It NEVER returns quietly
 * on a mismatch.
 */
export async function assertServerIsThisBuild(
  request: APIRequestContext,
  baseURL: string,
  path = "/lt",
): Promise<void> {
  const expected = localBuildId();
  if (expected === null) return;

  const res = await request.get(`${baseURL}${path}`);
  expect(
    res.ok(),
    `${baseURL}${path} did not answer (${res.status()}) — cannot confirm which build is under test`,
  ).toBe(true);
  const html = await res.text();

  expect(
    html.includes(expected),
    `The server on ${baseURL} is NOT serving this build.\n` +
      `  expected build id: ${expected} (apps/web/.next/BUILD_ID)\n` +
      "  the served HTML does not contain it.\n" +
      "This is the 2026-08-28 failure mode: a server from another worktree or " +
      "an older commit answering the suite. Stop the stranger on that port, or " +
      "point E2E_BASE_URL at a server built from this checkout — do not " +
      "re-run hoping it passes.",
  ).toBe(true);
}
