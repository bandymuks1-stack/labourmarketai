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
import {
  VACANCY_IMPORT_BOUNDS,
  type VacancyImportChannel,
} from "@/lib/vacancy-sources/vacancy-contract";
import {
  readVacancyJsonLines,
  type VacancyJsonLinesStopReason,
} from "@/lib/vacancy-sources/vacancy-json-lines";
import { assertVacancyProviderOperational } from "./vacancy-kill-switch";

/**
 * The closed set of query parameters any vacancy endpoint may carry. A
 * caller cannot introduce a new one; an unknown key is dropped rather than
 * forwarded, so this stays a narrow data reader.
 */
const ALLOWED_QUERY_KEYS: ReadonlySet<string> = new Set([
  // stream: deltas since an instant, and the matching upper bound that keeps
  // one slice affordable (see the registry's time_window note)
  "date",
  "updated-before-date",
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
      // The timer is deliberately NOT cleared here. `fetch` resolves as soon
      // as the RESPONSE HEADERS arrive, so clearing it at this point would
      // leave the body transfer — by far the longest part, and the part that
      // can stall — with no time bound at all. It is cleared in `finally`,
      // once the body has been read or the attempt has ended, so
      // `requestTimeoutMs` bounds the whole request as it claims to.

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
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /abort/i.test(err.message));
      lastError = {
        errorCode: aborted ? "timeout" : "network_error",
        detail: aborted ? "request_timeout" : "fetch_failed",
      };
      // fall through to retry
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    requestRef,
    errorCode: lastError.errorCode,
    detail: lastError.detail,
  };
}

// ── STREAMED (line-delimited) TRANSPORT ─────────────────────────────────────

/**
 * The MIME type a line-delimited body must actually arrive as. Checked rather
 * than assumed, because the deprecated JobStream endpoints ACCEPT this header
 * and ignore it — they answer `application/json` with one newline-free array.
 * Reading that as lines yields zero records, which would be indistinguishable
 * from "the publisher has no ads". Refusing on the content type turns a
 * silent, total data loss into a loud, obvious failure.
 */
const JSON_LINES_CONTENT_TYPE = /jsonl|ndjson|json-lines|x-jsonlines/i;

export interface VacancyStreamFetchRequestV1 extends VacancyFetchRequestV1 {
  /** Records to cross before collecting — the resume point. */
  readonly skipRecords: number;
  /** Records to collect in this session. */
  readonly maxRecords: number;
}

export type VacancyStreamFetchResult =
  | {
      readonly ok: true;
      readonly requestRef: string;
      readonly httpStatus: number;
      /** Total bytes pulled off the wire, including any skipped prefix. */
      readonly byteLength: number;
      /** Decoded records, publisher order, at most `maxRecords`. */
      readonly records: readonly unknown[];
      /** True ONLY when the publisher ended the body. */
      readonly completedStream: boolean;
      /** Resume point for the next session. 0 once the walk has drained. */
      readonly nextOffset: number;
      readonly stopReason: VacancyJsonLinesStopReason;
      readonly malformedLines: number;
      readonly recordsSkipped: number;
      /**
       * True when the body was cut short by a transport fault rather than by a
       * budget. The records already collected are still valid and are still
       * returned — discarding them would throw away real progress that the
       * record-offset checkpoint is perfectly able to keep.
       */
      readonly interrupted: boolean;
      /** Set only when `interrupted`. A stable code, never a payload. */
      readonly interruptionCode: VacancyFetchErrorCode | null;
    }
  | {
      readonly ok: false;
      readonly requestRef: string;
      readonly errorCode: VacancyFetchErrorCode;
      readonly detail: string;
    };

/**
 * Fetch one bounded slice of a LINE-DELIMITED endpoint.
 *
 * The difference from `fetchVacancyPage` is the whole point: the body is never
 * assembled. Bytes are pulled off the wire, split on newlines, and turned into
 * records one at a time, so peak memory is one line rather than one response.
 * That is what makes a 390 MiB snapshot readable at all.
 *
 * Failure split, and why it matters:
 *   - anything that goes wrong BEFORE the body starts (HTTP status, content
 *     type, connect timeout, DNS) returns `ok: false` and is retried under the
 *     provider's normal retry policy — nothing was consumed, so a retry is
 *     free and correct;
 *   - anything that goes wrong DURING the body returns `ok: true` with
 *     `interrupted: true` and keeps the records already read. A retry there
 *     would re-download everything, and it is unnecessary: the offset
 *     checkpoint lets the next session resume from exactly where this one
 *     stopped.
 */
