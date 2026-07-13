/**
 * CRM / demand pipeline — pure presentation model (control room PR F,
 * gap map §5 "read consolidation").
 *
 * ONE operator queue over the demand sources that ALREADY exist —
 * `customer_requests` (operator-review states), `company_need_public_intakes`
 * (anonymous public funnel), `leads` (dormant /api/leads funnel) and
 * `waitlist` signups. This module is pure data mapping: no supabase client,
 * no server import, no i18n import, no side effect of any kind.
 *
 * Doctrine (same as lib/sales/lead-intake-model.ts, which this EXTENDS by
 * composition — it replaces nothing):
 *
 *  - The presentation stage-set below MAPS the three stored lifecycles into
 *    one read view. It NEVER overwrites, renames or hides a stored status —
 *    every pipeline item carries its stored status verbatim, because the
 *    stored value is the underlying truth and the stage is only a lens.
 *  - READ-ONLY: nothing in this layer (or its consumers) mutates a status,
 *    contacts anyone, or claims a CRM outcome it cannot prove.
 *  - Real counts only — counts are computed from the actually fetched rows,
 *    never invented.
 *  - Duplicate detection is display-only ("possible duplicate" chip): a pure
 *    normalized comparison of company names / emails. No merge, no write.
 */

import type { CompanyNeedIntakeStatus } from "@/lib/admin/company-need-intake-shared";
import type { IntakeRequestStatus } from "@/lib/sales/lead-intake-model";

// ── Presentation stage-set (closed) ─────────────────────────────────────────

/**
 * The ONE presentation stage-set. Closed and ordered: entry → engagement →
 * qualification → follow-up → active engagement → closed.
 */
export const PIPELINE_STAGES = [
  "new",
  "contacted",
  "qualifying",
  "follow_up",
  "active",
  "closed",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_SOURCE_TYPES = [
  "customer_request",
  "public_intake",
  "lead",
  "waitlist",
] as const;
export type PipelineSourceType = (typeof PIPELINE_SOURCE_TYPES)[number];

// ── Stored lifecycles (the underlying truth, documented per source) ─────────

/** customer_requests.status — full stored enum (migration 0028). */
export const CUSTOMER_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "needs_followup",
  "approved",
  "closed",
] as const;
export type CustomerRequestStatus = (typeof CUSTOMER_REQUEST_STATUSES)[number];

/** leads.status — full stored enum (migration 0001). */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * customer_requests.status → presentation stage. TOTAL over the stored enum.
 * `draft` maps to `null` = deliberately EXCLUDED from the operator queue
 * (a draft is the author's private work-in-progress, not operator demand —
 * the seed read layer never fetches drafts either).
 */
export const CUSTOMER_REQUEST_STAGE_MAP: Readonly<
  Record<CustomerRequestStatus, PipelineStage | null>
> = {
  draft: null,
  submitted: "new",
  in_review: "qualifying",
  needs_followup: "follow_up",
  approved: "active",
  closed: "closed",
};

/**
 * company_need_public_intakes.status → presentation stage. TOTAL over the
 * stored enum. `qualified` maps to `qualifying` (NOT `active`): the stored
 * value records that the operator judged the intake worth pursuing — no
 * engagement or agreement exists yet, so `active` would overclaim. The
 * stored value stays visible verbatim next to the stage.
 */
export const PUBLIC_INTAKE_STAGE_MAP: Readonly<
  Record<CompanyNeedIntakeStatus, PipelineStage>
> = {
  new: "new",
  contacted: "contacted",
  qualified: "qualifying",
  // Claimed by the company's own account into a real draft demand
  // (canonical-journey P3) — the demand now lives in customer_requests, so
  // for the operator pipeline this intake is a successfully closed item.
  converted: "closed",
  rejected: "closed",
};

/**
 * leads.status → presentation stage. TOTAL over the stored enum. `qualified`
 * maps to `qualifying` for the same honesty reason as public intakes; `won`
 * is a recorded outcome and maps to `active`.
 */
export const LEAD_STAGE_MAP: Readonly<Record<LeadStatus, PipelineStage>> = {
  new: "new",
  contacted: "contacted",
  qualified: "qualifying",
  won: "active",
  lost: "closed",
};

/**
 * A stored lead status outside the documented enum (or NULL — the column is
 * nullable) has never been operator-actioned, so it sits at the entry stage.
 * The verbatim stored value (or its absence) stays visible on the row.
 */
