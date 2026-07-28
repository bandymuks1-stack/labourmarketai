/**
 * USAGE & COST EVENT STORAGE — append-only write path + read model.
 *
 * Every property the storage layer claims is proven here against the REAL
 * store code and an in-memory Postgres stand-in that enforces the same
 * primary-key uniqueness and the same append-only refusal as the migration.
 *
 * The DATABASE-level proofs (RLS actually denying a client write, the trigger
 * actually raising on UPDATE/DELETE, a duplicate insert against the real
 * table) are run against production after the migration is applied and are
 * recorded in docs/architecture/usage-cost-event-model-v1.md — a test with a
 * fake client cannot prove a Postgres policy.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const MIGRATION = readFileSync(
  join(repoRoot, "supabase", "migrations", "20260728120000_usage_cost_events_v1.sql"),
  "utf8",
);
const ROLLBACK = readFileSync(
  join(repoRoot, "supabase", "rollbacks", "20260728120000_usage_cost_events_v1.down.sql"),
  "utf8",
);
const STORE_SRC = readFileSync(join(webRoot, "lib", "telemetry", "usage-cost-store.ts"), "utf8");

// ── In-memory stand-in for public.usage_cost_events ────────────────────────

type Row = Record<string, unknown>;
const table: Row[] = [];
/** Set by a test to simulate a database CHECK/relation failure. */
let forcedError: { code: string; message: string } | null = null;

let sessionUser: { id: string } | null = { id: "user-1" };
let activeOrgId: string | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (name: string) => {
      if (name !== "usage_cost_events") throw new Error(`unexpected table ${name}`);
      return {
        insert(row: Row) {
          return {
            select() {
              if (forcedError) return Promise.resolve({ data: null, error: forcedError });
              // Primary key on event_id: `on conflict do nothing` semantics.
              const exists = table.some((r) => r.event_id === row.event_id);
              if (exists) return Promise.resolve({ data: [], error: null });
              table.push({ ...row });
              return Promise.resolve({ data: [{ event_id: row.event_id }], error: null });
            },
          };
        },
        // Deliberately present so a call would be caught — the store must
        // never reach for either.
        update() {
          throw new Error("usage_cost_events is append-only: UPDATE is not permitted");
        },
        delete() {
          throw new Error("usage_cost_events is append-only: DELETE is not permitted");
        },
      };
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: sessionUser } }) },
      from: () => {
        const rows = table;
        const builder = {
          select: () => builder,
          gte: () => builder,
          lte: () => builder,
          then: (resolveFn: (v: unknown) => unknown) =>
            Promise.resolve(
              forcedError
                ? { data: null, error: forcedError }
                : {
                    data: rows.map((r) => ({
                      provider: r.provider,
                      service: r.service,
                      cost: r.cost,
                    })),
                    error: null,
                  },
            ).then(resolveFn),
        };
        return builder;
      },
    }),
}));

vi.mock("@/lib/company/active-organization", () => ({
  getActiveOrganizationContext: () =>
    Promise.resolve({ activeOrganizationId: activeOrgId }),
}));

const { recordUsageCostEvent, resolveEventIdentity } = await import(
  "@/lib/telemetry/usage-cost-store"
);
const { getAiCostReadModel } = await import("@/lib/commercial/business-health-read");
const { normalizeProvider, providerSlug } = await import(
  "@/lib/telemetry/provider-registry"
);

const EUR = (patch: Partial<Record<string, unknown>> = {}) => ({
  currency: "EUR" as const,
  estimatedCents: null,
  actualCents: null,
  pricingVersion: null,
  supplier: null,
  billingSource: null,
  ...patch,
});

const aiEvent = (eventId: string, cost = EUR({ estimatedCents: 12, pricingVersion: "2026-07" })) => ({
  eventId,
  eventType: "usage" as const,
  provider: "anthropic",
  service: "llm_completion",
  status: "success" as const,
  measures: { requestCount: 1, tokensInput: 900, tokensOutput: 120 },
  cost,
  featureCode: "single_ad",
});

beforeEach(() => {
  table.length = 0;
  forcedError = null;
  sessionUser = { id: "user-1" };
  activeOrgId = null;
});

// ── 1. Append-only ─────────────────────────────────────────────────────────

