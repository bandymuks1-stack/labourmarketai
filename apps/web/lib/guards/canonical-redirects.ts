/**
 * The canonical route redirects, read from `next.config.ts` (W1).
 *
 * Six routes used to exist as redirect-only `page.tsx` files. W1 deleted the
 * route files and moved the redirects to the Next config, so the URLs still
 * work for bookmarks and external links while the App Router carries six fewer
 * entries.
 *
 * Guards that used to assert "this page file redirects to X" assert the SAME
 * INTENT through this helper instead. The protection is unchanged: a canonical
 * surface may not gain a competing twin, and an old URL may not start 404-ing.
 *
 * Not a test file — a shared helper for guards.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const repoRoot = resolve(here, "..", "..", "..", "..");
const CONFIG = join(repoRoot, "apps", "web", "next.config.ts");

export interface CanonicalRedirect {
  readonly source: string;
  readonly destination: string;
  readonly permanent: boolean;
}

/** Parse the W1 redirect table straight out of the config. */
export function canonicalRedirects(): readonly CanonicalRedirect[] {
  const src = readFileSync(CONFIG, "utf8");
  const block = /W1_CANONICAL_REDIRECTS\s*=\s*\[([\s\S]*?)\n\] as const;/.exec(src)?.[1] ?? "";
  const out: CanonicalRedirect[] = [];
  const re =
    /source:\s*"([^"]+)"\s*,\s*destination:\s*"([^"]+)"\s*,\s*permanent:\s*(true|false)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out.push({ source: m[1], destination: m[2], permanent: m[3] === "true" });
  }
  return out;
}

/** The destination a retired route redirects to, `null` when it is not mapped. */
export function redirectFor(route: string): string | null {
  const want = `/:locale${route}`;
  const hit = canonicalRedirects().find((r) => r.source === want);
  return hit ? hit.destination.replace("/:locale", "") : null;
}

/** True when the retired route still resolves somewhere (never a 404). */
export function isCanonicallyRedirected(route: string, expectedDestination?: string): boolean {
  const dest = redirectFor(route);
  if (!dest) return false;
  return expectedDestination ? dest.startsWith(expectedDestination) : true;
}

/** The routes W1 retired. Kept here so guards share one list. */
export const W1_RETIRED_ROUTES: readonly string[] = [
  "/dashboard/assistant",
  "/dashboard/marketplace",
  "/dashboard/player-card",
  "/dashboard/agency",
  "/dashboard/agency/pool",
  "/dashboard/start/agency",
];

/** Routes W1 deleted outright (dev-only or a second primary surface). */
export const W1_DELETED_ROUTES: readonly string[] = [
  "/dashboard/visual-os",
  "/dashboard/visual-os/agency",
  "/design",
  "/design/conversation",
  "/design/text-first",
];