export function leadStageFor(storedStatus: string | null): PipelineStage {
  return (LEAD_STAGE_MAP as Record<string, PipelineStage | undefined>)[
    storedStatus ?? ""
  ] ?? "new";
}

// ── Pipeline item ────────────────────────────────────────────────────────────

/**
 * Where each source's rows are ACTUALLY worked today. The pipeline links to
 * these existing surfaces — it adds no detail view and no status mutation of
 * its own (status changes continue on these surfaces).
 */
export const PIPELINE_SOURCE_HREFS: Readonly<
  Record<PipelineSourceType, string>
> = {
  // customer_requests / leads / waitlist rows are reviewed on the existing
  // admin control room (sales-intake panel, §8.14).
  customer_request: "/dashboard/admin",
  lead: "/dashboard/admin",
  waitlist: "/dashboard/admin",
  // public intakes have their own existing owner queue (PR #681).
  public_intake: "/dashboard/admin/company-need-intakes",
};

export type PipelineItem = {
  readonly id: string;
  readonly sourceType: PipelineSourceType;
  /** i18n key of the source badge (crmPipeline.sources.*). */
  readonly sourceLabelKey: string;
  /**
   * The stored lifecycle value VERBATIM (recorded data, never hidden).
   * `null` only for waitlist rows, which store no status at all.
   */
  readonly storedStatus: string | null;
  /** Presentation stage — a read lens over the stored status, never a claim. */
  readonly stage: PipelineStage;
  /** Title-ish display line (request title / company name / email). */
  readonly title: string;
  readonly country: string | null;
  readonly createdAt: string;
  /** Link to the REAL existing surface where this row is worked. */
  readonly href: string;
  /** Dedup inputs — compared display-only, never merged. */
  readonly companyName: string | null;
  readonly email: string | null;
};

// Structural input rows — shaped exactly like the seed libs' row types
// (lib/sales/lead-intake-model.ts, lib/admin/company-need-intakes.ts) so the
// server composition can pass their rows straight through. Kept structural so
// this module never imports a `server-only` file.

export type CustomerRequestInput = {
  readonly id: string;
  readonly title: string;
  readonly status: IntakeRequestStatus;
  readonly country: string | null;
  readonly createdAt: string;
};

export type PublicIntakeInput = {
  readonly id: string;
  readonly status: CompanyNeedIntakeStatus;
  readonly companyName: string | null;
  readonly contactEmail: string | null;
  readonly country: string | null;
  readonly createdAt: string;
};

export type LeadInput = {
  readonly id: string;
  readonly status: string | null;
  readonly email: string | null;
  readonly fullName: string | null;
  readonly companyName: string | null;
  readonly country: string | null;
  readonly createdAt: string;
};

export type WaitlistInput = {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
};

function sourceLabelKey(sourceType: PipelineSourceType): string {
  return `crmPipeline.sources.${sourceType}`;
}

/**
 * customer_requests row → pipeline item, or `null` when the stored status is
 * stage-excluded (draft) or outside the documented enum (never shown under a
 * guessed stage).
 */
export function customerRequestToItem(
  r: CustomerRequestInput,
): PipelineItem | null {
  const stage =
    r.status in CUSTOMER_REQUEST_STAGE_MAP
      ? CUSTOMER_REQUEST_STAGE_MAP[r.status as CustomerRequestStatus]
      : null;
  if (stage === null) return null;
  return {
    id: r.id,
    sourceType: "customer_request",
    sourceLabelKey: sourceLabelKey("customer_request"),
    storedStatus: r.status,
    stage,
    title: r.title,
    country: r.country,
    createdAt: r.createdAt,
    href: PIPELINE_SOURCE_HREFS.customer_request,
    companyName: null,
    email: null,
  };
}

export function publicIntakeToItem(r: PublicIntakeInput): PipelineItem {
  return {
    id: r.id,
    sourceType: "public_intake",
    sourceLabelKey: sourceLabelKey("public_intake"),
    storedStatus: r.status,
    stage: PUBLIC_INTAKE_STAGE_MAP[r.status],
    title: r.companyName ?? "",
    country: r.country,
    createdAt: r.createdAt,
    href: PIPELINE_SOURCE_HREFS.public_intake,
    companyName: r.companyName,
    email: r.contactEmail,
  };
}

