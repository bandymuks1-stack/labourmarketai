/**
 * THE one rule for "is this origin the real product?" — shared by the client
 * emitter and the server emitter.
 *
 * WHY IT IS SHARED. The client stamped `preview_host: true` from
 * `window.location.hostname`; the server emitter stamped nothing at all,
 * because it has no `window`. So a single session on localhost or a preview
 * deploy produced HALF-marked telemetry: its client events (landing, CTA,
 * registration) were excluded from the owner's funnel and its server events
 * (match preview, shortlist, contact, booking, engagement) were counted as
 * real. Every mid-funnel rate was therefore computed over a population the
 * top-of-funnel rates had already filtered.
 *
 * That mattered most where it was least visible: `pnpm dev` loads
 * `apps/web/.env.local`, which points at the PRODUCTION Supabase project, so
 * ordinary local development writes real rows into production `pilot_events`.
 * The client half was excluded; the server half was not.
 *
 * Two emitters, one predicate. No environment variable is consulted: a
 * missing or mistyped `VERCEL_ENV` would silently reclassify the entire
 * funnel, and the hostname is the thing actually being asserted.
 */

/** Hosts that ARE the real product. Everything else — localhost, 127.0.0.1,
 *  *.vercel.app preview deploys, LAN IPs, tunnels — is non-production. */
export function isProductionHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  // A Host header carries the port; a hostname does not. Strip it, and strip
  // IPv6 brackets, before comparing.
  const bare = hostname
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(":")[0];
  if (!bare) return false;
  if (bare === "labourmarket-ai.vercel.app") return true; // managed prod alias
  return bare === "labourmarket.ai" || bare.endsWith(".labourmarket.ai");
}

/** The inverse, named the way both call sites ask the question. */
export function isNonProductionHostname(
  hostname: string | null | undefined,
): boolean {
  return !isProductionHost(hostname);
}

/* ────────────────────────────────────────────────────────────────────────────
 * ORIGIN OF A TELEMETRY WRITE (2026-09-20).
 *
 * WHY THIS EXISTS. `apps/web/.env.local` points at the PRODUCTION Supabase
 * project, so a local `next start` walked by a browser — a launch smoke, a
 * packet check, ordinary development — writes `pilot_events` rows exactly
 * like a real visitor. The only thing that kept those rows out of the owner's
 * funnel was the CLIENT stamping `preview_host` from `window.location`. A
 * server-emitted event, a walker with an unusual host, or a browser whose
 * location the client code never saw, produced an unmarked row; and every
 * row, marked or not, carried `app_version = NULL`, so nothing recorded which
 * build or environment wrote it. (Production probe 2026-09-20: the local
 * smoke rows at 12:52Z / 14:06Z on `/pl/jobs/…` DID carry the client marker;
 * `app_version` was null on all 43 rows of the day.)
 *
 * Two server-side facts now travel with every write, decided in the server
 * action where the client cannot forge them:
 *
 *   1. the request's own `Host` header — a LOCAL host (localhost, loopback,
 *      a LAN address) is positive evidence that a developer's process is
 *      writing, and such writes are REFUSED rather than tagged;
 *   2. the deployment environment — Vercel sets `VERCEL_ENV` on every
 *      deployment (`production` | `preview` | `development`); anything else
 *      is not a Vercel deployment and is stamped `local`.
 *
 * The refusal is keyed on the Host header ONLY, never on the environment
 * variable. The asymmetry is deliberate: a `VERCEL_ENV` that went missing on
 * production (system variables un-exposed, a platform change) would make an
 * env-keyed refusal silently blank the entire production funnel, whereas a
 * mis-stamped `deploy_env` only moves rows into the visible "excluded" count
 * where the owner can see them and ask why. A local Host header cannot be
 * produced by production traffic at all.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where a telemetry row was written from. `local` = not a Vercel deployment
 *  (a developer's machine, a CI job, a tunnel to either). */
export type TelemetryOrigin = "production" | "preview" | "local";

/** The metadata key the server action stamps the origin under. Declared here
 *  so the emitter, the allowlist and the readers share one spelling. */
export const DEPLOY_ENV_KEY = "deploy_env";

/**
 * A hostname that can ONLY be a developer's own process: `localhost` and its
 * subdomains, the loopback and unspecified addresses, link-local and private
 * LAN IPv4 ranges. `*.vercel.app` previews are NOT local — they are real
 * deployments with their own origin (`preview`) and are tagged, not refused.
 */
export function isLocalHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const bare = hostname
    .toLowerCase()
    .trim()
    // A bracketed IPv6 literal, with or without a port: keep the address.
    .replace(/^\[([^\]]+)\](?::\d+)?$/, "$1")
    // Any other host: strip a trailing `:port`. (A bare IPv6 literal has
    // several colons and no port, so it is left alone.)
    .replace(/^([^:]+):\d+$/, "$1");
  if (!bare) return false;
  if (bare === "localhost" || bare.endsWith(".localhost")) return true;
  if (bare === "::1" || bare === "::" || bare === "0.0.0.0") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (!v4) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

/** Vercel's own environment name → the origin a row is stamped with. Unset
 *  or unrecognised means the process is not a Vercel deployment. */
export function telemetryOriginFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TelemetryOrigin {
  const v = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (v === "production") return "production";
  if (v === "preview") return "preview";
  return "local";
}

/**
 * The `app_version` a row is stamped with: `<origin>@<commit>` on a Vercel
 * deployment (`VERCEL_GIT_COMMIT_SHA`, first 12 characters — the same build
 * identity `/api/health` reports), the bare origin when no commit is known.
 * Bounded by the column's 64-char check constraint by construction.
 */
export function telemetryAppVersion(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const origin = telemetryOriginFromEnv(env);
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase();
  const build = /^[0-9a-f]{7,40}$/.test(sha)
    ? sha.slice(0, 12)
    : (env.VERCEL_DEPLOYMENT_ID ?? "").trim().slice(0, 40);
  return build ? `${origin}@${build}`.slice(0, 64) : origin;
}

/** Reader-side twin of the stamp: does this metadata say the row was written
 *  from somewhere other than production? A row with NO stamp (written before
 *  2026-09-20) answers `false` here and is judged by `preview_host` alone. */
export function isNonProductionOrigin(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false;
  if (metadata["preview_host"] === true) return true;
  const env = metadata[DEPLOY_ENV_KEY];
  return typeof env === "string" && env !== "production";
}
