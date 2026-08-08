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
