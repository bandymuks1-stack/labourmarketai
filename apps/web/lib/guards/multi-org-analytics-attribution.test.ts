import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-8 §14 — organization-aware analytics attribution: structural pins.
 *
 *   1. the server-funnel emitter stamps attribution from the VALIDATED
 *      workspace (one seam, all 13 emit sites inherit — no call site can
 *      fabricate an organization);
 *   2. the metadata allowlist gained exactly the reserved attribution keys;
 *   3. the AI cost writer resolves the workspace organization (the "honest
 *      null" boundary is closed) and personal runs stay unattributed;
 *   4. history is append-only — revocation can never rewrite attribution
 *      (pilot_events has no UPDATE/DELETE policy; usage_cost_events keeps
 *      its no-mutation triggers);
 *   5. admin aggregation stays PII-safe (the funnel reader declares and
 *      keeps its no-PII contract).
 */

const WEB = join(__dirname, "..", "..");
const ROOT = join(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

describe("§14 one attribution seam", () => {
  it("server-funnel stamps attribution for every emitted event", () => {
    const funnel = read(join(WEB, "lib", "telemetry", "server-funnel.ts"));
    expect(funnel).toMatch(/analyticsAttributionMetadata\(\)/);
    expect(funnel).toMatch(/\.\.\.attribution/);
  });

  it("the resolver derives from the billing subject (validated workspace), takes no input", () => {
    const attr = read(join(WEB, "lib", "telemetry", "analytics-attribution.ts"));
    expect(attr).toMatch(/resolveBillingSubject/);
    expect(attr).not.toMatch(/formData|searchParams|request\.json/i);
  });
});

describe("§14 allowlist", () => {
  it("actions.ts allowlists exactly the reserved attribution keys", () => {
    const actions = read(join(WEB, "lib", "telemetry", "actions.ts"));
    for (const key of [
      '"workspace_type"',
      '"organization_id"',
      '"org_role"',
      '"billing_subject"',
      '"ref_type"',
      '"ref_id"',
    ]) {
      expect(actions).toContain(key);
    }
  });

  it("FunnelMetadata mirrors them", () => {
    const events = read(join(WEB, "lib", "telemetry", "funnel-events.ts"));
    for (const key of [
      "workspace_type?",
      "organization_id?",
      "org_role?",
      "billing_subject?",
      "ref_type?",
      "ref_id?",
    ]) {
      expect(events).toContain(key);
    }
  });
});

describe("§14 cost attribution", () => {
  it("the AI cost writer resolves the workspace organization — the hardcoded null is gone", () => {
    const runner = read(join(WEB, "lib", "ai", "run-agent-server.ts"));
    expect(runner).toMatch(/resolveAnalyticsAttribution/);
    expect(runner).not.toMatch(/organizationId: null, \/\/ not resolvable/);
    // fail-safe stays: outside a request context the catch keeps null
    expect(runner).toMatch(/organizationId,\s*\n\s*requestContext/);
  });
});

describe("§14 history is append-only — revocation rewrites nothing", () => {
  it("pilot_events has no UPDATE/DELETE policy", () => {
    const m = read(join(ROOT, "supabase", "migrations", "0020_pilot_events.sql"));
    expect(m).not.toMatch(/for update/i);
    expect(m).not.toMatch(/for delete/i);
  });

  it("usage_cost_events keeps its no-mutation triggers", () => {
    const m = read(
      join(ROOT, "supabase", "migrations", "20260728114353_usage_cost_events_v1_clean_start.sql"),
    );
    expect(m).toMatch(/usage_cost_events_no_mutation/);
    expect(m).toMatch(/usage_cost_events_no_truncate/);
  });
});

describe("§14 admin aggregation stays PII-safe", () => {
  it("the conversion-funnel reader keeps its no-PII contract", () => {
    const funnel = read(join(WEB, "lib", "admin", "conversion-funnel.ts"));
    expect(funnel).toMatch(/No PII/i);
    expect(funnel).not.toMatch(/full_name|email/);
  });
});
