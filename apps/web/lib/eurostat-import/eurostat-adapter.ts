import "server-only";

/**
 * OFFICIAL EUROSTAT ADAPTER — the server-only HTTP half of the integration.
 *
 * This is the ONLY place a Eurostat network request is ever made. It lives
 * OUTSIDE lib/intelligence (the pure, fetch-free layer) by design. It:
 *
 *   - accepts ONLY allowlisted dataset codes (EUROSTAT_DATASETS);
 *   - builds a deterministic official request from the pinned dimensions +
 *     a single geography + a bounded lastTimePeriod — no caller-provided
 *     endpoint, no arbitrary query parameter, no generic proxy;
 *   - talks only to the canonical Eurostat dissemination host over HTTPS;
 *   - sets an explicit timeout, bounded retries with backoff, conservative
 *     spacing, a byte cap and a content-type check;
 *   - computes the raw response sha256 locally and hands the parsed body +
 *     request identity to the PURE parser (eurostat-jsonstat.ts).
 *
 * The kill switch is checked before every request. Secrets are never
 * required (the API is unauthenticated) and never logged.
 */
import { createHash } from "node:crypto";
import {
  EUROSTAT_IMPORT_BOUNDS,
  getEurostatDataset,
  isAllowedEurostatGeo,
  type EurostatDatasetV1,
} from "@/lib/intelligence/eurostat-source-v1";
import { assertEurostatOperational } from "./eurostat-kill-switch";

/** Canonical official Eurostat dissemination API host (HTTPS only). This is
 *  the single hard-coded origin; nothing else is ever contacted. */
const EUROSTAT_API_ORIGIN = "https://ec.europa.eu";
const EUROSTAT_API_BASE_PATH = "/eurostat/api/dissemination";

export interface EurostatFetchRequestV1 {
  readonly datasetCode: string;
  /** One allowlisted Eurostat geo code per request (aggregate or country). */
  readonly geo: string;
  /** Latest N periods — clamped to EUROSTAT_IMPORT_BOUNDS.maxPeriodsPerSeries. */
  readonly lastTimePeriod: number;
}

export type EurostatFetchErrorCode =
  | "dataset_not_allowlisted"
  | "geo_not_allowlisted"
  | "invalid_last_period"
  | "http_error"
  | "content_type_invalid"
  | "response_too_large"
  | "invalid_json"
  | "network_error"
  | "timeout";

export type EurostatFetchResult =
  | {
      readonly ok: true;
      readonly datasetCode: string;
      readonly requestUrl: string;
      readonly httpStatus: number;
      readonly responseSha256: string;
      readonly byteLength: number;
      readonly body: unknown;
    }
  | {
      readonly ok: false;
      readonly datasetCode: string;
      readonly requestUrl: string;
      readonly errorCode: EurostatFetchErrorCode;
      /** Secret-free detail (status code, byte count) — never a token. */
      readonly detail: string;
    };

/**
 * Build the exact official request URL for one dataset + one geography.
 * Deterministic and side-effect free; every pinned dimension is appended
 * from the dataset contract, never from the caller. Exported for the audit
 * trail and unit tests.
 */
export function buildEurostatRequestUrl(
  dataset: EurostatDatasetV1,
  geo: string,
  lastTimePeriod: number,
): string {
  const url = new URL(
    `${EUROSTAT_API_BASE_PATH}/${dataset.apiPathTemplate}`,
    EUROSTAT_API_ORIGIN,
  );
  url.searchParams.set("format", "JSON");
  url.searchParams.set("lang", "EN");
  // Pinned non-geo/time dimensions — the fixed comparison identity.
  for (const [dim, code] of Object.entries(dataset.pinnedDimensions)) {
    url.searchParams.set(dim, code);
  }
  url.searchParams.set("geo", geo);
  url.searchParams.set("lastTimePeriod", String(lastTimePeriod));
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one dataset+geo from the official API with bounds enforced. Retries
 * only transient failures (network/timeout/5xx), never a 4xx. The kill
 * switch is asserted before the first attempt.
 */
export async function fetchEurostatDataset(
  req: EurostatFetchRequestV1,
): Promise<EurostatFetchResult> {
  assertEurostatOperational();

  const dataset = getEurostatDataset(req.datasetCode);
  if (dataset === null) {
    return {
      ok: false,
      datasetCode: req.datasetCode,
      requestUrl: "",
      errorCode: "dataset_not_allowlisted",
      detail: req.datasetCode,
    };
  }
  if (!isAllowedEurostatGeo(req.geo)) {
    return {
      ok: false,
      datasetCode: req.datasetCode,
      requestUrl: "",
      errorCode: "geo_not_allowlisted",
      detail: req.geo,
    };
  }
  const lastN = Math.min(
    Math.max(1, Math.floor(req.lastTimePeriod)),
    EUROSTAT_IMPORT_BOUNDS.maxPeriodsPerSeries,
  );
  if (!Number.isFinite(lastN) || lastN < 1) {
    return {
      ok: false,
      datasetCode: req.datasetCode,
      requestUrl: "",
      errorCode: "invalid_last_period",
      detail: String(req.lastTimePeriod),
    };
  }

  const requestUrl = buildEurostatRequestUrl(dataset, req.geo, lastN);
  const maxAttempts = EUROSTAT_IMPORT_BOUNDS.maxRetries + 1;
  let lastError: {
    errorCode: EurostatFetchErrorCode;
    detail: string;
  } = { errorCode: "network_error", detail: "no_attempt" };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(EUROSTAT_IMPORT_BOUNDS.retryBackoffMs * attempt);
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      EUROSTAT_IMPORT_BOUNDS.requestTimeoutMs,
    );
    try {
      const res = await fetch(requestUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = { errorCode: "http_error", detail: String(res.status) };
        // 4xx are deterministic — do not retry.
        if (res.status >= 400 && res.status < 500) {
          return {
            ok: false,
            datasetCode: dataset.code,
            requestUrl,
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
          datasetCode: dataset.code,
          requestUrl,
          errorCode: "content_type_invalid",
          detail: contentType.slice(0, 80),
        };
      }

      const raw = await res.arrayBuffer();
      const byteLength = raw.byteLength;
      if (byteLength > EUROSTAT_IMPORT_BOUNDS.maxResponseBytes) {
        return {
          ok: false,
          datasetCode: dataset.code,
          requestUrl,
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
          datasetCode: dataset.code,
          requestUrl,
          errorCode: "invalid_json",
          detail: "unparseable_body",
        };
      }

      return {
        ok: true,
        datasetCode: dataset.code,
        requestUrl,
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
    datasetCode: dataset.code,
    requestUrl,
    errorCode: lastError.errorCode,
    detail: lastError.detail,
  };
}
