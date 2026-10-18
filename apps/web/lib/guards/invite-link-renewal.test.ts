import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Invite links while e-mail is off (owner programme 2026-10-12, P0 brigade
 * formation). The raw token is never stored, so the link the inviter was shown
 * is the ONLY delivery. Two ways it used to be lost:
 *
 *   1. a second brigade invite to the same person answered "already invited"
 *      with no link — the owner had nothing left to hand over;
 *   2. "Send again" on an invitation that was never e-mailed silently minted a
 *      new token and killed the link already handed over, under a label that
 *      promised a re-send.
 */
const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

describe("invite link renewal", () => {
  const action = web("lib/company/team-brigade-actions.ts");

  it("a duplicate brigade invite re-issues the same invitation through the canonical resend", () => {
    expect(action).toMatch(/case "duplicate_pending": \{[\s\S]*renewPendingTeamInviteLink/);
    expect(action).toMatch(/resendInvitationAction\(\{[\s\S]*invitationType: "join_team"/);
    // own invitation only: the read runs as the caller (RLS inviter-or-admin)
    expect(action).not.toMatch(/createAdminClient|service_role/);
    expect(action).toMatch(/linkRenewed: true/);
  });

  it("the sent list says 'new link' unless the invitation really was e-mailed", () => {
    const list = web("components/app/invitation-list.tsx");
    expect(list).toMatch(/row\.deliveryStatus === "sent" \? t\("resend"\) : t\("newLink"\)/);
    expect(list).toMatch(/t\("newLinkHint"\)/);
  });

  it("every catalogue that carries the namespaces carries the new copy", () => {
    for (const locale of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const text = web(`messages/${locale}.json`);
      expect(text, locale).toMatch(/"alreadyInvitedNewLink": "[^"]+"/);
      expect(text, locale).toMatch(/"newLink": "[^"]+"/);
      expect(text, locale).toMatch(/"newLinkHint": "[^"]+"/);
    }
  });
});
