/**
 * Worker external profiles — pure model (Labour Market OS P6).
 *
 * ONE canonical place where a worker links profiles they hold elsewhere
 * (LinkedIn, GitHub, Behance, a portfolio site, a certification registry).
 * Consent-first doctrine:
 *   - default visibility is 'private'; nothing is shown to anyone but the
 *     worker (and admin) in v1 — the employer read path does NOT exist yet
 *     (the visibility value is a saved preference, honestly labelled).
 *   - an external profile is NEVER a second truth model (Living CV canon,
 *     docs/product/living-cv-contract-v1.md): canonical skill stores stay
 *     profile_skill_claims + worker_skills only. v1 creates no claims at all
 *     from external profiles.
 *   - NO automatic import: the platform never fetches an external site.
 *     The only future import path is a worker-uploaded exported file
 *     (reviewed by the worker before anything is kept).
 *   - disconnect never hard-deletes — provenance is preserved
 *     (disconnected_at is stamped, the row stays).
 *
 * Backed by DRAFT migration 20260713210000_multi_source_talent_v1
 * (human-gated, NOT applied). This module is pure (no server imports) so
 * validation is unit-testable.
 */

import {
  buildRoutingAuditRecord,
  resolveTaskRoute,
  type AiRoutingAuditRecord,
} from "@/lib/ai/runtime/task-routing";

// Missing-schema classification is shared platform-wide — reuse the
// canonical helpers instead of re-declaring the code sets.
export {
  isMissingColumnCode,
  isMissingRpcCode,
  isMissingTableCode,
} from "@/lib/agency/clients-model";
import { isMissingRpcCode, isMissingTableCode } from "@/lib/agency/clients-model";

export const EXTERNAL_PROFILE_PLATFORMS = [
  "linkedin",
  "github",
  "behance",
  "portfolio",
  "certification_registry",
  "other",
] as const;
export type ExternalProfilePlatform = (typeof EXTERNAL_PROFILE_PLATFORMS)[number];

export const EXTERNAL_PROFILE_VISIBILITIES = ["private", "employers"] as const;
export type ExternalProfileVisibility =
  (typeof EXTERNAL_PROFILE_VISIBILITIES)[number];

/** The DEFAULT visibility — mirrors the migration column default exactly. */
export const DEFAULT_EXTERNAL_PROFILE_VISIBILITY: ExternalProfileVisibility =
  "private";

export const EXTERNAL_PROFILE_IMPORT_STATUSES = [
  "none",
  "file_imported",
  "pending_review",
] as const;
export type ExternalProfileImportStatus =
  (typeof EXTERNAL_PROFILE_IMPORT_STATUSES)[number];

export interface ExternalProfileEntry {
  readonly id: string;
  readonly platform: ExternalProfilePlatform;
  readonly url: string;
  readonly visibility: ExternalProfileVisibility;
  readonly importStatus: ExternalProfileImportStatus;
  readonly snapshotReviewedAt: string | null;
  readonly connectedAt: string;
}

export function parseExternalProfilePlatform(
  value: string | null | undefined,
): ExternalProfilePlatform | null {
  return (EXTERNAL_PROFILE_PLATFORMS as readonly string[]).includes(value ?? "")
    ? (value as ExternalProfilePlatform)
    : null;
}

export function parseExternalProfileVisibility(
  value: string | null | undefined,
): ExternalProfileVisibility | null {
  return (EXTERNAL_PROFILE_VISIBILITIES as readonly string[]).includes(value ?? "")
    ? (value as ExternalProfileVisibility)
    : null;
}

export function parseExternalProfileImportStatus(
  value: string | null | undefined,
): ExternalProfileImportStatus | null {
  return (EXTERNAL_PROFILE_IMPORT_STATUSES as readonly string[]).includes(
    value ?? "",
  )
    ? (value as ExternalProfileImportStatus)
    : null;
}

export type ExternalProfileUrlValidation =
  | { ok: true; url: string }
  | { ok: false; reason: "empty" | "not-https" | "too-long" | "malformed" };

/**
 * https-only URL validation — mirrors the server-side RPC checks exactly
 * (length 12..500, must start https://) and additionally requires a
 * parseable URL with a real host and NO embedded credentials.
 */
export function validateExternalProfileUrl(
  raw: string | null | undefined,
): ExternalProfileUrlValidation {
  const url = (raw ?? "").trim();
  if (url.length === 0) return { ok: false, reason: "empty" };
  if (!url.startsWith("https://")) return { ok: false, reason: "not-https" };
  if (url.length > 500) return { ok: false, reason: "too-long" };
  if (url.length < 12) return { ok: false, reason: "malformed" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "not-https" };
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, url };
}

/**
 * Display helper: the URL's HOST only (e.g. "github.com") — the list view
 * never has to print the full URL (which may embed a username or slug the
 * worker did not mean to display prominently).
 */
export function maskedUrlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "—";
  }
}

/** Map an RPC/PostgREST error code to the tagged action result codes. */
export function classifyExternalProfilesError(
  code: string | null | undefined,
): "needs_migration" | "invalid" | "no_worker" | "error" {
  if (isMissingRpcCode(code) || isMissingTableCode(code)) return "needs_migration";
  if (code === "22023") return "invalid";
  if (code === "P0002") return "no_worker";
  return "error";
}

/* ------------------------------------------------------------------ */
/* Task-router call site (P4) — deterministic normalization             */
/* ------------------------------------------------------------------ */

export type ExternalProfileSubmission =
  | {
      ok: true;
      platform: ExternalProfilePlatform;
      url: string;
      routing: AiRoutingAuditRecord;
    }
  | { ok: false; routing: AiRoutingAuditRecord };

/**
 * REAL task-router call site for `normalize_external_profile`.
 *
 * The deterministic validation below IS the primary flow and works with no
 * provider (constitution §5). The router is consulted so every submission
 * carries an audit record of the routing decision; because no LLM ran,
 * the outcome honestly reports adapter "none", nothing sent
 * (dataCategoriesSent []), and no fabricated cost/latency/confidence.
 * A future OPTIONAL AI suggestion layer (e.g. platform auto-detection from
 * the URL text) would execute only under this same decision — and its
 * output would be a labelled suggestion, never a silent rewrite of what
 * the worker submitted (constitution §1.2).
 */
export function normalizeExternalProfileSubmission(
  rawPlatform: string | null | undefined,
  rawUrl: string | null | undefined,
): ExternalProfileSubmission {
  const decision = resolveTaskRoute("normalize_external_profile", { attempt: 1 });
  const platform = parseExternalProfilePlatform(rawPlatform ?? "");
  const validated = validateExternalProfileUrl(rawUrl);
  const routing = buildRoutingAuditRecord(decision, {
    providerAdapter: "none",
    schemaValidation: "skipped",
    confidence: null,
    actualCostUsd: null,
    latencyMs: null,
    usage: null,
    // No AI output was produced, so there is nothing for a human to review
    // here; the policy's humanReview applies to LLM-produced normalizations.
    humanReviewState: "not_required",
    dataCategoriesSent: [],
  });
  if (!platform || !validated.ok) return { ok: false, routing };
  return { ok: true, platform, url: validated.url, routing };
}
