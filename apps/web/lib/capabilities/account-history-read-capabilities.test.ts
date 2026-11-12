import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

const buildCv = vi.fn(async (): Promise<unknown> => ({ ok: false, code: "no_worker" }));
vi.mock("@/lib/cv-export/verified-cv", () => ({ buildVerifiedCv: () => buildCv() }));

const billingSubject = vi.fn(
  async (): Promise<unknown> => ({ subject: { type: "profile", id: "u-1" }, payerProfileId: "u-1", billingAuthority: true, role: null }),
);
vi.mock("@/lib/billing/billing-subject", () => ({ resolveBillingSubject: () => billingSubject() }));

const entitlements = vi.fn(
  async (..._a: unknown[]): Promise<unknown> => ({
    effectivePlanKey: "free_worker",
    source: "free",
    subscriptionStatus: null,
    active: false,
    grace: false,
    enforced: false,
    profileId: "u-1",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  }),
);
vi.mock("@/lib/billing/effective-entitlements", () => ({ getEffectiveEntitlements: (...a: unknown[]) => entitlements(...a) }));

const billingConfigFor = vi.fn((_org: string | null) => ({ state: "disabled" }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfigFor: (org: string | null) => billingConfigFor(org) }));

const lmcAccount = vi.fn(async (): Promise<unknown> => ({ state: "no_account" }));
vi.mock("@/lib/lmc/lmc-account", () => ({ readOwnLmcAccount: () => lmcAccount() }));

const searchReport = vi.fn(async (_nq: string): Promise<unknown> => ({ groups: [], notRead: [] }));
vi.mock("@/lib/search/dashboard-search", () => ({ getDashboardSearchReport: (nq: string) => searchReport(nq) }));

import { runAsBearerCaller } from "@/lib/api/bearer-caller-scope";

import { ACCOUNT_HISTORY_READ_CAPABILITIES } from "./account-history-read-capabilities";
import type { CapabilityCaller } from "./contract";
import { runCapability } from "./registry";

const supabase = {} as CapabilityCaller["supabase"];
const bearer: CapabilityCaller = { userId: "u-1", transport: "bearer", supabase, locale: "lt", actorKind: "agent" };
const inScope = <T>(fn: () => Promise<T>) => runAsBearerCaller({ userId: "u-1", transport: "bearer", supabase }, fn);
const asOther = <T>(fn: () => Promise<T>) => runAsBearerCaller({ userId: "u-2", transport: "bearer", supabase }, fn);

const IDS = ["work_history.get", "billing.subscription.get", "search.query"] as const;
const VALID_INPUT: Record<(typeof IDS)[number], unknown> = {
  "work_history.get": {},
  "billing.subscription.get": {},
  "search.query": { query: "plyteles" },
};

beforeEach(() => {
  buildCv.mockClear();
  billingSubject.mockClear();
  entitlements.mockClear();
  billingConfigFor.mockClear();
  lmcAccount.mockClear();
  searchReport.mockClear();
});

describe("account, history and search reads — contract", () => {
  it("exactly the three declared reads, each registered once", () => {
    expect(ACCOUNT_HISTORY_READ_CAPABILITIES.map((c) => c.id)).toEqual([...IDS]);
  });

  it("CONFIRM-BEFORE-WRITE holds trivially: there is no write here at all — every one is a read-only read", () => {
    for (const c of ACCOUNT_HISTORY_READ_CAPABILITIES) {
      expect(c.kind, c.id).toBe("read");
      expect(c.annotations, c.id).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(c.description, c.id).toMatch(/Writes nothing\./);
    }
  });

  it("no money operation: the billing tool takes no input and says it cannot order, pay or cancel", () => {
    const billing = ACCOUNT_HISTORY_READ_CAPABILITIES.find((c) => c.id === "billing.subscription.get")!;
    expect(billing.description).toMatch(/READ-ONLY/);
    expect(billing.description).toMatch(/cannot order, pay, cancel/);
    expect(billing.inputSchema.safeParse({ planKey: "organization" }).success).toBe(false);
    expect(billing.inputSchema.safeParse({ organizationId: "00000000-0000-4000-8000-000000000001" }).success).toBe(false);
  });
});

describe("authorization — the caller must be the verified bearer caller", () => {
  for (const id of IDS) {
    it(`${id}: a bearer caller OUTSIDE the verified scope is refused and nothing is read`, async () => {
      const r = await runCapability(id, bearer, VALID_INPUT[id]);
      expect(r).toMatchObject({ ok: false, code: "not_supported" });
      expect(buildCv).not.toHaveBeenCalled();
      expect(billingSubject).not.toHaveBeenCalled();
      expect(lmcAccount).not.toHaveBeenCalled();
      expect(searchReport).not.toHaveBeenCalled();
    });

    it(`${id}: a scope verified for ANOTHER person is refused and nothing is read`, async () => {
      const r = await asOther(() => runCapability(id, bearer, VALID_INPUT[id]));
      expect(r).toMatchObject({ ok: false, code: "not_supported" });
      expect(buildCv).not.toHaveBeenCalled();
      expect(billingSubject).not.toHaveBeenCalled();
      expect(searchReport).not.toHaveBeenCalled();
    });
  }
});

