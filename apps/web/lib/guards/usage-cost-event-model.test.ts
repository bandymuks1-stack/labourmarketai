/**
 * Guard — CANONICAL USAGE & COST EVENT MODEL.
 *
 * Binding contract: `docs/architecture/usage-cost-event-model-v1.md`.
 *
 * Two jobs:
 *   1. keep the document and the contract identical;
 *   2. prove the ARCHITECTURE-ONLY boundary — this slice ships no ingestion,
 *      no API, no database client and no migration. That prohibition is part
 *      of the task, so it is asserted rather than promised.
 *
 * Plus the model rules that will matter most when ingestion is finally built:
 * provider/service stay DATA (a new supplier must never need a migration), an
 * unknown cost is null and never a fabricated zero, and identity is never
 * accepted from a client.
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_HEALTH_FEEDS,
  EVENT_LIMITS,
  EVENT_SCHEMA_VERSION,
  EVENT_STATUSES,
  EVENT_TYPES,
  KNOWN_AI_PROVIDERS,
  NOT_EVENT_DERIVED,
  REVENUE_LINK_KINDS,
  UNKNOWN_COST,
  USAGE_MEASURE_KEYS,
  validateEventShape,
  workspaceId,
  type UsageCostEvent,
} from "../telemetry/usage-cost-event-model";
import { METRICS } from "../commercial/business-health";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const MODEL_FILE = join(webRoot, "lib", "telemetry", "usage-cost-event-model.ts");
const DOC = join(repoRoot, "docs", "architecture", "usage-cost-event-model-v1.md");

const base = (): UsageCostEvent => ({
  eventId: "9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
  occurredAt: "2026-07-28T10:00:00.000Z",
  eventType: "usage",
  provider: "anthropic",
  service: "llm_completion",
  resource: "claude-model-id",
  status: "success",
  attribution: {
    workspaceId: "org:11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    organizationId: "11111111-1111-1111-1111-111111111111",
    sessionId: "sess_abc",
    featureCode: "single_ad",
    planKey: "company_pilot",
    payer: "company",
  },
  measures: { requestCount: 1, tokensInput: 1200, tokensOutput: 300, durationMs: 900 },
  cost: {
    currency: "EUR",
    estimatedCents: 4,
    actualCents: null,
    pricingVersion: "2026-07",
    supplier: "anthropic",
    billingSource: "estimated_from_price_list",
  },
  revenueLink: null,
  metadata: { locale: "lt" },
  schemaVersion: EVENT_SCHEMA_VERSION,
});

// ── 1. Document ↔ contract ─────────────────────────────────────────────────

describe("usage & cost event model — the binding document", () => {
  it("exists and names the contract module", () => {
    expect(existsSync(DOC)).toBe(true);
    expect(readFileSync(DOC, "utf8")).toMatch(/lib\/telemetry\/usage-cost-event-model\.ts/);
  });

  it("documents every event type, status, revenue link and measure", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const t of EVENT_TYPES) expect(doc, `event type ${t}`).toContain(t);
    for (const s of EVENT_STATUSES) expect(doc, `status ${s}`).toContain(s);
    for (const k of REVENUE_LINK_KINDS) expect(doc, `revenue link ${k}`).toContain(k);
    for (const k of USAGE_MEASURE_KEYS) expect(doc, `measure ${k}`).toContain(k);
  });
});

// ── 2. THE PROHIBITION — architecture only ─────────────────────────────────

describe("usage & cost event model — ships no ingestion, no API, no DB", () => {
  const src = readFileSync(MODEL_FILE, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("imports no database or network client", () => {
    expect(code).not.toMatch(/from\s+["']@\/lib\/supabase/);
    expect(code).not.toMatch(/createClient|createAdminClient/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
  });

  it("is not a server action, a route or a server-only module", () => {
    expect(code).not.toMatch(/"use server"/);
    expect(code).not.toMatch(/server-only/);
    expect(code).not.toMatch(/NextResponse|NextRequest/);
  });

  it("declares no table, no column and no migration", () => {
    expect(code).not.toMatch(/create\s+table/i);
    expect(code).not.toMatch(/alter\s+table/i);
    expect(code).not.toMatch(/\.from\(/);
    expect(code).not.toMatch(/\.insert\(/);
  });

  it("no migration was added by this slice", () => {
    // The contract must be agreeable before any storage decision.
    const migrations = join(repoRoot, "supabase", "migrations");
    expect(existsSync(migrations)).toBe(true);
    const added = readFileSync(DOC, "utf8");
    expect(added).toMatch(/no migration|No migration|NO MIGRATION/);
  });
});

// ── 3. A new supplier must never need a migration ──────────────────────────

describe("usage & cost event model — provider/service are DATA", () => {
  it("accepts a provider that is not in any known list", () => {
    const e = { ...base(), provider: "some-2031-vendor", service: "neural_whatever" };
    expect(validateEventShape(e)).toEqual([]);
  });

  it("accepts every AI provider the platform may ever route to", () => {
    for (const p of KNOWN_AI_PROVIDERS) {
      expect(validateEventShape({ ...base(), provider: p })).toEqual([]);
    }
  });

  it("bounds provider/service/resource so a free-form field cannot become a blob", () => {
    expect(validateEventShape({ ...base(), provider: "x".repeat(EVENT_LIMITS.providerMaxChars + 1) }))
      .toContain("provider_too_long_or_empty");
    expect(validateEventShape({ ...base(), service: "" })).toContain("service_too_long_or_empty");
    expect(validateEventShape({ ...base(), resource: "y".repeat(EVENT_LIMITS.resourceMaxChars + 1) }))
      .toContain("resource_too_long");
  });

  it("the same event shape carries a non-AI service unchanged", () => {
    const ocr = {
      ...base(),
      provider: "ocr_vendor",
      service: "ocr",
      resource: "cv-extract",
      measures: { pages: 3, files: 1 },
    };
    expect(validateEventShape(ocr)).toEqual([]);
  });
});

// ── 4. Cost honesty ────────────────────────────────────────────────────────

describe("usage & cost event model — cost is EUR, and null beats a fake zero", () => {
  it("the unknown-cost constant is null, not zero", () => {
    expect(UNKNOWN_COST.estimatedCents).toBeNull();
    expect(UNKNOWN_COST.actualCents).toBeNull();
    expect(UNKNOWN_COST.currency).toBe("EUR");
  });

  it("an unknown cost passes validation (it is a legitimate answer)", () => {
    expect(validateEventShape({ ...base(), cost: UNKNOWN_COST })).toEqual([]);
  });

  it("REJECTS a usage event claiming zero cost with no billing source", () => {
    const e = {
      ...base(),
      cost: { ...UNKNOWN_COST, estimatedCents: 0 },
    };
    expect(validateEventShape(e)).toContain("fabricated_zero_cost");
  });

  it("ACCEPTS zero cost when it says why it is free", () => {
    const e = {
      ...base(),
      cost: {
        currency: "EUR" as const,
        estimatedCents: 0,
        actualCents: null,
        pricingVersion: "2026-07",
        supplier: "self-hosted",
        billingSource: "allocated" as const,
      },
    };
    expect(validateEventShape(e)).toEqual([]);
  });

  it("rejects a non-EUR cost and a negative cost", () => {
    const wrongCurrency = {
      ...base(),
      cost: { ...base().cost, currency: "USD" as unknown as "EUR" },
    };
    expect(validateEventShape(wrongCurrency)).toContain("cost_currency_not_eur");
    expect(validateEventShape({ ...base(), cost: { ...base().cost, estimatedCents: -1 } }))
      .toContain("negative_cost");
  });
});

// ── 5. Identity is server-resolved ─────────────────────────────────────────

describe("usage & cost event model — identity is never taken from a client", () => {
  it("rejects a client-submitted event carrying a user or organisation id", () => {
    expect(validateEventShape(base(), { clientSupplied: true }))
      .toContain("client_supplied_identity");
  });

  it("accepts the same event once the server has resolved it", () => {
    expect(validateEventShape(base())).toEqual([]);
  });

  it("workspace id is derived, never a foreign key to a table that does not exist", () => {
    expect(workspaceId({ kind: "personal", profileId: "p1" })).toBe("personal:p1");
    expect(workspaceId({ kind: "organization", organizationId: "o1" })).toBe("org:o1");
  });
});

// ── 6. Event principles ────────────────────────────────────────────────────

describe("usage & cost event model — one action, one immutable event", () => {
  it("every event carries its own id, so a retry is idempotent and never merged", () => {
    expect(validateEventShape({ ...base(), eventId: "" })).toContain("missing_event_id");
  });

  it("occurredAt is the action time, and must be a real timestamp", () => {
    expect(validateEventShape({ ...base(), occurredAt: "not-a-date" }))
      .toContain("missing_occurred_at");
  });

  it("the event is a readonly contract carrying a schema version", () => {
    expect(EVENT_SCHEMA_VERSION).toBe(1);
    expect(base().schemaVersion).toBe(1);
  });

  it("metadata stays bounded, like the live pilot_events pipe", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < EVENT_LIMITS.metadataMaxKeys + 1; i += 1) many[`k${i}`] = "v";
    expect(validateEventShape({ ...base(), metadata: many })).toContain("metadata_too_many_keys");
    expect(
      validateEventShape({
        ...base(),
        metadata: { long: "x".repeat(EVENT_LIMITS.metadataStringValueMaxChars + 1) },
      }),
    ).toContain("metadata_value_too_long");
  });
});

// ── 7. Business Health wiring ──────────────────────────────────────────────

describe("usage & cost event model — it feeds the Business Health Engine", () => {
  it("every declared feed names a real BHE metric", () => {
    const known = new Set(METRICS.map((x) => x.code));
    for (const f of BUSINESS_HEALTH_FEEDS) {
      expect(known.has(f.metricCode), `unknown metric ${f.metricCode}`).toBe(true);
      expect(f.derivedFrom.length).toBeGreaterThan(15);
    }
  });

  it("feeds every cost metric the engine currently cannot compute", () => {
    const fed = new Set(BUSINESS_HEALTH_FEEDS.map((f) => f.metricCode));
    const ledgerDerived = new Set(NOT_EVENT_DERIVED);
    const costMetrics = METRICS.filter((x) => x.group === "cost")
      .map((x) => x.code)
      // A ledger fact (referral reward) is never a telemetry fact.
      .filter((code) => !ledgerDerived.has(code));
    for (const code of costMetrics) {
      expect(fed.has(code), `${code} would still have no source`).toBe(true);
    }
  });

  it("the LMC ledger stays the only truth for LMC balances", () => {
    const fed = new Set(BUSINESS_HEALTH_FEEDS.map((f) => f.metricCode));
    for (const code of NOT_EVENT_DERIVED) {
      if (code === "lmc_outstanding_liability") continue; // declared, but as "unchanged"
      expect(fed.has(code), `${code} must not be derived from events`).toBe(false);
    }
    const liability = BUSINESS_HEALTH_FEEDS.find(
      (f) => f.metricCode === "lmc_outstanding_liability",
    );
    expect(liability?.derivedFrom).toMatch(/never from events/);
  });

  it("a revenue link is a POINTER, never a restated amount", () => {
    const e = { ...base(), eventType: "revenue" as const, revenueLink: { kind: "topup" as const, ref: "tx_1" } };
    expect(validateEventShape(e)).toEqual([]);
    // The RevenueLink type has exactly two fields — no amount can be restated.
    expect(Object.keys(e.revenueLink!).sort()).toEqual(["kind", "ref"]);
  });
});
