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
import { readContinuationToken } from "@/lib/vacancy-sources/vacancy-cursor";
import {
  expandDetailFanOut,
  type DetailFanOutDiagnostics,
  type DetailFetchResult,
} from "@/lib/vacancy-sources/vacancy-detail-fanout";
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
  | "timeout"
  /** A two-level feed's detail request failed: the page fails closed. */
  | "detail_fetch_failed";

export interface VacancyFetchRequestV1 {
  readonly provider: VacancyProviderDescriptorV1;
  readonly channel: VacancyImportChannel;
  /** Query parameters, filtered against ALLOWED_QUERY_KEYS. */
  readonly query?: Readonly<Record<string, string | number>>;
  /** Owner-provisioned key for a key-requiring endpoint. Never logged. */
  readonly apiKey?: string | null;
  /**
   * The continuation token to resume from, for a `cursor` endpoint that names
   * its next page by PATH. Substituted into the descriptor's `pathTemplate`
   * after a plain-identifier check; never a caller-supplied path.
   */
  readonly continuationToken?: string | null;
  /**
   * The capture instant (ISO), used ONLY to start a cold walk at a time on a
   * feed whose head is years old (`cursor.coldStart`). Deterministic: the
   * caller's clock, never read here.
   */
  readonly coldStartAtIso?: string | null;
  /**
   * Two-level feeds only: most detail requests this page may spend (the
   * session's REMAINING budget). Absent = the descriptor's per-page cap only.
   */
  readonly detailBudget?: number;
  /** Two-level feeds only: leading entries of this page a previous session
   *  already consumed (see `expandDetailFanOut`). */
  readonly skipEntries?: number;
  /**
   * Called once per RETRY (an attempt after the first) of any request this
   * fetch makes — the listing request and, on a two-level feed, each detail
   * request. Lets the caller account retries exactly; the adapter keeps no
   * counter of its own.
   */
  readonly onRetry?: () => void;
}

/** A continuation token that may be placed in a path: one identifier segment. */
const PATH_TOKEN = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Timing evidence for one page fetch, reported on success AND failure (the
 * accounting is how a stalled feed is diagnosed). Numbers and a public ad id
 * only. `listingElapsedMs` is the network time of the last listing attempt.
 */
export interface VacancyFetchDiagnosticsV1 {
  readonly listingElapsedMs: number | null;
  readonly detail: DetailFanOutDiagnostics | null;
}