describe("usage_cost_events — append-only", () => {
  it("the migration revokes update/delete and installs a blocking trigger", () => {
    expect(MIGRATION).toMatch(/grant\s+select,\s*insert\s+on\s+public\.usage_cost_events\s+to\s+service_role/i);
    expect(MIGRATION).not.toMatch(/grant[^;]*\bupdate\b[^;]*on\s+public\.usage_cost_events/i);
    expect(MIGRATION).not.toMatch(/grant[^;]*\bdelete\b[^;]*on\s+public\.usage_cost_events/i);
    expect(MIGRATION).toMatch(/before\s+update\s+or\s+delete\s+on\s+public\.usage_cost_events/i);
    expect(MIGRATION).toMatch(/append-only/i);
  });

  it("TRUNCATE is blocked too — a row-level trigger does not fire on it", () => {
    const guard = readFileSync(
      join(repoRoot, "supabase", "migrations", "20260728140000_usage_cost_events_truncate_guard_v1.sql"),
      "utf8",
    );
    expect(guard).toMatch(/before\s+truncate\s+on\s+public\.usage_cost_events/i);
    expect(guard).toMatch(/for\s+each\s+statement/i);
    expect(guard).toMatch(/TRUNCATE is not permitted/);
    // Found by the production proof run, not by inspection — recorded so the
    // reason survives the commit.
    expect(guard).toMatch(/FOUND BY THE PRODUCTION PROOF RUN/i);
  });

  it("the store exposes no update and no delete path at all", () => {
    const code = STORE_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.update\(/);
    expect(code).not.toMatch(/\.delete\(/);
    expect(code).not.toMatch(/\.upsert\(/);
  });

  it("a stored event is never modified by a later write", async () => {
    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000015"));
    const snapshot = JSON.stringify(table[0]);
    await recordUsageCostEvent({
      ...aiEvent("00000000-0000-4000-8000-000000000015", EUR({ estimatedCents: 9999, pricingVersion: "2026-08" })),
      status: "error",
    });
    expect(table).toHaveLength(1);
    expect(JSON.stringify(table[0])).toBe(snapshot);
  });
});

// ── 2. Idempotency ─────────────────────────────────────────────────────────

describe("usage_cost_events — idempotency", () => {
  it("the same event_id is stored exactly once", async () => {
    const first = await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000009"));
    const second = await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000009"));
    expect(first).toEqual({ ok: true, stored: "inserted", eventId: "00000000-0000-4000-8000-000000000009" });
    expect(second).toEqual({ ok: true, stored: "duplicate", eventId: "00000000-0000-4000-8000-000000000009" });
    expect(table).toHaveLength(1);
  });

  it("a retry is deterministic — same result, every time", async () => {
    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000005"));
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000005")));
    }
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(table).toHaveLength(1);
  });

  it("a concurrent unique violation resolves as a duplicate, not a failure", async () => {
    forcedError = { code: "23505", message: "duplicate key" };
    const r = await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000008"));
    expect(r).toEqual({ ok: true, stored: "duplicate", eventId: "00000000-0000-4000-8000-000000000008" });
  });

  it("event_id is the primary key in the migration", () => {
    expect(MIGRATION).toMatch(/event_id\s+uuid\s+primary\s+key/i);
  });
});

// ── 3. Identity is server-resolved ─────────────────────────────────────────

describe("usage_cost_events — identity", () => {
  it("the input type has no identity field at all (structurally impossible)", () => {
    expect(STORE_SRC).toMatch(/interface UsageCostEventInput[\s\S]*?\n}/);
    const block = /interface UsageCostEventInput([\s\S]*?)\n}/.exec(STORE_SRC)?.[1] ?? "";
    expect(block).not.toMatch(/profileId|organizationId|workspaceId|userId/);
  });

  it("a caller-supplied identity is ignored — the session wins", async () => {
    await recordUsageCostEvent({
      ...aiEvent("00000000-0000-4000-8000-000000000001"),
      // @ts-expect-error deliberately passing fields the contract forbids
      profileId: "attacker",
      organizationId: "attacker-org",
    });
    expect(table[0].profile_id).toBe("user-1");
    expect(table[0].organization_id).toBeNull();
  });

  it("derives the PERSONAL workspace when no organisation is active", async () => {
    activeOrgId = null;
    const who = await resolveEventIdentity();
    expect(who.workspaceId).toBe("personal:user-1");
    expect(who.organizationId).toBeNull();
  });

  it("derives the ORGANISATION workspace from the membership-validated resolver", async () => {
    activeOrgId = "org-9";
    const who = await resolveEventIdentity();
    expect(who.workspaceId).toBe("org:org-9");
    expect(who.organizationId).toBe("org-9");
    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000012"));
    expect(table[0].workspace_id).toBe("org:org-9");
  });

  it("an anonymous session yields null identity, never a fabricated one", async () => {
    sessionUser = null;
    const who = await resolveEventIdentity();
    expect(who).toEqual({ profileId: null, organizationId: null, workspaceId: null });
  });

  it("workspace_id is not a foreign key in the migration", () => {
    expect(MIGRATION).toMatch(/workspace_id\s+text/i);
    expect(MIGRATION).not.toMatch(/workspace_id[^,]*references/i);
  });
});

// ── 4. Cost rules ──────────────────────────────────────────────────────────

