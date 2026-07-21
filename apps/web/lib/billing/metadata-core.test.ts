import { describe, it, expect } from "vitest";
import {
  STRIPE_METADATA_PROJECT,
  STRIPE_METADATA_ENVIRONMENT,
  STRIPE_METADATA_SCHEMA_VERSION,
  customerMetadata,
  checkoutMetadata,
  checkoutIdempotencyKey,
} from "./metadata-core";

describe("metadata-core — canonical Stripe TEST metadata", () => {
  it("constants pin the project + TEST environment (never live)", () => {
    expect(STRIPE_METADATA_PROJECT).toBe("labourmarket.ai");
    expect(STRIPE_METADATA_ENVIRONMENT).toBe("test");
    expect(STRIPE_METADATA_SCHEMA_VERSION).toBe("1");
  });

  it("customer metadata carries project/environment/schema/owner", () => {
    const m = customerMetadata("owner_1");
    expect(m).toEqual({
      project: "labourmarket.ai",
      environment: "test",
      schema_version: "1",
      owner_id: "owner_1",
    });
  });

  it("checkout metadata carries canonical_plan_key + legacy plan_key", () => {
    const m = checkoutMetadata({ planKey: "worker_plus", ownerId: "owner_1" });
    expect(m.canonical_plan_key).toBe("worker_plus");
    expect(m.plan_key).toBe("worker_plus");
    expect(m.owner_id).toBe("owner_1");
    expect(m.environment).toBe("test");
    expect("organization_id" in m).toBe(false);
  });

  it("organization linkage rides only when present", () => {
    const m = checkoutMetadata({
      planKey: "company_pilot",
      ownerId: "owner_1",
      organizationId: "org_1",
    });
    expect(m.organization_id).toBe("org_1");
    const none = checkoutMetadata({
      planKey: "company_pilot",
      ownerId: "owner_1",
      organizationId: null,
    });
    expect("organization_id" in none).toBe(false);
  });

  it("idempotency key is deterministic per (owner, plan, org)", () => {
    const a = checkoutIdempotencyKey({ ownerId: "u1", planKey: "worker_plus" });
    const b = checkoutIdempotencyKey({ ownerId: "u1", planKey: "worker_plus", organizationId: null });
    expect(a).toBe(b); // retry replays, never a second uncontrolled session
    const org = checkoutIdempotencyKey({ ownerId: "u1", planKey: "company_pilot", organizationId: "org_1" });
    expect(org).not.toBe(a);
    expect(org.length).toBeLessThanOrEqual(255);
    expect(a.startsWith("co1_")).toBe(true);
  });
});
