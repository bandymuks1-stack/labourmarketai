import { describe, expect, it, vi } from "vitest";

import {
  MAX_PER_RUN,
  reprocessExternalReferrals,
  selectReprocessCandidates,
  type ReferralRow,
  type ReprocessDeps,
} from "./external-referral-reprocess";

const NOW = new Date("2026-10-27T12:00:00Z");
let n = 0;
const row = (over: Partial<ReferralRow> = {}): ReferralRow => {
  n += 1;
  return {
    id: `inv-${n}`,
    invitedEmail: `person${n}@mail.lt`,
    locale: "en",
    createdAt: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}T08:00:00Z`,
    expiresAt: "2026-11-20T00:00:00Z",
    status: "pending",
    deliveryStatus: "not_sent",
    consentGiven: true,
    externalSource: "nonstop",
    ...over,
  };
};
const select = (rows: ReferralRow[], accounts: string[] = []) =>
  selectReprocessCandidates(rows, { now: NOW, existingAccountEmails: new Set(accounts) });

function deps(over: Partial<ReprocessDeps> = {}) {
  const calls = { reissue: [] as string[], send: [] as string[], mark: [] as string[] };
  const d: ReprocessDeps = {
    emailConfigured: () => true,
    mintToken: () => ({ token: "t", hash: "a".repeat(64) }),
    reissue: vi.fn(async (id: string) => {
      calls.reissue.push(id);
      return "ok";
    }),
    buildLink: (locale, token) => `https://labourmarket.ai/${locale}/invite/${token}`,
    send: vi.fn(async (to: string) => {
      calls.send.push(to);
      return true;
    }),
    mark: vi.fn(async (id: string, outcome: string) => {
      calls.mark.push(`${id}:${outcome}`);
    }),
    resolveLocale: (l) => l ?? "en",
    ...over,
  };
  return { d, calls };
}

describe("who may receive a fresh link", () => {
  it("excludes every row the owner ruled out, and says why", () => {
    const s = select(
      [
        row({ externalSource: null }),
        row({ status: "accepted" }),
        row({ deliveryStatus: "sent" }),
        row({ consentGiven: false }),
        row({ expiresAt: "2026-10-27T11:59:00Z" }),
        row({ invitedEmail: null }),
        row({ invitedEmail: "qa.worker+x@labourmarket.ai" }),
        row({ invitedEmail: "member@mail.lt" }),
        row(),
      ],
      ["member@mail.lt"],
    );
    expect(s.eligible).toHaveLength(1);
    expect(s.excluded).toEqual({
      not_partner_referral: 1,
      not_pending: 1,
      already_sent: 1,
      no_consent: 1,
      expired: 1,
      no_address: 1,
      synthetic_address: 1,
      has_account: 1,
    });
  });

  it("one mail per address: duplicates collapse onto the newest referral", () => {
    const older = row({ invitedEmail: "Same@Mail.lt", createdAt: "2026-10-01T00:00:00Z" });
    const newer = row({ invitedEmail: "same@mail.lt", createdAt: "2026-10-20T00:00:00Z" });
    const s = select([older, newer]);
    expect(s.eligible.map((r) => r.id)).toEqual([newer.id]);
    expect(s.excluded.duplicate_address).toBe(1);
  });

  it("the soonest-expiring referrals come first", () => {
    const late = row({ expiresAt: "2026-11-25T00:00:00Z" });
    const soon = row({ expiresAt: "2026-10-29T00:00:00Z" });
    expect(select([late, soon]).eligible.map((r) => r.id)).toEqual([soon.id, late.id]);
  });
});

describe("sending", () => {
  it("the dry run reports a missing provider without sending anything (the SMTP check)", async () => {
    const { d, calls } = deps({ emailConfigured: () => false });
    const r = await reprocessExternalReferrals(select([row()]), {}, d);
    expect(r).toMatchObject({ outcome: "dry_run", emailConfigured: false, eligible: 1 });
    expect(calls.reissue).toEqual([]);
  });

  it("is a DRY RUN by default: nothing rotated, nothing sent", async () => {
    const { d, calls } = deps();
    const r = await reprocessExternalReferrals(select([row(), row()]), {}, d);
    expect(r.outcome).toBe("dry_run");
    expect(r.emailConfigured).toBe(true);
    expect(r.attempted).toBe(2);
    expect(calls.reissue).toEqual([]);
    expect(calls.send).toEqual([]);
  });

  it("refuses before rotating any token when no provider is configured", async () => {
    const { d, calls } = deps({ emailConfigured: () => false });
    const r = await reprocessExternalReferrals(select([row()]), { dryRun: false }, d);
    expect(r.outcome).toBe("email_not_configured");
    expect(r.emailConfigured).toBe(false);
    expect(calls.reissue).toEqual([]);
  });

  it("the control test sends exactly one referral, nothing else", async () => {
    const a = row();
    const b = row();
    const { d, calls } = deps();
    const r = await reprocessExternalReferrals(select([a, b]), { dryRun: false, onlyInvitationId: b.id }, d);
    expect(r).toMatchObject({ outcome: "done", attempted: 1, sent: 1 });
    expect(calls.reissue).toEqual([b.id]);
    expect(calls.mark).toEqual([`${b.id}:sent`]);
  });

  it("a control test for an ineligible id sends nothing", async () => {
    const { d, calls } = deps();
    const r = await reprocessExternalReferrals(select([row({ consentGiven: false })]), { dryRun: false, onlyInvitationId: "inv-x" }, d);
    expect(r.outcome).toBe("not_eligible");
    expect(calls.send).toEqual([]);
  });

  it(`never more than ${MAX_PER_RUN} per run, whatever limit is asked`, async () => {
    const rows = Array.from({ length: MAX_PER_RUN + 7 }, () => row());
    const { d, calls } = deps();
    const r = await reprocessExternalReferrals(select(rows), { dryRun: false, limit: 500 }, d);
    expect(r.attempted).toBe(MAX_PER_RUN);
    expect(calls.send).toHaveLength(MAX_PER_RUN);
  });

  it("a database refusal sends nothing for that row; a provider failure is recorded as such", async () => {
    const a = row();
    const b = row();
    const { d, calls } = deps({
      reissue: async (id) => (id === a.id ? "expired" : "ok"),
      send: async () => false,
    });
    const r = await reprocessExternalReferrals(select([a, b]), { dryRun: false }, d);
    expect(r).toMatchObject({ sent: 0, failed: 1, refused: { expired: 1 } });
    expect(calls.mark).toEqual([`${b.id}:delivery_failed`]);
  });
});