describe("isolation — the subject is server-resolved, never an argument", () => {
  it("no tool accepts an organization, workspace, user or worker id", () => {
    const foreign = { organizationId: "00000000-0000-4000-8000-000000000001", workspaceId: "x", userId: "u-2", workerId: "w-2" };
    for (const [key, value] of Object.entries(foreign)) {
      for (const id of IDS) {
        const c = ACCOUNT_HISTORY_READ_CAPABILITIES.find((d) => d.id === id)!;
        const input = { ...(VALID_INPUT[id] as Record<string, unknown>), [key]: value };
        expect(c.inputSchema.safeParse(input).success, `${id} must refuse ${key}`).toBe(false);
      }
    }
  });

  it("billing reads the organization the SERVER resolved, and only that one's configuration", async () => {
    billingSubject.mockResolvedValueOnce({ subject: { type: "organization", id: "org-A" }, payerProfileId: "u-1", billingAuthority: false, role: "manager" });
    billingConfigFor.mockReturnValueOnce({ state: "stripe_live" });
    entitlements.mockResolvedValueOnce({
      effectivePlanKey: "organization",
      source: "subscription",
      subscriptionStatus: "active",
      active: true,
      grace: false,
      enforced: true,
      profileId: "u-1",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-12-01T00:00:00Z",
    });
    const r = await inScope(() => runCapability("billing.subscription.get", bearer, {}));
    expect(billingConfigFor).toHaveBeenCalledWith("org-A");
    // The entitlement read takes NO caller-supplied subject: it resolves the
    // same server-side workspace the web page resolves.
    expect(entitlements).toHaveBeenCalledWith();
    expect(r).toMatchObject({
      ok: true,
      data: {
        billingSubject: { type: "organization", organizationId: "org-A" },
        callerMayManageBilling: false,
        paymentsActive: true,
        plan: { effectivePlanKey: "organization", source: "subscription", entitled: true },
        subscription: { status: "active", endsAtPeriodEnd: true, currentPeriodEnd: "2026-12-01T00:00:00Z" },
        readOnly: true,
      },
    });
  });

  it("the personal workspace never reads an organization's billing configuration", async () => {
    const r = await inScope(() => runCapability("billing.subscription.get", bearer, {}));
    expect(billingConfigFor).toHaveBeenCalledWith(null);
    expect(r).toMatchObject({ ok: true, data: { billingSubject: { type: "personal" }, paymentsActive: false } });
  });
});

