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
 * THE RULE. When the process IS the production deployment, a URL whose host
 * is loopback, private, link-local, unspecified, a `.local`/`.localhost`
 * name, an IPv6 ULA or a known tunnel domain is REFUSED at its read site: the
 * integration is treated as UNCONFIGURED, and one structured, key-free,
 * host-free line is logged so the operator can see why. Preview and local
 * deployments keep the old behaviour — a developer pointing a preview at a
 * tunnel is legitimate.
 *
 * TWO EVIDENCES OF PRODUCTION, OR'ed (2026-09-24). `VERCEL_ENV ===
 * "production"` (Vercel's own variable) is the primary evidence — and it
 * FAILS OPEN: if the system environment variables were ever un-exposed, an
 * env-keyed refusal would silently lapse on the very deployment it protects.
 * `lib/telemetry/production-host.ts` documents that hazard and keys its own
 * refusal on the request `Host` instead. So, where a request context exists,
 * a request served on the production host (`isProductionHost`) is the second
 * evidence: EITHER engages the refusal, never both together. A forged Host
 * can only make the policy stricter (refuse), never looser; a missing
 * `VERCEL_ENV` is reported by `/api/health` (`deployEnv: "unset"`) so it is
 * seen rather than inferred. The refusal log names which evidence engaged.
 *
 * WHY THE HOST IS NOT LOGGED. A refused endpoint can be an internal hostname
 * or an operator's tunnel id; the log names the INTEGRATION and the host CLASS,
 * which is everything needed to act and nothing that identifies a machine.
 *
 * WHAT A HOSTNAME-CLASS POLICY CANNOT SEE. A custom public hostname that
 * fronts a tunnel (an owner-registered domain CNAMEd to a tunnel edge, a
 * reverse proxy on a rented VM forwarding to a PC) classifies as `public`
 * here — the class is decided from the name, and such a name carries no
 * evidence of the machine behind it. That case is the owner rule enforced
 * OPERATIONALLY (docs/DEPLOYMENT.md, services/transcribe/README.md), not by
 * this file.
 *
 * PURE. No env is read here except the record passed in (default
 * `process.env`); no request header is read here either — a read site that
 * has one passes it in (`lib/config/request-host.ts`); no network;
 * unit-tested without a deployment.
 */
import {
  deployEnvFromEnv,
  ipv4MappedAddress,
  isLocalHostname,
  isProductionHost,
  type DeployEnv,
} from "@/lib/telemetry/production-host";

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
    // An IPv4-mapped IPv6 literal (`::ffff:7f00:1`, how the URL parser spells
    // `::ffff:127.0.0.1`) is judged as the IPv4 address it names.
    const a = ipv4MappedAddress(h) ?? h;
    if (a === "localhost" || a.endsWith(".localhost") || a === "::1" || a.startsWith("127.")) {
      return "loopback";
    }
    if (a === "::" || a === "0.0.0.0") return "unspecified";
    if (a.startsWith("169.254.")) return "link_local";
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

/** Which evidence says this process is production: Vercel's own `VERCEL_ENV`
 *  (`env`), or — where a request context exists — a request served on the
 *  production host (`host`). `null` when neither does. Checked in that order
 *  so the log names the primary evidence when both hold. */
export type ProductionEvidence = "env" | "host";

export function productionEvidence(
  env: Readonly<Record<string, string | undefined>> = process.env,
  requestHost?: string | null,
): ProductionEvidence | null {
  if (deployEnvFromEnv(env) === "production") return "env";
  if (isProductionHost(requestHost)) return "host";
  return null;
}

/** `VERCEL_ENV === "production"` OR a request on the production host engages
 *  the refusal. Unset, `preview` and `development` on a non-production host
 *  (or with no request) do not. */
export function isProductionDeployment(
  env: Readonly<Record<string, string | undefined>> = process.env,
  requestHost?: string | null,
): boolean {
  return productionEvidence(env, requestHost) !== null;
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
 *
 * `requestHost` is the request's own `Host` header where the read site has
 * one (a server action, a route handler) — the second production evidence.
 * Omitted or null (a script, a build step, no request scope) means the
 * decision rests on `VERCEL_ENV` alone, as before.
 */
export function checkOutboundIntegrationUrl(
  raw: string | undefined | null,
  opts: {
    readonly integration: OutboundIntegration;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly requestHost?: string | null;
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
  const env = opts.env ?? process.env;
  const evidence = hostKind === "public" ? null : productionEvidence(env, opts.requestHost);
  if (hostKind !== "public" && evidence !== null) {
    const key = `${opts.integration}:${hostKind}`;
    if (!logged.has(key)) {
      logged.add(key);
      const deployEnv: DeployEnv = deployEnvFromEnv(env);
      (opts.log ?? ((line: string) => console.warn(line)))(
        JSON.stringify({
          event: LOG_EVENT,
          integration: opts.integration,
          hostKind,
          // What VERCEL_ENV actually held and which evidence engaged: an
          // `unset` + `host` line is the un-exposed-variable hazard, visible.
          deployEnv,
          evidence,
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