export type VacancyFetchResult =
  | {
      readonly diagnostics?: VacancyFetchDiagnosticsV1;
      readonly ok: true;
      readonly requestRef: string;
      readonly httpStatus: number;
      readonly responseSha256: string;
      readonly byteLength: number;
      readonly body: unknown;
      /** Present only for a two-level feed: how far into the page this fetch
       *  got. `consumedEntries` counts the `skipEntries` prefix; `pageComplete`
       *  is false when the session's detail budget stopped the page early. */
      readonly fanOut?: {
        /** True when the page names a successor: it is CLOSED and can no longer
         *  receive appended entries. Only then is an in-page position valid. */
        readonly pageClosed: boolean;
        readonly consumedEntries: number;
        readonly pageComplete: boolean;
        readonly detailFetched: number;
        readonly detailRequestsSpent: number;
      };
    }
  | {
      readonly diagnostics?: VacancyFetchDiagnosticsV1;
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
  continuationToken: string | null = null,
): string {
  const template = endpoint.pagination === "cursor" ? (endpoint.cursor?.pathTemplate ?? null) : null;
  const path =
    template !== null && continuationToken !== null && PATH_TOKEN.test(continuationToken)
      ? template.replace("{token}", continuationToken)
      : endpoint.path;
  const url = new URL(path, `https://${endpoint.host}`);
  // A `cursor` endpoint's continuation-token key is part of the closed set
  // too — it is DECLARED on the descriptor, not supplied by a caller, so the
  // allowlist stays closed while the adapter stays provider-agnostic.
  const cursorKey =
    endpoint.pagination === "cursor" ? (endpoint.cursor?.queryKey ?? null) : null;
  for (const [key, value] of Object.entries(query)) {
    if (!ALLOWED_QUERY_KEYS.has(key) && key !== cursorKey) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * The request headers for one endpoint: the Accept type plus, for a
 * key-requiring endpoint that has its key, the credential in the header shape
 * the descriptor declares. `api-key` is the default so every existing
 * endpoint is byte-identical; `bearer` is `Authorization: Bearer <secret>`.
 * The secret never goes anywhere else — not the URL, not `requestRef`, not a
 * log line. Exported for the guard that pins the two shapes.
 */
export function buildVacancyRequestHeaders(
  endpoint: Pick<VacancyChannelEndpointV1, "requiresApiKey" | "authScheme">,
  accept: string,
  apiKey: string | null | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept };
  if (!endpoint.requiresApiKey || !apiKey) return headers;
  if ((endpoint.authScheme ?? "api-key") === "bearer") {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers["api-key"] = apiKey;
  }
  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Request spacing for a host whose descriptor declares `minRequestSpacingMs`.
 * Process-wide per host: slots are RESERVED synchronously, so concurrent
 * workers queue behind one another instead of bursting. Tests replace
 * `vacancyPacing.sleep` so they do not wait in real time.
 */
export const vacancyPacing = { sleep };
const nextRequestSlotByHost = new Map<string, number>();
async function paceRequest(host: string, spacingMs: number | undefined): Promise<void> {
  if (typeof spacingMs !== "number" || !(spacingMs > 0)) return;
  const now = Date.now();
  const slot = Math.max(now, nextRequestSlotByHost.get(host) ?? 0);
  nextRequestSlotByHost.set(host, slot + spacingMs);
  if (slot > now) await vacancyPacing.sleep(slot - now);
}

/** Largest single ad accepted from a two-level feed's detail endpoint. */
const MAX_DETAIL_BYTES = 1024 * 1024;

/**
 * One detail request of a two-level feed, under the provider's own retry,
 * timeout and byte bounds. 404/410 report `gone` (the ad no longer exists);
 * any other 4xx is deterministic and reported as a failure without retry.
 */
async function fetchDetailJson(
  url: string,
  headers: Readonly<Record<string, string>>,
  bounds: ReturnType<typeof resolveProviderBounds>,
  pace: () => Promise<void>,
  onRequest: () => void,
  onRetry?: () => void,
): Promise<DetailFetchResult> {
  const attempts = bounds.maxRetries + 1;
  let detail = "no_attempt";
  let elapsedMs = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      onRetry?.();
      await sleep(bounds.retryBackoffMs * attempt);
    }
    await pace();
    onRequest();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), bounds.requestTimeoutMs);
    const attemptStart = Date.now();
    try {
      const res = await fetch(url, { method: "GET", headers, signal: controller.signal, redirect: "error" });
      if (res.status === 404 || res.status === 410) return { ok: false, gone: true, detail: String(res.status), elapsedMs: elapsedMs + (Date.now() - attemptStart) };
      if (!res.ok) {
        detail = `http_${res.status}`;
        if (res.status >= 400 && res.status < 500) return { ok: false, gone: false, detail, elapsedMs: elapsedMs + (Date.now() - attemptStart) };
        continue;
      }
      if (!/json/i.test(res.headers.get("content-type") ?? "")) return { ok: false, gone: false, detail: "content_type_invalid", elapsedMs: elapsedMs + (Date.now() - attemptStart) };
      const raw = await res.arrayBuffer();
      const total = elapsedMs + (Date.now() - attemptStart);
      if (raw.byteLength > MAX_DETAIL_BYTES) return { ok: false, gone: false, detail: "detail_too_large", elapsedMs: total };
      try {
        return { ok: true, body: JSON.parse(Buffer.from(raw).toString("utf8")), elapsedMs: total };
      } catch {
        return { ok: false, gone: false, detail: "invalid_json", elapsedMs: total };
      }
    } catch (err) {
      detail = err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message)) ? "timeout" : "network_error";
    } finally {
      clearTimeout(timer);
      elapsedMs += Date.now() - attemptStart;
    }
  }
  return { ok: false, gone: false, detail, elapsedMs };
}

/**
 * Fetch one page from one provider channel with every bound enforced. The
 * kill switch is asserted before the first attempt.
 */
export async function fetchVacancyPage(
  req: VacancyFetchRequestV1,
): Promise<VacancyFetchResult> {
  const probe: { listingElapsedMs: number | null; detail: DetailFanOutDiagnostics | null } = {
    listingElapsedMs: null,
    detail: null,
  };
  const result = await fetchVacancyPageInner(req, probe);
  return { ...result, diagnostics: { listingElapsedMs: probe.listingElapsedMs, detail: probe.detail } };
}

