/**
 * Usage-event validation + row building — PURE core (Pricing & Payments
 * slice, Sprint v2 §11 cost engine). No IO. The server wrapper
 * (lib/billing/usage.ts) persists validated rows into the append-only
 * usage_events table (gated draft 20260714200000_usage_cost_tracking_v1.sql).
 *
 * Honesty rules:
 *   - cost_usd stays null when unknown — never fabricated;
 *   - metadata is bounded (<= 2000 chars serialized) and REJECTED when over
 *     the bound (no silent truncation of structured data);
 *   - free-text labels (unit/source) are bounded by truncation (labels, not
 *     data).
 */

export const USAGE_CATEGORIES = [
  "ai",
  "storage",
  "emails",
  "bandwidth",
  "database",
  "payments",
  "media",
  "voice",
  "video",
] as const;
export type UsageCategory = (typeof USAGE_CATEGORIES)[number];

export const CREDIT_TYPES = ["ad_credits", "ai_credits"] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

export const USAGE_METADATA_MAX_CHARS = 2000;
export const USAGE_UNIT_MAX_CHARS = 32;
export const USAGE_SOURCE_MAX_CHARS = 120;

export interface UsageEventInput {
  readonly category: UsageCategory;
  readonly quantity: number;
  readonly unit: string;
  readonly source: string;
  readonly profileId?: string | null;
  readonly costUsd?: number | null;
  readonly occurredAtIso?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface UsageEventRow {
  readonly occurred_at: string;
  readonly profile_id: string | null;
  readonly category: UsageCategory;
  readonly quantity: number;
  readonly unit: string;
  readonly cost_usd: number | null;
  readonly source: string;
  readonly metadata: Record<string, unknown>;
}

export type UsageEventBuildResult =
  | { readonly ok: true; readonly row: UsageEventRow }
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_category"
        | "invalid_quantity"
        | "invalid_cost"
        | "empty_unit"
        | "empty_source"
        | "metadata_too_large"
        | "invalid_occurred_at";
    };

export function buildUsageEventRow(
  input: UsageEventInput,
): UsageEventBuildResult {
  if (!(USAGE_CATEGORIES as readonly string[]).includes(input.category)) {
    return { ok: false, reason: "unknown_category" };
  }
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    return { ok: false, reason: "invalid_quantity" };
  }
  const cost = input.costUsd ?? null;
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
    return { ok: false, reason: "invalid_cost" };
  }
  const unit = input.unit.trim().slice(0, USAGE_UNIT_MAX_CHARS);
  if (unit.length === 0) return { ok: false, reason: "empty_unit" };
  const source = input.source.trim().slice(0, USAGE_SOURCE_MAX_CHARS);
  if (source.length === 0) return { ok: false, reason: "empty_source" };

  const metadata = input.metadata ?? {};
  let serialized: string;
  try {
    serialized = JSON.stringify(metadata);
  } catch {
    return { ok: false, reason: "metadata_too_large" };
  }
  if (serialized.length > USAGE_METADATA_MAX_CHARS) {
    // Bounded log: rejecting is honest; truncating structured JSON is not.
    return { ok: false, reason: "metadata_too_large" };
  }

  let occurredAt: string;
  if (input.occurredAtIso !== undefined) {
    const ms = Date.parse(input.occurredAtIso);
    if (!Number.isFinite(ms)) return { ok: false, reason: "invalid_occurred_at" };
    occurredAt = new Date(ms).toISOString();
  } else {
    occurredAt = new Date().toISOString();
  }

  return {
    ok: true,
    row: {
      occurred_at: occurredAt,
      profile_id: input.profileId ?? null,
      category: input.category,
      quantity: input.quantity,
      unit,
      cost_usd: cost,
      source,
      metadata,
    },
  };
}