export async function fetchVacancyJsonLines(
  req: VacancyStreamFetchRequestV1,
): Promise<VacancyStreamFetchResult> {
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
  const requestRef = requestUrl;

  if (endpoint.bodyFormat !== "json_lines") {
    // Calling the streamed reader on a buffered channel would misread the
    // body. Refuse rather than guess.
    return {
      ok: false,
      requestRef,
      errorCode: "content_type_invalid",
      detail: "endpoint_not_json_lines",
    };
  }
  if (endpoint.requiresApiKey && !req.apiKey) {
    return {
      ok: false,
      requestRef,
      errorCode: "api_key_required",
      detail: req.provider.key,
    };
  }

  const bounds = resolveProviderBounds(req.provider);
  const headers: Record<string, string> = { Accept: "application/jsonl" };
  if (endpoint.requiresApiKey && req.apiKey) {
    headers["api-key"] = req.apiKey;
  }

  const maxAttempts = bounds.maxRetries + 1;
  let lastError: { errorCode: VacancyFetchErrorCode; detail: string } = {
    errorCode: "network_error",
    detail: "no_attempt",
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(bounds.retryBackoffMs * attempt);

    const controller = new AbortController();
    // A streamed session is bounded by its OWN wall clock, not by
    // `requestTimeoutMs`. A full snapshot legitimately takes minutes; holding
    // it to a 20 s request bound would abort every single run.
    const timer = setTimeout(
      () => controller.abort(),
      VACANCY_IMPORT_BOUNDS.streamedSessionTimeoutMs,
    );

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "error",
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /abort/i.test(err.message));
      lastError = {
        errorCode: aborted ? "timeout" : "network_error",
        detail: aborted ? "request_timeout" : "fetch_failed",
      };
      continue;
    }

    try {
      if (!response.ok) {
        lastError = {
          errorCode: "http_error",
          detail: String(response.status),
        };
        // 4xx is deterministic — retrying cannot change the answer.
        if (response.status >= 400 && response.status < 500) {
          return {
            ok: false,
            requestRef,
            errorCode: "http_error",
            detail: String(response.status),
          };
        }
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!JSON_LINES_CONTENT_TYPE.test(contentType)) {
        return {
          ok: false,
          requestRef,
          errorCode: "content_type_invalid",
          detail: contentType.slice(0, 80),
        };
      }

      const body = response.body;
      if (body === null) {
        lastError = { errorCode: "network_error", detail: "no_body" };
        continue;
      }

      let interrupted = false;
      let interruptionCode: VacancyFetchErrorCode | null = null;
      const reader = body.getReader();

      // The reader owns pulling; the decoder owns splitting. Cancelling the
      // reader when the decoder stops is what actually ends the transfer
      // rather than politely ignoring the remaining 300 MB.
      async function* pump(): AsyncIterable<Uint8Array> {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            if (value) yield value;
          }
        } catch (err) {
          interrupted = true;
          const aborted =
            err instanceof Error &&
            (err.name === "AbortError" || /abort/i.test(err.message));
          interruptionCode = aborted ? "timeout" : "network_error";
        }
      }

      const decoded = await readVacancyJsonLines(pump(), {
        skipRecords: req.skipRecords,
        maxRecords: req.maxRecords,
        maxBytes: VACANCY_IMPORT_BOUNDS.maxStreamedBytes,
        maxSkipBytes: VACANCY_IMPORT_BOUNDS.maxStreamedSkipBytes,
        maxLineBytes: VACANCY_IMPORT_BOUNDS.maxJsonLineBytes,
      });

      // Stop the transfer. Already-finished streams cancel harmlessly.
      await reader.cancel().catch(() => undefined);

      return {
        ok: true,
        requestRef,
        httpStatus: response.status,
        byteLength: decoded.bytesRead,
        records: decoded.records,
        // An interrupted body never counts as a completed walk, whatever the
        // decoder concluded from simply running out of chunks.
        completedStream: decoded.completedStream && !interrupted,
        nextOffset: interrupted
          ? decoded.recordsSkipped + decoded.records.length + decoded.malformedLines
          : decoded.nextOffset,
        stopReason: decoded.stopReason,
        malformedLines: decoded.malformedLines,
        recordsSkipped: decoded.recordsSkipped,
        interrupted,
        interruptionCode,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    requestRef,
    errorCode: lastError.errorCode,
    detail: lastError.detail,
  };
}
