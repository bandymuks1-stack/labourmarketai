import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  getUser: vi.fn(),
  updateUser: vi.fn(async () => ({ data: {}, error: null })),
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));

import { campaignClearPatch, clearAccountCampaign, refuseAnalytics } from "@/lib/consent/account-campaign";
import { hasAnalyticsConsent } from "@/lib/consent/analytics-consent";
import { firstTouchFromUserMetadata } from "@/lib/telemetry/first-touch-user-metadata";

/**
 * A refused account carries no campaign (owner review 2026-11-03): refusing
 * removes the device items AND clears the six campaign keys on the signed-in
 * person's own account, so the server (which stamps events only from that
 * record) stops attributing them.
 */

const ALL_NULL = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  referrer_host: null,
  landing_path: null,
};

function installWindow() {
  const map = new Map<string, string>([["lm.attr.first", "{}"]]);
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  (globalThis as { window?: unknown }).window = {
    localStorage: storage,
    sessionStorage: { ...storage, length: 0, key: () => null },
    dispatchEvent: () => true,
  };
  return map;
}

beforeEach(() => {
  auth.getUser.mockReset();
  auth.updateUser.mockClear();
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("campaignClearPatch", () => {
  it("nulls all six keys when the account carries any campaign", () => {
    expect(campaignClearPatch({ utm_campaign: "worker-inbound", locale: "lt" })).toEqual(ALL_NULL);
  });
  it("writes nothing for an account with no campaign", () => {
    expect(campaignClearPatch({ locale: "lt" })).toBeNull();
    expect(campaignClearPatch(null)).toBeNull();
  });
  it("after the patch the server reads no campaign at all", () => {
    const patched: Record<string, unknown> = { utm_campaign: "x", locale: "lt" };
    Object.assign(patched, ALL_NULL);
    expect(firstTouchFromUserMetadata(patched)).toEqual({});
  });
});

describe("refusing clears the signed-in account", () => {
  it("refuseAnalytics: device items gone, consent refused, account campaign cleared", async () => {
    const map = installWindow();
    auth.getUser.mockResolvedValue({ data: { user: { user_metadata: { utm_source: "fb" } } } });
    refuseAnalytics();
    expect(map.has("lm.attr.first")).toBe(false);
    expect(hasAnalyticsConsent()).toBe(false);
    await vi.waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ data: ALL_NULL }));
  });

  it("an anonymous visitor or a clean account triggers no write", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await clearAccountCampaign();
    auth.getUser.mockResolvedValue({ data: { user: { user_metadata: {} } } });
    await clearAccountCampaign();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("a failing read never throws", async () => {
    auth.getUser.mockRejectedValue(new Error("offline"));
    await expect(clearAccountCampaign()).resolves.toBeUndefined();
  });
});
