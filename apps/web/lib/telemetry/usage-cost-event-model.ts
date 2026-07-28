/**
 * CANONICAL USAGE & COST EVENT MODEL v1 — the contract, and nothing else.
 *
 * Human half: `docs/architecture/usage-cost-event-model-v1.md` (BINDING).
 * Enforced by: `lib/guards/usage-cost-event-model.test.ts` (CI).
 *
 * ── SCOPE BOUNDARY (deliberate, guard-asserted) ────────────────────────────
 * This file is ARCHITECTURE. It contains types, registries and pure shape
 * validation. It contains **no ingestion, no writer, no reader, no route, no
 * database client and no migration** — the guard proves that, so the contract
 * can be agreed before any storage decision is made.
 *
 * ── WHY A NEW MODEL RATHER THAN PR #754 ────────────────────────────────────
 * The closed PR #754 `usage_events` shape cannot carry this platform:
 *   - it attributes to `profile_id` only — no organization, no workspace, no
 *     feature, no session, so per-feature and per-plan margin are impossible;
 *   - it stores `cost_usd` while the entire commercial system, the LMC peg and
 *     every plan are EUR-denominated;
 *   - it splits AI cost (`ai_runs`) from everything else (`usage_events`) —
 *     two sources of truth for one question;
 *   - its 9 categories are a DB CHECK constraint, so a new provider or a new
 *     service is a MIGRATION. This model treats provider/service/resource as
 *     DATA, which is the single most important decision here.
 * What survives from #754 is doctrine, not schema: append-only, bounded
 * metadata, and "never fabricate a cost — null when unknown".
 *
 * Pure data + pure functions. No IO.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Identity and attribution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WORKSPACE IS NOT A TABLE.
 *
 * Verified 2026-07-28: there is no `workspaces` table and no workspace id
 * anywhere in the platform. The canonical workspace (rebuild W4,
 * `ExecWorkspace`) is `{ organizationId: string | null }` resolved server-side
 * from the `engagement_contexts` spine plus the active-organization pointer;
 * `null` means the personal workspace.
 *
 * So `workspace_id` is a DERIVED, STABLE STRING, never a foreign key:
 *   personal      → `personal:<profile_id>`
 *   organisation  → `org:<organization_id>`
 * Inventing a workspaces table to satisfy a telemetry field would have created
 * a second identity spine for the whole product.
 */
export type WorkspaceRef =
  | { readonly kind: "personal"; readonly profileId: string }
  | { readonly kind: "organization"; readonly organizationId: string };

export function workspaceId(ref: WorkspaceRef): string {
  return ref.kind === "personal"
    ? `personal:${ref.profileId}`
    : `org:${ref.organizationId}`;
}

/** Who ultimately pays for the resource this event consumed. */
export type Payer = "worker" | "company" | "agency" | "platform";

/**
 * Attribution — resolved SERVER-SIDE, never accepted from a client.
 * Mirrors the existing `pilot_events` rule: the caller never says who it is.
 */
