import "server-only";

/**
 * PUBLIC VACANCY ADAPTER — the server-only HTTP half, and the ONLY place in
 * the whole pipeline where a vacancy request is made.
 *
 * It is provider-agnostic on purpose: the host, path, pagination style and
 * bounds all come from the provider descriptor
 * (lib/vacancy-sources/vacancy-provider-registry.ts). A new country therefore
 * needs NO adapter change — which is the concrete meaning of "supports future
 * countries without redesign".
 *
 * Safety properties, all enforced here rather than trusted to callers:
 *   - the kill switch is asserted before the first request;
 *   - the origin is built from the descriptor's BARE HOSTNAME over HTTPS —
 *     there is no caller-supplied endpoint, no arbitrary path and no generic
 *     proxy, so this cannot be turned into a fetch-anything utility;
 *   - GET only, redirects refused (a redirect off the allowlisted host is
 *     exactly the thing an allowlist exists to stop);
 *   - explicit timeout, byte cap, content-type check;
 *   - retries on TRANSIENT failure only — a 4xx is deterministic and is
 *     returned immediately rather than hammered;
 *   - query parameters come from a closed, per-channel allowlist;
 *   - the raw response sha256 is computed locally for provenance, and the
 *     parsed body is handed to the PURE provider parser.
 *
 * Secrets: an endpoint that requires an API key refuses to run without one,
 * and the key is sent as a header — never in the URL, never logged, never
 * included in `requestRef`.
 */
import { createHash } from "node:crypto";
import {
  getVacancyEndpoint,
  resolveProviderBounds,
  type VacancyChannelEndpointV1,
  type VacancyProviderDescriptorV1,
} from "@/lib/vacancy-sources/vacancy-provider-registry";
import type { VacancyImportChannel } from "@/lib/vacancy-sources/vacancy-contract";
import { assertVacancyProviderOperational } from "./vacancy-kill-switch";

/**
 * The closed set of query parameters any vacancy endpoint may carry. A
 * caller cannot introduce a new one; an unknown key is dropped rather than
 * forwarded, so this stays a narrow data reader.
 */
const ALLOWED_QUERY_KEYS: ReadonlySet<string> = new Set([
  // stream: deltas since an instant
  "date",
  // joblinks / paged endpoints
  "offset",
  "limit",
  // narrowing filters a provider may support
  "q",
  "occupation-name",
  "municipality",
  "region",
  "country",
]);

export type VacancyFetchErrorCode =
  | "channel_not_supported"
  | "api_key_required"
  | "http_error"
  | "content_type_invalid"
  | "response_too_large"
  | "invalid_json"
  | "network_error"
  | "timeout";

export interface VacancyFetchRequestV1 {
  readonly provider: VacancyProviderDescriptorV1;
  readonly channel: VacancyImportChannel;
  /** Query parameters, filtered against ALLOWED_QUERY_KEYS. */
  readonly query?: Readonly<Record<string, string | number>>;
  /** Owner-provisioned key for a key-requiring endpoint. Never logged. */
  readonly apiKey?: string | null;
}

export type VacancyFetchResult =
  | {
      readonly ok: true;
      readonly requestRef: string;
      readonly httpStatus: number;
      readonly responseSha256: string;
      readonly byteLength: number;
      readonly body: unknown;
    }
  | {
      readonly ok: false;
      readonly requestRef: string;
      readonly errorCode: VacancyFetchErrorCode;
      /** Secret-free detail (status code, byte count) — never a token. */
      readonly detail: string;
    };

/**
 * Build the exact request URL for one provider + channel. Deterministic and
 * side-effect free; the origin comes from the descriptor's hostname and the
 * query is allowlist-filtered. Exported for the audit trail and unit tests.
 */
export function buildVacancyRequestUrl(
  endpoint: VacancyChannelEndpointV1,
  query: Readonly<Record<string, string | number>> = {},
): string {
  const url = new URL(endpoint.path, `https://${endpoint.host}`);
  for (const [key, value] of Object.entries(query)) {
    if (!ALLOWED_QUERY_KEYS.has(key)) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one page from one provider channel with every bound enforced. The
 * kill switch is asserted before the first attempt.
 */
export async function fetchVacancyPage(
  req: VacancyFetchRequestV1,
): Promise<VacancyFetchResult> {
  assertVacancyProviderOperational(req.provider.key);

  const endpoint = getVacancyEndpoint(req.provider, req.channel);
  if (endpoint === null) {
    return {
      ok: false,
      requestRef: `${req.provider.key}:${req.channel}`,
      errorCode: "channel_not_supported",
      detail: req.channel,
    };
  }

  const requestUrl = buildVacancyRequestUrl(endpoint, req.query);
  // The provenance reference is the URL itself — it carries no secret by
  // construction, because the key (when required) travels as a header.
  const requestRef = requestUrl;

  if (endpoint.requiresApiKey && !req.apiKey) {
    return {
      ok: false,
      requestRef,
      errorCode: "api_key_required",
      detail: req.provider.key,
    };
  }

  const bounds = resolveProviderBounds(req.provider);
  const maxAttempts = bounds.maxRetries + 1;
  let lastError: { errorCode: VacancyFetchErrorCode; detail: string } = {
    errorCode: "network_error",
    detail: "no_attempt",
  };

  const headers: Record<string, string> = { Accept: "application/json" };
  if (endpoint.requiresApiKey && req.apiKey) {
    headers["api-key"] = req.apiKey;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(bounds.retryBackoffMs * attempt);

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      bounds.requestTimeoutMs,
    );
    try {
      const res = await fetch(requestUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "error",
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = { errorCode: "http_error", detail: String(res.status) };
        // 4xx are deterministic — retrying cannot change the answer.
        if (res.status >= 400 && res.status < 500) {
          return {
            ok: false,
            requestRef,
            errorCode: "http_error",
            detail: String(res.status),
          };
        }
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!/json/i.test(contentType)) {
        return {
          ok: false,
          requestRef,
          errorCode: "content_type_invalid",
          detail: contentType.slice(0, 80),
        };
      }

      const raw = await res.arrayBuffer();
      const byteLength = raw.byteLength;
      if (byteLength > bounds.maxResponseBytes) {
        return {
          ok: false,
          requestRef,
          errorCode: "response_too_large",
          detail: String(byteLength),
        };
      }

      const text = Buffer.from(raw).toString("utf8");
      const responseSha256 = createHash("sha256").update(text).digest("hex");
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return {
          ok: false,
          requestRef,
          errorCode: "invalid_json",
          detail: "unparseable_body",
        };
      }

      return {
        ok: true,
        requestRef,
        httpStatus: res.status,
        responseSha256,
        byteLength,
        body,
      };
    } catch (err) {
      clearTimeout(timer);
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /abort/i.test(err.message));
      lastError = {
        errorCode: aborted ? "timeout" : "network_error",
        detail: aborted ? "request_timeout" : "fetch_failed",
      };
      // fall through to retry
    }
  }

  return {
    ok: false,
    requestRef,
    errorCode: lastError.errorCode,
    detail: lastError.detail,
  };
}
