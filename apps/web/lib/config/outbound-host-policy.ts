/**
 * OUTBOUND HOST POLICY for OPTIONAL integrations (2026-09-23).
 *
 * WHY THIS EXISTS. Four optional integrations take a URL from server env and
 * call it from a Vercel function: the local OpenAI-compatible AI runtime
 * (`AI_LOCAL_BASE_URL`), the self-hosted transcription service
 * (`VOICE_TRANSCRIBE_URL`), the Nonstop commercial hand-off door
 * (`NONSTOP_HANDOFF_ENDPOINT`) and the Agentai owner-alert bridge
 * (`AGENTAI_OS_ALERT_ENDPOINT`). Each validated its value as a URL — and would
 * have accepted an https tunnel to a PC (`*.ngrok*`, `*.trycloudflare.com`,
 * `*.loca.lt`), a LAN address, `*.local`, or a loopback host. In production
 * that is the forbidden shape: a product path whose availability depends on
 * the owner's computer being on (owner rule, Docker audit 2026-09-23: "the
 * production must not depend on the owner's computer"). Worse, the alert
 * bridge has NO fallback once configured, so every owner alert would be LOST
 * while that PC slept.
 *
 * THE RULE. When the process IS the production deployment (`VERCEL_ENV ===
 * "production"`, Vercel's own variable), a URL whose host is loopback,
 * private, link-local, unspecified, a `.local`/`.localhost` name, an IPv6 ULA
 * or a known tunnel domain is REFUSED at its read site: the integration is
 * treated as UNCONFIGURED, and one structured, key-free, host-free line is
 * logged so the operator can see why. Preview and local deployments keep the
 * old behaviour — a developer pointing a preview at a tunnel is legitimate.
 *
 * WHY THE HOST IS NOT LOGGED. A refused endpoint can be an internal hostname
 * or an operator's tunnel id; the log names the INTEGRATION and the host CLASS,
 * which is everything needed to act and nothing that identifies a machine.
 *
 * PURE. No env is read here except the record passed in (default
 * `process.env`); no network; unit-tested without a deployment.
 */
import { isLocalHostname } from "@/lib/telemetry/production-host";

export type OutboundHostKind =
  | "loopback"
  | "unspecified"
  | "link_local"
  | "private"
  | "local_tld"
  | "ipv6_ula"
  | "tunnel"
  | "public";

/** The integrations this policy is applied to — named by their env variable. */
export type OutboundIntegration =
  | "AI_LOCAL_BASE_URL"
  | "VOICE_TRANSCRIBE_URL"
  | "NONSTOP_HANDOFF_ENDPOINT"
  | "AGENTAI_OS_ALERT_ENDPOINT";

/** Tunnel services that terminate on somebody's workstation by design. */
const TUNNEL_HOST_PATTERNS: readonly RegExp[] = [
  /(^|\.)ngrok(-free)?\.(io|app|dev)$/,
  /(^|\.)ngrok\.[a-z]+$/,
  /(^|\.)trycloudflare\.com$/,
  /(^|\.)loca\.lt$/,
  /(^|\.)localtunnel\.me$/,
  /(^|\.)serveo\.net$/,
];

function bareHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .trim()
    .replace(/^\[([^\]]+)\](?::\d+)?$/, "$1")
    .replace(/^([^:]+):\d+$/, "$1")
    .replace(/\.$/, "");
}

/**
 * Where a hostname points, as a class. `isLocalHostname` (the telemetry
 * origin rule) decides the loopback / private / link-local membership so the
 * two never drift; this only names WHICH of those it was, and adds the
 * classes telemetry has no reason to know about (`.local`, ULA, tunnels).
 */
export function classifyOutboundHost(hostname: string | null | undefined): OutboundHostKind {
  if (!hostname) return "loopback";
  const h = bareHost(hostname);
  if (!h) return "loopback";

  if (isLocalHostname(h)) {
    if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h.startsWith("127.")) {
      return "loopback";
    }
    if (h === "::" || h === "0.0.0.0") return "unspecified";
    if (h.startsWith("169.254.")) return "link_local";
    return "private";
  }
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) {
    return "local_tld";
  }
  // IPv6 unique-local fc00::/7 and link-local fe80::/10.
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return "ipv6_ula";
  if (/^fe[89ab][0-9a-f]:/.test(h)) return "link_local";
  if (TUNNEL_HOST_PATTERNS.some((re) => re.test(h))) return "tunnel";
  return "public";
}

/** Vercel's own environment name — `production` is the only value that
 *  engages the refusal. Unset, `preview` and `development` do not. */
export function isProductionDeployment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (env.VERCEL_ENV ?? "").trim().toLowerCase() === "production";
}

export type OutboundUrlCheck =
  | { readonly ok: true; readonly url: string; readonly hostKind: OutboundHostKind }
  | {
      readonly ok: false;
      readonly reason: "missing" | "invalid_url" | "refused_host";
      readonly hostKind: OutboundHostKind | null;
      /** Safe to surface to an operator: names the integration and the host
       *  class, never the value. */
      readonly detail: string;
    };

const LOG_EVENT = "outbound_host_refused";
/** One line per integration per process — the read sites run per request. */
const logged = new Set<string>();

/**
 * Validate an optional integration URL against the production host policy.
 *
 * Returns the TRIMMED ORIGINAL string on success (callers keep their own
 * normalisation, e.g. checkLocalBaseUrl's path handling). A refusal in
 * production logs one structured line and the caller treats the integration
 * as unconfigured. Outside production only "missing" and "invalid_url" fail.
 */
export function checkOutboundIntegrationUrl(
  raw: string | undefined | null,
  opts: {
    readonly integration: OutboundIntegration;
    readonly env?: Readonly<Record<string, string | undefined>>;
    /** Test seam. */
    readonly log?: (line: string) => void;
  },
): OutboundUrlCheck {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed === "") {
    return {
      ok: false,
      reason: "missing",
      hostKind: null,
      detail: `${opts.integration} is not set`,
    };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "invalid_url",
      hostKind: null,
      detail: `${opts.integration} is not a parseable absolute URL`,
    };
  }
  const hostKind = classifyOutboundHost(url.hostname);
  if (hostKind !== "public" && isProductionDeployment(opts.env ?? process.env)) {
    const key = `${opts.integration}:${hostKind}`;
    if (!logged.has(key)) {
      logged.add(key);
      (opts.log ?? ((line: string) => console.warn(line)))(
        JSON.stringify({
          event: LOG_EVENT,
          integration: opts.integration,
          hostKind,
          deployEnv: "production",
          effect: "integration treated as unconfigured",
        }),
      );
    }
    return {
      ok: false,
      reason: "refused_host",
      hostKind,
      detail:
        `${opts.integration} refused in production: its host is ${hostKind} ` +
        "(loopback / private / link-local / .local / tunnel hosts depend on " +
        "somebody's machine being on). Point it at an always-on public host.",
    };
  }
  return { ok: true, url: trimmed, hostKind };
}

/** Convenience for read sites that only need the value-or-nothing. */
export function outboundIntegrationUrl(
  raw: string | undefined | null,
  opts: Parameters<typeof checkOutboundIntegrationUrl>[1],
): string | undefined {
  const r = checkOutboundIntegrationUrl(raw, opts);
  return r.ok ? r.url : undefined;
}

/** Test-only: forget which refusals were already logged. */
export function resetOutboundHostPolicyLog(): void {
  logged.clear();
}