export interface EventAttribution {
  /** Derived workspace key (see WorkspaceRef). Null only for anonymous. */
  readonly workspaceId: string | null;
  /** `profiles.id`. Null for anonymous/system events. */
  readonly userId: string | null;
  /** `organizations.id`. Null in a personal workspace. */
  readonly organizationId: string | null;
  /** Client session id — bounded, rotating, never a device fingerprint. */
  readonly sessionId: string | null;
  /**
   * The commercial feature this consumption belongs to — the same code space
   * as the canonical catalogue (`lib/commercial/catalogue.ts`). This is what
   * makes per-feature margin possible.
   */
  readonly featureCode: string | null;
  /** The plan in force when the event happened (rate/limit context). */
  readonly planKey: string | null;
  /** Who pays; `platform` marks deliberately subsidised consumption. */
  readonly payer: Payer | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Event classification — DATA, never an enum in a CHECK constraint
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The event kind. This is the ONLY closed vocabulary in the model, because it
 * decides how the row is interpreted, not what produced it.
 */
export const EVENT_TYPES = [
  /** A metered consumption of a resource (an AI call, an OCR page, an email). */
  "usage",
  /** A cost fact arriving from a supplier (an invoice line, a metering export). */
  "cost",
  /** A commercial fact (subscription started, invoice paid, LMC debited). */
  "revenue",
  /** A product action worth measuring that consumes no metered resource. */
  "activity",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Outcome. `partial` exists because a half-finished AI call still costs money. */
export const EVENT_STATUSES = ["success", "error", "partial", "rejected"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/**
 * PROVIDER / SERVICE / RESOURCE ARE FREE-FORM, BOUNDED STRINGS.
 *
 * The registries below are DOCUMENTATION of what is known today, not a
 * constraint. Adding OpenAI, Anthropic, Gemini, Mistral, DeepSeek, a local
 * model or an unknown 2031 supplier must never require a migration — that is
 * the core requirement this model exists to satisfy.
 */
export const KNOWN_AI_PROVIDERS = [
  "anthropic", "openai", "google", "mistral", "deepseek", "local", "other",
] as const;

export const KNOWN_NON_AI_PROVIDERS = [
  "supabase", "vercel", "resend", "twilio", "stripe",
  "mapbox", "google_maps", "ocr_vendor", "search_vendor", "other",
] as const;

/** Service families, for grouping only. Never a stored constraint. */
export const KNOWN_SERVICES = [
  // AI
  "llm_completion", "llm_embedding", "speech_to_text", "text_to_speech", "vision",
  // non-AI
  "ocr", "search", "maps", "cv_import", "file_upload", "storage",
  "email", "sms", "push", "video", "voice", "api", "automation", "background_job",
  "database", "bandwidth",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 3. Usage measures — every field optional, all of them additive
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A sparse measure bag. A new measure (say `frames`) is a new optional key,
 * not a schema change — which is why the storage recommendation in the
 * document is one JSONB column, not 12 numeric columns.
 */
export interface UsageMeasures {
  readonly requestCount?: number;
  readonly durationMs?: number;
  readonly tokensInput?: number;
  readonly tokensOutput?: number;
  readonly characters?: number;
  readonly bytes?: number;
  readonly storageUsedBytes?: number;
  readonly files?: number;
  readonly images?: number;
  readonly pages?: number;
  readonly objects?: number;
}

export const USAGE_MEASURE_KEYS = [
  "requestCount", "durationMs", "tokensInput", "tokensOutput", "characters",
  "bytes", "storageUsedBytes", "files", "images", "pages", "objects",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 4. Cost — EUR minor units, and null is a legitimate answer
// ═══════════════════════════════════════════════════════════════════════════

/** Where a cost number came from. Distinguishing these is the whole point. */
export type BillingSource =
  /** Computed by us from a published price list at event time. */
  | "estimated_from_price_list"
  /** Reported by the supplier for this exact call. */
  | "supplier_reported"
  /** Reconciled against a supplier invoice after the fact. */
  | "supplier_invoice"
  /** Allocated from a bulk/fixed charge by a documented rule. */
  | "allocated";

export interface EventCost {
  /** EUR everywhere. The commercial system, plans and the LMC peg are EUR. */
  readonly currency: "EUR";
  /** What we believed it cost when it happened. Null = unknown, never 0. */
  readonly estimatedCents: number | null;
  /** What it actually cost once reconciled. Null until reconciliation. */
  readonly actualCents: number | null;
  /** The price list / rate card version used for the estimate. */
  readonly pricingVersion: string | null;
  /** The supplier that will invoice for it. */
  readonly supplier: string | null;
  readonly billingSource: BillingSource | null;
}

/**
 * An unknown cost is `null`, never `0`.
 * Same doctrine as the Business Health Engine: a fabricated zero invites a
 * decision, an honest null demands the instrument.
 */
export const UNKNOWN_COST: EventCost = {
  currency: "EUR",
  estimatedCents: null,
  actualCents: null,
  pricingVersion: null,
  supplier: null,
  billingSource: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. Revenue link — one optional pointer, never a second ledger
// ═══════════════════════════════════════════════════════════════════════════

export const REVENUE_LINK_KINDS = [
  "subscription", "plan", "invoice", "payment", "topup", "lmc_debit", "lmc_credit",
] as const;
export type RevenueLinkKind = (typeof REVENUE_LINK_KINDS)[number];

/**
 * A POINTER to a fact that already exists in its own canonical store
 * (`billing_subscriptions`, `lmc_transactions`, `finance_records`).
 * The event never restates the amount — restating it would create a second
 * financial truth, which is exactly what the LMC ledger forbids.
 */
export interface RevenueLink {
  readonly kind: RevenueLinkKind;
  /** The id in that store. */
  readonly ref: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. The canonical event
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ONE ACTION = ONE EVENT. Immutable, never aggregated at write time, never
 * deduplicated by overwriting. Aggregates are computed later, from these rows.
 */
export interface UsageCostEvent {
  /** Client- or server-minted UUID. Doubles as the idempotency key. */
  readonly eventId: string;
  /** When the action happened (not when it was stored). ISO 8601, UTC. */
  readonly occurredAt: string;
  readonly eventType: EventType;
  /** Bounded free-form: "anthropic", "supabase", "mapbox", … */
  readonly provider: string;
  /** Bounded free-form: "llm_completion", "ocr", "email", … */
  readonly service: string;
  /** The specific thing used: a model id, a bucket, a template, an endpoint. */
  readonly resource: string | null;
  readonly status: EventStatus;
  readonly attribution: EventAttribution;
  readonly measures: UsageMeasures;
  readonly cost: EventCost;
  readonly revenueLink: RevenueLink | null;
  /**
   * Bounded, allowlisted, non-identifying context — the same discipline the
   * live `pilot_events` pipe already enforces. Never free text from a user.
   */
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
  /** The model version that produced the row, so a reader can adapt. */
  readonly schemaVersion: 1;
}

export const EVENT_SCHEMA_VERSION = 1 as const;

/** Bounds mirroring the live pilot_events contract. */
export const EVENT_LIMITS = {
  providerMaxChars: 64,
  serviceMaxChars: 64,
  resourceMaxChars: 128,
  featureCodeMaxChars: 64,
  sessionIdMaxChars: 64,
  metadataMaxKeys: 24,
  metadataStringValueMaxChars: 200,
  metadataSerializedMaxBytes: 2048,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// 7. Pure shape validation (no IO, no persistence)
// ═══════════════════════════════════════════════════════════════════════════

export type EventShapeViolation =
  | "missing_event_id"
  | "missing_occurred_at"
  | "unknown_event_type"
  | "unknown_status"
  | "provider_too_long_or_empty"
  | "service_too_long_or_empty"
  | "resource_too_long"
  | "negative_measure"
  | "cost_currency_not_eur"
  | "negative_cost"
  | "fabricated_zero_cost"
  | "metadata_too_many_keys"
  | "metadata_value_too_long"
  | "unknown_revenue_link_kind"
  | "client_supplied_identity";

/**
 * Validate the SHAPE of an event. This is the contract every future ingestion
 * path must satisfy — it does not store, send or read anything.
 *
 * `fabricated_zero_cost` is the rule that matters most: a usage event may not
 * claim a cost of exactly 0 with no billing source. Free things exist, but
 * they must say WHY they are free (`billingSource: "allocated"` with a
 * pricing version), otherwise an unmeasured cost silently becomes a measured
 * zero and every margin above it is wrong.
 */
export function validateEventShape(
  e: UsageCostEvent,
  opts?: { readonly clientSupplied?: boolean },
): readonly EventShapeViolation[] {
  const out: EventShapeViolation[] = [];
  const L = EVENT_LIMITS;

  if (!e.eventId || e.eventId.length < 8) out.push("missing_event_id");
  if (!e.occurredAt || Number.isNaN(Date.parse(e.occurredAt))) {
    out.push("missing_occurred_at");
  }
  if (!(EVENT_TYPES as readonly string[]).includes(e.eventType)) {
    out.push("unknown_event_type");
  }
  if (!(EVENT_STATUSES as readonly string[]).includes(e.status)) {
    out.push("unknown_status");
  }
  if (!e.provider || e.provider.length > L.providerMaxChars) {
    out.push("provider_too_long_or_empty");
  }
  if (!e.service || e.service.length > L.serviceMaxChars) {
    out.push("service_too_long_or_empty");
  }
  if (e.resource !== null && e.resource.length > L.resourceMaxChars) {
    out.push("resource_too_long");
  }

  for (const key of USAGE_MEASURE_KEYS) {
    const v = e.measures[key];
    if (typeof v === "number" && (v < 0 || !Number.isFinite(v))) {
      out.push("negative_measure");
      break;
    }
  }

  if (e.cost.currency !== "EUR") out.push("cost_currency_not_eur");
  if (
    (e.cost.estimatedCents !== null && e.cost.estimatedCents < 0) ||
    (e.cost.actualCents !== null && e.cost.actualCents < 0)
  ) {
    out.push("negative_cost");
  }
  if (
    e.eventType === "usage" &&
    e.cost.estimatedCents === 0 &&
    e.cost.actualCents === null &&
    e.cost.billingSource === null
  ) {
    out.push("fabricated_zero_cost");
  }

  const keys = Object.keys(e.metadata);
  if (keys.length > L.metadataMaxKeys) out.push("metadata_too_many_keys");
  for (const k of keys) {
    const v = e.metadata[k];
    if (typeof v === "string" && v.length > L.metadataStringValueMaxChars) {
      out.push("metadata_value_too_long");
      break;
    }
  }

  if (
    e.revenueLink !== null &&
    !(REVENUE_LINK_KINDS as readonly string[]).includes(e.revenueLink.kind)
  ) {
    out.push("unknown_revenue_link_kind");
  }

  // Identity is server-resolved. A client-submitted event carrying a user or
  // organisation id is refused outright — the same rule the live pilot_events
  // action already enforces.
  if (
    opts?.clientSupplied &&
    (e.attribution.userId !== null || e.attribution.organizationId !== null)
  ) {
    out.push("client_supplied_identity");
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. What this model feeds (Business Health Engine wiring, by declaration)
// ═══════════════════════════════════════════════════════════════════════════

/** Which BHE metric each part of the event answers, once ingestion exists. */
export interface MetricFeed {
  readonly metricCode: string;
  readonly derivedFrom: string;
}

export const BUSINESS_HEALTH_FEEDS: readonly MetricFeed[] = [
  { metricCode: "cost_ai", derivedFrom: "sum(cost) where service in the AI family, grouped by featureCode" },
  { metricCode: "cost_storage", derivedFrom: "sum(cost) where service = 'storage'" },
  { metricCode: "cost_api", derivedFrom: "sum(cost) where service = 'api'" },
  { metricCode: "cost_email", derivedFrom: "sum(cost) where service in ('email','sms','push')" },
  { metricCode: "cost_ocr", derivedFrom: "sum(cost) where service = 'ocr'" },
  { metricCode: "cost_maps", derivedFrom: "sum(cost) where service = 'maps'" },
  { metricCode: "cost_search", derivedFrom: "sum(cost) where service = 'search'" },
  { metricCode: "cost_voice", derivedFrom: "sum(cost) where service in ('voice','speech_to_text','text_to_speech')" },
  { metricCode: "cost_video", derivedFrom: "sum(cost) where service = 'video'" },
  { metricCode: "cost_infrastructure", derivedFrom: "sum(cost) of eventType='cost' rows with billingSource='supplier_invoice'" },
  { metricCode: "cost_total", derivedFrom: "sum(cost) across all events in the period" },
  { metricCode: "acpu", derivedFrom: "cost_total ÷ distinct attribution.userId in the period" },
  { metricCode: "top_cost_features", derivedFrom: "cost grouped by attribution.featureCode, ranked" },
  { metricCode: "top_ai_consumers", derivedFrom: "AI cost grouped by attribution.workspaceId, ranked" },
  { metricCode: "top_revenue_features", derivedFrom: "revenueLink rows grouped by attribution.featureCode" },
  { metricCode: "revenue_subscription", derivedFrom: "eventType='revenue' with revenueLink.kind='subscription'" },
  { metricCode: "revenue_topup", derivedFrom: "eventType='revenue' with revenueLink.kind='topup'" },
  { metricCode: "mrr", derivedFrom: "subscription revenue events normalised to a month at period end" },
  { metricCode: "gross_margin", derivedFrom: "(revenue events − usage/cost events) ÷ revenue events" },
  { metricCode: "contribution_margin", derivedFrom: "gross margin minus acquisition/support events by featureCode" },
  { metricCode: "lmc_spent", derivedFrom: "revenueLink.kind='lmc_debit' joined to the LMC ledger (pointer only)" },
  { metricCode: "lmc_outstanding_liability", derivedFrom: "unchanged — stays derived from the LMC ledger, never from events" },
] as const;

/**
 * Metrics that must NEVER be derived from events — they already have their own
 * canonical truth, and a second derivation would be a second answer.
 *
 * `cost_referral` belongs here even though it is a COST: a referral reward is
 * an entry in the immutable LMC ledger, not a metered resource consumption.
 * Deriving it from telemetry would let a missing event understate a real
 * liability.
 */
export const NOT_EVENT_DERIVED: readonly string[] = [
  "lmc_issued",
  "lmc_purchased",
  "lmc_granted",
  "lmc_expired",
  "lmc_outstanding_liability",
  "cost_referral",
] as const;
