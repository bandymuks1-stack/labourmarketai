import { describe, expect, it } from "vitest";
import { activeVipGrant, vipOverridePlanKey } from "./organization-vip";
import { ORGANIZATION_PLAN_KEY } from "./plans";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("activeVipGrant — the organization's own, unrevoked VIP row only", () => {
  it("an active vip grant of THIS organization counts; no figure = no fixed limit", () => {
    expect(
      activeVipGrant(
        [
          {
            organization_id: ORG,
            grant_kind: "vip",
            scope: { profile_views: null },
            revoked_at: null,
          },
        ],
        ORG,
      ),
    ).toEqual({ profileViews: null });
  });

  it("carries the scope's profile-view figure", () => {
    expect(
      activeVipGrant(
        [
          {
            organization_id: ORG,
            grant_kind: "vip",
            scope: { profile_views: 50 },
            revoked_at: null,
          },
        ],
        ORG,
      ),
    ).toEqual({ profileViews: 50 });
  });

  it("a malformed figure reads as no fixed figure, never as zero", () => {
    for (const v of [0, -3, 2.5, "50"]) {
      expect(
        activeVipGrant(
          [
            {
              organization_id: ORG,
              grant_kind: "vip",
              scope: { profile_views: v },
              revoked_at: null,
            },
          ],
          ORG,
        ),
      ).toEqual({ profileViews: null });
    }
  });

  it("a revoked grant, another organization's grant or another kind never entitles", () => {
    expect(
      activeVipGrant(
        [
          {
            organization_id: ORG,
            grant_kind: "vip",
            scope: {},
            revoked_at: "2026-10-23T10:00:00Z",
          },
        ],
        ORG,
      ),
    ).toBeNull();
    expect(
      activeVipGrant(
        [
          {
            organization_id: OTHER,
            grant_kind: "vip",
            scope: {},
            revoked_at: null,
          },
        ],
        ORG,
      ),
    ).toBeNull();
    expect(
      activeVipGrant(
        [
          {
            organization_id: ORG,
            grant_kind: "other",
            scope: {},
            revoked_at: null,
          },
        ],
        ORG,
      ),
    ).toBeNull();
  });

  it("no rows, null rows or no organization → null", () => {
    expect(activeVipGrant([], ORG)).toBeNull();
    expect(activeVipGrant(null, ORG)).toBeNull();
    expect(
      activeVipGrant(
        [{ organization_id: ORG, grant_kind: "vip", revoked_at: null }],
        "",
      ),
    ).toBeNull();
  });
});

describe("vipOverridePlanKey", () => {
  it("an active grant confers the ONE paid Organization plan; none confers nothing", () => {
    expect(vipOverridePlanKey({ profileViews: null })).toBe(
      ORGANIZATION_PLAN_KEY,
    );
    expect(vipOverridePlanKey(null)).toBeNull();
  });
});
