import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M-P0-8 §14 — organization-aware attribution behaviour proof (unit level).
 * The resolver is the ONE seam every server-side analytics writer shares:
 *
 *   - acting for A attributes ONLY A; acting for B attributes ONLY B —
 *     the other org's id is not reachable from the request;
 *   - a Personal event carries NO fabricated organization;
 *   - an engagement-only / revoked / forged workspace resolves personal
 *     (the billing-subject chain fails closed before attribution);
 *   - outside a request context the resolver degrades to personal instead
 *     of throwing into a product action.
 */

const resolveBillingSubjectMock = vi.fn();

vi.mock("@/lib/billing/billing-subject", () => ({
  resolveBillingSubject: (...a: unknown[]) => resolveBillingSubjectMock(...a),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const { resolveAnalyticsAttribution, analyticsAttributionMetadata } =
  await import("./analytics-attribution");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => vi.clearAllMocks());

describe("resolveAnalyticsAttribution", () => {
  it("workspace A attributes ONLY A; workspace B attributes ONLY B", async () => {
    resolveBillingSubjectMock.mockResolvedValueOnce({
      subject: { type: "organization", id: ORG_A },
      payerProfileId: "p",
      billingAuthority: true,
      role: "owner",
    });
    const a = await resolveAnalyticsAttribution();
    expect(a).toEqual({
      workspaceType: "organization",
      organizationId: ORG_A,
      roleContext: "owner",
      billingSubjectType: "organization",
    });

    resolveBillingSubjectMock.mockResolvedValueOnce({
      subject: { type: "organization", id: ORG_B },
      payerProfileId: "p",
      billingAuthority: true,
      role: "admin",
    });
    const b = await resolveAnalyticsAttribution();
    expect(b.organizationId).toBe(ORG_B);
    expect(b.organizationId).not.toBe(ORG_A);
  });

  it("a Personal event has NO fabricated organization", async () => {
    resolveBillingSubjectMock.mockResolvedValueOnce({
      subject: { type: "profile", id: "p" },
      payerProfileId: "p",
      billingAuthority: true,
      role: null,
    });
    const a = await resolveAnalyticsAttribution();
    expect(a.workspaceType).toBe("personal");
    expect(a.organizationId).toBeNull();
    expect(a.billingSubjectType).toBe("profile");
  });

  it("unauthenticated / failed resolution degrades to personal, never throws", async () => {
    resolveBillingSubjectMock.mockResolvedValueOnce({
      subject: null, payerProfileId: null, billingAuthority: false, role: null,
    });
    await expect(resolveAnalyticsAttribution()).resolves.toMatchObject({
      workspaceType: "personal",
      organizationId: null,
    });

    resolveBillingSubjectMock.mockRejectedValueOnce(new Error("no request context"));
    await expect(resolveAnalyticsAttribution()).resolves.toMatchObject({
      workspaceType: "personal",
      organizationId: null,
    });
  });
});

describe("analyticsAttributionMetadata", () => {
  it("emits only allowlisted bounded keys, omitting empty dims", async () => {
    resolveBillingSubjectMock.mockResolvedValueOnce({
      subject: { type: "organization", id: ORG_A },
      payerProfileId: "p",
      billingAuthority: false,
      role: "manager",
    });
    await expect(analyticsAttributionMetadata()).resolves.toEqual({
      workspace_type: "organization",
      organization_id: ORG_A,
      org_role: "manager",
      billing_subject: "organization",
    });

    resolveBillingSubjectMock.mockResolvedValueOnce({
      subject: null, payerProfileId: null, billingAuthority: false, role: null,
    });
    await expect(analyticsAttributionMetadata()).resolves.toEqual({
      workspace_type: "personal",
    });
  });
});