export function leadToItem(r: LeadInput): PipelineItem {
  return {
    id: r.id,
    sourceType: "lead",
    sourceLabelKey: sourceLabelKey("lead"),
    storedStatus: r.status,
    stage: leadStageFor(r.status),
    title: r.email ?? r.fullName ?? r.companyName ?? "",
    country: r.country,
    createdAt: r.createdAt,
    href: PIPELINE_SOURCE_HREFS.lead,
    companyName: r.companyName,
    email: r.email,
  };
}

/** Waitlist rows store NO status: an untouched signup sits at `new`, and its
 *  storedStatus is honestly `null` (rendered as an absent value, never a
 *  fabricated lifecycle word). */
export function waitlistToItem(r: WaitlistInput): PipelineItem {
  return {
    id: r.id,
    sourceType: "waitlist",
    sourceLabelKey: sourceLabelKey("waitlist"),
    storedStatus: null,
    stage: "new",
    title: r.email,
    country: null,
    createdAt: r.createdAt,
    href: PIPELINE_SOURCE_HREFS.waitlist,
    companyName: null,
    email: r.email,
  };
}

// ── Counts (real counts over the actually fetched rows) ─────────────────────

export function countItemsByStage(
  items: readonly PipelineItem[],
): Readonly<Record<PipelineStage, number>> {
  const counts = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, 0]),
  ) as Record<PipelineStage, number>;
  for (const item of items) counts[item.stage] += 1;
  return counts;
}

export function countItemsBySource(
  items: readonly PipelineItem[],
): Readonly<Record<PipelineSourceType, number>> {
  const counts = Object.fromEntries(
    PIPELINE_SOURCE_TYPES.map((s) => [s, 0]),
  ) as Record<PipelineSourceType, number>;
  for (const item of items) counts[item.sourceType] += 1;
  return counts;
}

// ── Filtering (server-side, over the already-fetched bounded rows) ──────────

export type PipelineFilter = {
  readonly stage: PipelineStage | null;
  readonly source: PipelineSourceType | null;
  /** Free-text filter over title / company name / stored status. */
  readonly q: string;
};

export function isPipelineStage(v: unknown): v is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(v as string);
}

export function isPipelineSourceType(v: unknown): v is PipelineSourceType {
  return (PIPELINE_SOURCE_TYPES as readonly string[]).includes(v as string);
}

/** Lowercase + strip diacritics — the command-finder normalization, local so
 *  this module stays dependency-free and pure. */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function filterPipelineItems(
  items: readonly PipelineItem[],
  filter: PipelineFilter,
): readonly PipelineItem[] {
  const q = normalizeText(filter.q);
  return items.filter((item) => {
    if (filter.stage !== null && item.stage !== filter.stage) return false;
    if (filter.source !== null && item.sourceType !== filter.source) {
      return false;
    }
    if (q.length > 0) {
      const haystack = normalizeText(
        [item.title, item.companyName ?? "", item.storedStatus ?? ""].join(" "),
      );
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Merged queue ordering: newest first (ISO timestamps compare lexically). */
export function sortPipelineItems(
  items: readonly PipelineItem[],
): readonly PipelineItem[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Duplicate detection (read-only, display-only) ───────────────────────────

/**
 * Pure identity normalization for the "possible duplicate" chip: lowercase,
 * strip diacritics, strip punctuation, collapse whitespace, trim. Returns ""
 * for values with no comparable content (never treated as a match key).
 */
export function normalizeDedupKey(value: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ids of items that share a normalized company name OR a normalized email
 * with at least one OTHER item. Display-only signal — no merge action exists
 * anywhere in this layer.
 */
export function findPossibleDuplicateIds(
  items: readonly PipelineItem[],
): ReadonlySet<string> {
  const byKey = new Map<string, string[]>();
  for (const item of items) {
    const companyKey = normalizeDedupKey(item.companyName);
    const emailKey = normalizeDedupKey(item.email);
    if (companyKey) {
      byKey.set(`c:${companyKey}`, [
        ...(byKey.get(`c:${companyKey}`) ?? []),
        item.id,
      ]);
    }
    if (emailKey) {
      byKey.set(`e:${emailKey}`, [
        ...(byKey.get(`e:${emailKey}`) ?? []),
        item.id,
      ]);
    }
  }
  const duplicates = new Set<string>();
  for (const ids of byKey.values()) {
    if (new Set(ids).size > 1) for (const id of ids) duplicates.add(id);
  }
  return duplicates;
}
