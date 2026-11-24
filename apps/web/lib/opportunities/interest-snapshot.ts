/**
 * Worker express-interest — PURE pieces (Worker Express Interest slice,
 * 2026-07-04). No DB, no network, no side effects. The server flows live in
 * ./interest.ts; keeping the testable logic here mirrors the
 * scouting/scout-safe-view split.
 */

import type { MatchResultV1 } from "@/lib/market/match-v1";
import { CV_TEMPLATES, DEFAULT_CV_TEMPLATE } from "@/lib/cv-export/templates";

/** Interest lifecycle. The WORKER may set interested/withdrawn on their own
 *  row; reviewed/contacted are company-side acknowledgements (future slice —
 *  the check constraint already allows them, the worker action layer never
 *  writes them). */
export const INTEREST_STATUSES = [
  "interested",
  "withdrawn",
  "reviewed",
  "contacted",
] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export const WORKER_WRITABLE_INTEREST_STATUSES: readonly InterestStatus[] = [
  "interested",
  "withdrawn",
];

export function isWorkerWritableInterestStatus(s: string): s is InterestStatus {
  return (WORKER_WRITABLE_INTEREST_STATUSES as readonly string[]).includes(s);
}

/** Company acknowledgement set (PR7) — enforced again inside the gated RPC.
 *  The company can NEVER set 'interested' (the worker's own act) or
 *  'withdrawn' (the worker's withdrawal is immutable to the company). */
export const COMPANY_ACK_STATUSES: readonly InterestStatus[] = [
  "reviewed",
  "contacted",
];

export function isCompanyAckStatus(s: string): s is InterestStatus {
  return (COMPANY_ACK_STATUSES as readonly string[]).includes(s);
}

/** Max worker note length (mirrors the DB CHECK). Internal-only text. */
export const INTEREST_NOTE_MAX = 500;

export function cleanInterestNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, INTEREST_NOTE_MAX);
}

/**
 * The §19-shaped canonical match basis stored on the interest row: what the
 * worker saw at click time. SLUGS ONLY — never display names; the reader
 * localizes. Never a bare score: the band always travels with its basis.
 */
export interface InterestMatchSnapshot {
  readonly status_band: MatchResultV1["status"];
  readonly matched_skills: readonly string[];
  readonly missing_skills: readonly string[];
  readonly evidence_basis: {
    readonly matched_total: number;
    readonly need_total: number;
    readonly manager_confirmed: number;
    readonly journal_supported: number;
    readonly self_declared: number;
  };
  readonly need_source: string | null;
}

export function buildMatchSnapshot(
  match: MatchResultV1,
  needSource: string | null,
): InterestMatchSnapshot {
  return {
    status_band: match.status,
    matched_skills: match.skillFit ? [...match.skillFit.matchedUris] : [],
    missing_skills: match.skillFit ? [...match.skillFit.missingUris] : [],
    evidence_basis: {
      matched_total: match.skillFit?.matchedTotal ?? 0,
      need_total: match.skillFit?.needTotal ?? 0,
      manager_confirmed: match.evidence.matchedManagerConfirmed,
      journal_supported: match.evidence.matchedJournalSupported,
      self_declared: match.evidence.matchedSelfDeclared,
    },
    need_source: needSource,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Snapshot CONTEXT (Canonical Ideas Integration v1, extension A).
 *
 * What the worker SAW at click time, stashed into the EXISTING match_snapshot
 * jsonb so the worker's own "Mano susidomėjimai" list can honestly name the
 * demand even after it closes and disappears from the board. WHITELISTED
 * worker-visible fields only — everything below already reaches the worker
 * through the gated board RPC, so nothing new is disclosed. No schema change.
 * ──────────────────────────────────────────────────────────────────────── */

export interface InterestSnapshotContext {
  /** The demand's role/work-type slug the board showed. */
  readonly role_text: string | null;
  /** ISO-2 country code the board showed. */
  readonly country: string | null;
  /** The board's location label (city), when present. */
  readonly location_label: string | null;
  /** Approved-route company name the board showed (already worker-visible). */
  readonly company_name: string | null;
}

const CONTEXT_FIELD_MAX = 200;

function cleanContextField(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, CONTEXT_FIELD_MAX);
}

/** Build the context from a board row's ALREADY worker-visible fields. */
export function buildSnapshotContext(input: {
  roleText: string | null;
  country: string | null;
  locationLabel: string | null;
  companyName: string | null;
}): InterestSnapshotContext {
  return {
    role_text: cleanContextField(input.roleText),
    country: cleanContextField(input.country),
    location_label: cleanContextField(input.locationLabel),
    company_name: cleanContextField(input.companyName),
  };
}

/** Tolerant reader — old rows have no context; every field degrades to null
 *  (the UI then shows its honest "role not stated" fallback). */
export function parseSnapshotContext(snapshot: unknown): InterestSnapshotContext {
  const empty: InterestSnapshotContext = {
    role_text: null,
    country: null,
    location_label: null,
    company_name: null,
  };
  if (typeof snapshot !== "object" || snapshot === null) return empty;
  const ctx = (snapshot as Record<string, unknown>).context;
  if (typeof ctx !== "object" || ctx === null) return empty;
  const c = ctx as Record<string, unknown>;
  return {
    role_text: cleanContextField(c.role_text),
    country: cleanContextField(c.country),
    location_label: cleanContextField(c.location_label),
    company_name: cleanContextField(c.company_name),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Tailored-CV stash (Canonical Ideas Integration v1, extension C).
 *
 * At interest time the worker's application package is pinned by REFERENCE
 * only: which CV template + which need id + when. The tailored CV itself
 * stays the read-time deterministic /cv?need=<id> render — nothing is copied,
 * nothing is invented, no schema change (lives inside match_snapshot jsonb).
 * ──────────────────────────────────────────────────────────────────────── */

export interface InterestCvStash {
  /** A registered CV template id (lib/cv-export/templates.ts registry). */
  readonly template: string;
  /** The demand (customer_request) id the CV link tailors against. */
  readonly need_id: string;
  /** ISO timestamp of the express-interest click. */
  readonly tailored_at: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRegisteredCvTemplate(id: unknown): id is string {
  return typeof id === "string" && CV_TEMPLATES.some((t) => t.id === id);
}

/** Build the stash. An unknown template honestly falls back to the default
 *  registry entry — never an unregistered id in stored data. */
export function buildInterestCvStash(input: {
  cvTemplate?: string | null;
  needId: string;
  nowIso: string;
}): InterestCvStash {
  return {
    template: isRegisteredCvTemplate(input.cvTemplate)
      ? input.cvTemplate
      : DEFAULT_CV_TEMPLATE,
    need_id: input.needId,
    tailored_at: input.nowIso,
  };
}

/** Tolerant, VALIDATING reader: any shape violation → null (the UI simply
 *  falls back to the default template — never a broken link, never a crash). */
export function parseInterestCvStash(snapshot: unknown): InterestCvStash | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const cv = (snapshot as Record<string, unknown>).cv;
  if (typeof cv !== "object" || cv === null) return null;
  const c = cv as Record<string, unknown>;
  if (!isRegisteredCvTemplate(c.template)) return null;
  if (typeof c.need_id !== "string" || !UUID_RE.test(c.need_id)) return null;
  if (typeof c.tailored_at !== "string" || Number.isNaN(Date.parse(c.tailored_at))) {
    return null;
  }
  return {
    template: c.template,
    need_id: c.need_id,
    tailored_at: c.tailored_at,
  };
}