describe("honest results — unknown is never zero, nothing is invented", () => {
  it("no signed-in subject is `auth`, not an empty plan", async () => {
    billingSubject.mockResolvedValueOnce({ subject: null, payerProfileId: null, billingAuthority: false, role: null });
    const r = await inScope(() => runCapability("billing.subscription.get", bearer, {}));
    expect(r).toMatchObject({ ok: false, code: "auth" });
    expect(entitlements).not.toHaveBeenCalled();
  });

  it("a failed balance read is `unavailable`, and no account is `no_account` — neither is a 0 balance", async () => {
    lmcAccount.mockResolvedValueOnce({ state: "unavailable", reason: "read_failed" });
    const failed = await inScope(() => runCapability("billing.subscription.get", bearer, {}));
    expect((failed as unknown as { data: { lmc: Record<string, unknown> } }).data.lmc).toEqual({ state: "unavailable" });

    const none = await inScope(() => runCapability("billing.subscription.get", bearer, {}));
    const lmc = (none as unknown as { data: { lmc: Record<string, unknown> } }).data.lmc;
    expect(lmc).toEqual({ state: "no_account" });
    expect(lmc).not.toHaveProperty("availableCents");
  });

  it("a real balance is passed through in cents, with the ledger's own movements", async () => {
    lmcAccount.mockResolvedValueOnce({
      state: "ready",
      accountId: "a-1",
      availableCents: 1250,
      purchasedCents: 1000,
      promotionalCents: 250,
      expiredRemainderCents: 0,
      movements: [{ id: "m-1", kind: "purchased", direction: "credit", amountCents: 1000, currency: "EUR", reason: "top-up", createdAt: "2026-11-01T00:00:00Z", originalTransactionId: null }],
    });
    const r = await inScope(() => runCapability("billing.subscription.get", bearer, {}));
    const lmc = (r as unknown as { data: { lmc: Record<string, unknown> } }).data.lmc;
    expect(lmc).toMatchObject({ state: "ready", unit: "LMC", availableCents: 1250, purchasedCents: 1000, promotionalCents: 250 });
    // The internal account id is not handed to an external client.
    expect(lmc).not.toHaveProperty("accountId");
  });

  it("work history without a worker profile says so — never an empty history", async () => {
    const r = await inScope(() => runCapability("work_history.get", bearer, {}));
    expect(r).toMatchObject({ ok: false, code: "no_worker_profile" });
  });

  it("an unreadable journal stays null and is named unreadable — never 0 hours", async () => {
    buildCv.mockResolvedValueOnce({
      ok: true,
      cv: { professionalExperience: null, organizationHistory: [], organizationRecordedHours: null, recordedHoursTotal: null, recordedHoursConfirmed: null, privateDetails: { phone: "+370" } },
    });
    const r = await inScope(() => runCapability("work_history.get", bearer, {}));
    expect(r).toMatchObject({
      ok: true,
      data: {
        professionalExperience: null,
        recordedHoursTotal: null,
        organizationHistory: [],
        readState: { professionalExperience: "unreadable", organizationHistory: "read" },
      },
    });
    // A history read hands out the history, not the rest of the CV.
    expect((r as { data: Record<string, unknown> }).data).not.toHaveProperty("privateDetails");
  });

  it("the one experience reading is passed through unchanged (no second derivation)", async () => {
    const experience = { hours: { total: 1840 }, organizations: [{ name: "UAB Statyba" }] };
    buildCv.mockResolvedValueOnce({
      ok: true,
      cv: { professionalExperience: experience, organizationHistory: null, organizationRecordedHours: null, recordedHoursTotal: 1840, recordedHoursConfirmed: 900 },
    });
    const r = await inScope(() => runCapability("work_history.get", bearer, {}));
    const data = (r as { data: Record<string, unknown> }).data;
    expect(data.professionalExperience).toBe(experience);
    expect(data.readState).toEqual({ professionalExperience: "read", organizationHistory: "unreadable" });
  });
});

describe("search — the finder's own search, parameters validated", () => {
  it("refuses a too-short, too-long, or unknown-source query before any read", async () => {
    for (const input of [{ query: "a" }, { query: "x".repeat(81) }, { query: "tiles", sources: ["people"] }, { query: "tiles", sources: [] }, {}]) {
      const r = await inScope(() => runCapability("search.query", bearer, input));
      expect(r, JSON.stringify(input)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(searchReport).not.toHaveBeenCalled();
  });

  it("returns the finder's groups with the exact screens, and counts them", async () => {
    searchReport.mockResolvedValueOnce({
      groups: [
        { source: "journal", results: [{ id: "j-1", label: "Klijavau plyteles", href: "/dashboard/journal" }] },
        { source: "conversations", results: [{ id: "c-1", label: "Plytelės", href: "/dashboard/communication/c-1" }] },
      ],
      notRead: [],
    });
    const r = await inScope(() => runCapability("search.query", bearer, { query: "  Plyteles " }));
    expect(searchReport).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, data: { total: 2, notRead: [] } });
    expect((r as unknown as { data: { groups: unknown[] } }).data.groups).toHaveLength(2);
  });

  it("`sources` narrows the answer, never widens it", async () => {
    searchReport.mockResolvedValueOnce({
      groups: [
        { source: "journal", results: [{ id: "j-1", label: "a", href: "/dashboard/journal" }] },
        { source: "documents", results: [{ id: "d-1", label: "b", href: "/dashboard/documents?type=x" }] },
      ],
      notRead: ["finance"],
    });
    const r = await inScope(() => runCapability("search.query", bearer, { query: "tiles", sources: ["documents"] }));
    expect(r).toMatchObject({ ok: true, data: { total: 1, searched: ["documents"], notRead: [] } });
    expect((r as unknown as { data: { groups: { source: string }[] } }).data.groups.map((g) => g.source)).toEqual(["documents"]);
  });

  it("an empty answer with unread sources says so — 'not searched' is not 'nothing exists'", async () => {
    searchReport.mockResolvedValueOnce({ groups: [], notRead: ["documents", "tasks"] });
    const r = await inScope(() => runCapability("search.query", bearer, { query: "pasas" }));
    const data = (r as unknown as { data: { total: number; notRead: string[]; searched: string[]; note?: string } }).data;
    expect(data.total).toBe(0);
    expect(data.notRead).toEqual(["documents", "tasks"]);
    expect(data.searched).not.toContain("documents");
    expect(data.note).toMatch(/not the same as 'nothing exists'/);
  });

  it("an empty answer over fully read sources carries no caveat", async () => {
    const r = await inScope(() => runCapability("search.query", bearer, { query: "pasas" }));
    expect((r as { data: Record<string, unknown> }).data).not.toHaveProperty("note");
  });
});