async function fetchVacancyPageInner(
  req: VacancyFetchRequestV1,
  probe: { listingElapsedMs: number | null; detail: DetailFanOutDiagnostics | null },
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

  const requestUrl = buildVacancyRequestUrl(endpoint, req.query, req.continuationToken ?? null);
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

  const headers = buildVacancyRequestHeaders(
    endpoint,
    "application/json",
    req.apiKey,
  );
  // A cold walk on a feed whose head is years old starts at a time instead.
  const coldStart = endpoint.pagination === "cursor" ? (endpoint.cursor?.coldStart ?? null) : null;
  if (coldStart !== null && (req.continuationToken ?? null) === null && req.coldStartAtIso) {
    const at = Date.parse(req.coldStartAtIso);
    if (Number.isFinite(at)) {
      headers["If-Modified-Since"] = new Date(at - coldStart.ifModifiedSinceLookbackSeconds * 1000).toUTCString();
    }
  }

  const spacingMs = endpoint.detailFanOut?.minRequestSpacingMs;
  // A slow publisher may declare a longer PER-REQUEST wait for its own
  // endpoint (never the shared bound, so no other provider is affected).
  const requestTimeoutMs = endpoint.detailFanOut?.requestTimeoutMs ?? bounds.requestTimeoutMs;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      req.onRetry?.();
      await sleep(bounds.retryBackoffMs * attempt);
    }
    await paceRequest(endpoint.host, spacingMs);

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      requestTimeoutMs,
    );
    const listingStart = Date.now();
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
      probe.listingElapsedMs = Date.now() - listingStart;
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
        // A 200 JSON response that does not parse is, in practice, a body cut
        // short by a slow publisher (Sweden, 2026-10-09: a 29.8 s listing, then
        // invalid_json, about once a day, every time healed by the next run).
        // The GET is read-only, so it is retried within the shared bound
        // (maxRetries) like a timeout; a persistent failure still ends as
        // invalid_json once the attempts are spent.
        lastError = { errorCode: "invalid_json", detail: "unparseable_body" };
        continue;
      }

      // A TWO-LEVEL feed (NAV): resolve the page's entries into full ads before
      // the pure parser sees it. Any detail failure fails the WHOLE page, so
      // the cursor can never move past an ad that was not read.
      if (endpoint.detailFanOut) {
        let detailRequestsSpent = 0;
        // INVARIANT: an in-page resume position is honoured ONLY on a CLOSED
        // page (one that names a successor). The open head page can still grow,
        // so a stored position on it is ignored and the page is read from its
        // start: a re-read is safe, a skip is not.
        const nextPath = endpoint.cursor?.nextTokenPath ?? null;
        const successor =
          nextPath !== null ? readContinuationToken(body, nextPath) : null;
        const pageClosed =
          successor !== null && successor !== (req.continuationToken ?? null);
        const expanded = await expandDetailFanOut({
          endpoint,
          body,
          detailBudget: req.detailBudget,
          skipEntries: pageClosed ? req.skipEntries : 0,
          ...(endpoint.detailFanOut.sessionDeadlineMs !== undefined
            ? { deadlineAtMs: Date.now() + endpoint.detailFanOut.sessionDeadlineMs }
            : {}),
          fetchDetail: (url) =>
            fetchDetailJson(
              url,
              headers,
              { ...bounds, requestTimeoutMs },
              () => paceRequest(endpoint.host, spacingMs),
              () => {
                detailRequestsSpent += 1;
              },
              req.onRetry,
            ),
        });
        probe.detail = expanded.diagnostics;
        if (!expanded.ok) {
          return { ok: false, requestRef, errorCode: "detail_fetch_failed", detail: expanded.detail };
        }
        return {
          ok: true,
          requestRef,
          httpStatus: res.status,
          responseSha256,
          byteLength,
          body: expanded.body,
          fanOut: {
            pageClosed,
            consumedEntries: expanded.consumedEntries,
            pageComplete: expanded.pageComplete,
            // Live entries resolved (fetched, or 404/410 -> withdrawal): what the
            // session budget pays for.
            detailFetched: expanded.stats.detailFetched + expanded.stats.goneAsWithdrawn,
            detailRequestsSpent,
          },
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
      probe.listingElapsedMs = Date.now() - listingStart;
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
  const headers = buildVacancyRequestHeaders(
    endpoint,
    "application/jsonl",
    req.apiKey,
  );

  const maxAttempts = bounds.maxRetries + 1;
  let lastError: { errorCode: VacancyFetchErrorCode; detail: string } = {
    errorCode: "network_error",
    detail: "no_attempt",
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      req.onRetry?.();
      await sleep(bounds.retryBackoffMs * attempt);
    }

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