describe("usage_cost_events — pricing lifecycle", () => {
  it("stores an ESTIMATED cost with its pricing version", async () => {
    const r = await recordUsageCostEvent(
      aiEvent("00000000-0000-4000-8000-000000000011", EUR({ estimatedCents: 42, pricingVersion: "2026-07", supplier: "anthropic", billingSource: "estimated_from_price_list" })),
    );
    expect(r.ok).toBe(true);
    expect((table[0].cost as Record<string, unknown>).estimatedCents).toBe(42);
  });

  it("stores an ACTUAL cost with its billing source", async () => {
    const r = await recordUsageCostEvent(
      aiEvent("00000000-0000-4000-8000-000000000010", EUR({ actualCents: 55, pricingVersion: "2026-07", billingSource: "supplier_invoice" })),
    );
    expect(r.ok).toBe(true);
    expect((table[0].cost as Record<string, unknown>).actualCents).toBe(55);
  });

  it("accepts an UNKNOWN cost — null is a legitimate answer", async () => {
    const r = await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000002", EUR()));
    expect(r.ok).toBe(true);
    expect((table[0].cost as Record<string, unknown>).estimatedCents).toBeNull();
  });

  it("REJECTS a fabricated zero (0 with no billing source)", async () => {
    const r = await recordUsageCostEvent(
      aiEvent("00000000-0000-4000-8000-000000000006", EUR({ estimatedCents: 0, pricingVersion: "2026-07" })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("fabricated_zero_cost");
    expect(table).toHaveLength(0);
  });

  it("ACCEPTS zero when it says why it is free", async () => {
    const r = await recordUsageCostEvent(
      aiEvent("00000000-0000-4000-8000-000000000007", EUR({ estimatedCents: 0, pricingVersion: "2026-07", billingSource: "allocated" })),
    );
    expect(r.ok).toBe(true);
  });

  it("the database enforces the same rules independently", () => {
    expect(MIGRATION).toMatch(/usage_cost_events_no_fabricated_zero/);
    expect(MIGRATION).toMatch(/usage_cost_events_pricing_version_required/);
    expect(MIGRATION).toMatch(/usage_cost_events_billing_source_for_actual/);
    expect(MIGRATION).toMatch(/usage_cost_events_currency_eur/);
    expect(MIGRATION).toMatch(/usage_cost_events_amount_sign/);
  });

  it("a database CHECK rejection is reported honestly, never swallowed", async () => {
    forcedError = { code: "23514", message: "usage_cost_events_no_fabricated_zero" };
    const r = await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000004"));
    expect(r).toMatchObject({ ok: false, reason: "rejected_by_database" });
  });

  it("an absent table degrades to needs_migration, never a fake success", async () => {
    forcedError = { code: "42P01", message: "relation does not exist" };
    const r = await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000003"));
    expect(r).toMatchObject({ ok: false, reason: "needs_migration" });
  });
});

// ── 5. Provider normalisation ──────────────────────────────────────────────

describe("usage_cost_events — provider normalisation", () => {
  it("collapses casing and separator variants onto one slug", () => {
    for (const raw of ["OpenAI", "open_ai", "OPENAI", " openai ", "Open-AI", "open ai"]) {
      expect(providerSlug(raw), raw).toBe("openai");
    }
  });

  it("keeps genuinely different suppliers apart", () => {
    // Azure-hosted OpenAI is a different invoice and a different rate card.
    expect(providerSlug("Azure OpenAI")).toBe("azure-openai");
    expect(providerSlug("azure_openai")).toBe("azure-openai");
    expect(providerSlug("openai")).not.toBe(providerSlug("azure-openai"));
  });

  it("maps product names to their supplier", () => {
    expect(providerSlug("Claude")).toBe("anthropic");
    expect(providerSlug("Gemini")).toBe("google");
    expect(providerSlug("Ollama")).toBe("local");
  });

  it("ACCEPTS an unknown supplier — a new vendor is not an error", () => {
    const n = normalizeProvider("Some New Vendor 2031");
    expect(n.slug).toBe("some-new-vendor-2031");
    expect(n.known).toBe(false);
  });

  it("normalises before storing, so aggregates never split", async () => {
    await recordUsageCostEvent({ ...aiEvent("00000000-0000-4000-8000-000000000014"), provider: "OpenAI" });
    await recordUsageCostEvent({ ...aiEvent("00000000-0000-4000-8000-000000000013"), provider: "open_ai" });
    expect(new Set(table.map((r) => r.provider))).toEqual(new Set(["openai"]));
  });
});

// ── 6. Business Health read model ──────────────────────────────────────────

describe("business health — AI cost read model", () => {
  it("reports an empty ledger honestly (0 events, no fabricated cost)", async () => {
    const m = await getAiCostReadModel();
    expect(m.totalEventCount).toMatchObject({ measured: true, value: 0 });
    expect(m.aiEstimatedCents.measured).toBe(false);
    expect(m.estimatedToActualRatio.measured).toBe(false);
  });

  it("sums estimated and actual AI cost, and counts the unknowns", async () => {
    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000020", EUR({ estimatedCents: 100, pricingVersion: "v1" })));
    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000018", EUR({ estimatedCents: 50, actualCents: 60, pricingVersion: "v1", billingSource: "supplier_invoice" })));
    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000019", EUR())); // unknown cost
    await recordUsageCostEvent({ ...aiEvent("00000000-0000-4000-8000-000000000017", EUR({ estimatedCents: 7, pricingVersion: "v1" })), provider: "mapbox", service: "maps" });

    const m = await getAiCostReadModel();
    expect(m.totalEventCount).toMatchObject({ value: 4 });
    expect(m.aiEventCount).toMatchObject({ value: 3 });
    expect(m.aiEstimatedCents).toMatchObject({ value: 150 });
    expect(m.aiActualCents).toMatchObject({ value: 60 });
    expect(m.unknownCostEvents).toMatchObject({ value: 1 });
  });

  it("reports the estimated→actual ratio only when both sides exist", async () => {
    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000021", EUR({ estimatedCents: 100, pricingVersion: "v1" })));
    const noActual = await getAiCostReadModel();
    expect(noActual.estimatedToActualRatio.measured).toBe(false);

    await recordUsageCostEvent(aiEvent("00000000-0000-4000-8000-000000000016", EUR({ estimatedCents: 100, actualCents: 120, pricingVersion: "v1", billingSource: "supplier_invoice" })));
    const both = await getAiCostReadModel();
    expect(both.estimatedToActualRatio).toMatchObject({ measured: true, value: 0.6 });
  });

  it("reads with the caller's session, never the service role", () => {
    const src = readFileSync(
      join(webRoot, "lib", "commercial", "business-health-read.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/createAdminClient/);
    expect(src).toMatch(/@\/lib\/supabase\/server/);
    // Read-only: no write verb anywhere.
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("an unreadable ledger yields a reason, never a zero", async () => {
    forcedError = { code: "42501", message: "permission denied" };
    const m = await getAiCostReadModel();
    expect(m.aiEstimatedCents.measured).toBe(false);
    expect(m.totalEventCount.measured).toBe(false);
  });
});

// ── 7. RLS, grants and rollback (migration-level) ──────────────────────────

describe("usage_cost_events — RLS, grants, rollback", () => {
  it("RLS is enabled with an admin-only SELECT policy", () => {
    expect(MIGRATION).toMatch(/alter table public\.usage_cost_events enable row level security/i);
    expect(MIGRATION).toMatch(/create policy usage_cost_events_select[\s\S]*?for select to authenticated[\s\S]*?using \(public\.is_admin\(\)\)/i);
  });

  it("no INSERT/UPDATE/DELETE policy exists for any client role", () => {
    expect(MIGRATION).not.toMatch(/create policy[^;]*for\s+insert/i);
    expect(MIGRATION).not.toMatch(/create policy[^;]*for\s+update/i);
    expect(MIGRATION).not.toMatch(/create policy[^;]*for\s+delete/i);
    expect(MIGRATION).not.toMatch(/for\s+all\s+to/i);
  });

  it("grants nothing to anon or public", () => {
    expect(MIGRATION).not.toMatch(/\bto\s+anon\b/i);
    expect(MIGRATION).not.toMatch(/grant[^;]*\bto\s+public\b/i);
  });

  it("declares every required index", () => {
    expect(MIGRATION).toMatch(/event_id\s+uuid\s+primary\s+key/i);
    for (const idx of ["occurred_at", "provider", "organization", "profile", "service"]) {
      expect(MIGRATION, `index on ${idx}`).toMatch(
        new RegExp(`create index[^;]*usage_cost_events_${idx}`, "i"),
      );
    }
  });

  it("the rollback is zero-row guarded and refuses to drop a populated ledger", () => {
    expect(ROLLBACK).toMatch(/count\(\*\)/);
    expect(ROLLBACK).toMatch(/raise\s+exception/i);
    expect(ROLLBACK).toMatch(/drop table if exists public\.usage_cost_events/i);
    // The guard must come BEFORE the drop.
    expect(ROLLBACK.indexOf("raise exception")).toBeLessThan(
      ROLLBACK.indexOf("drop table if exists public.usage_cost_events"),
    );
  });

  it("the migration ships no scheduler, job, webhook or outbound sender", () => {
    expect(MIGRATION).not.toMatch(/cron|pg_net|http_post|pg_cron|schedule/i);
  });
});
