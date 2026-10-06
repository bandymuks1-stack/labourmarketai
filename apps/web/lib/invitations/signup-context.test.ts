import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { invitationImpliesWorkerContext, inviteTokenFromNextPath } from "./model";

const TOKEN = "oMDhLafIeEWKWGcldMK-9TqbWb8g7pp9YkRt7wo6gac";

describe("inviteTokenFromNextPath - only the exact invite landing shape yields a token", () => {
  it("reads the token from /{locale}/invite/{token}", () => {
    expect(inviteTokenFromNextPath(`/nl/invite/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromNextPath(`/invite/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromNextPath(`/nl/invite/${TOKEN}/`)).toBe(TOKEN);
  });
  it("refuses everything else (a crafted next cannot name an arbitrary token source)", () => {
    for (const bad of [
      null, undefined, "", "/nl/dashboard", `/nl/invite/${TOKEN}?x=1`, `/nl/invite/${TOKEN}/extra`,
      `/nl/other/invite/${TOKEN}`, `//evil.test/invite/${TOKEN}`, "/nl/invite/short", `/nl/invite/${TOKEN}%2F..`,
      `https://x.test/nl/invite/${TOKEN}`,
    ]) {
      expect(inviteTokenFromNextPath(bad as string), String(bad)).toBeNull();
    }
  });
});

describe("invitationImpliesWorkerContext - narrow by construction", () => {
  it("an external-source referral of a person and an employee invitation imply a worker", () => {
    expect(invitationImpliesWorkerContext({ invitationType: "join_platform", externalSourceSlug: "nonstop" })).toBe(true);
    expect(invitationImpliesWorkerContext({ invitationType: "join_as_employee", externalSourceSlug: null })).toBe(true);
  });
  it("every genuinely ambiguous kind still shows the role picker", () => {
    for (const type of ["join_organization", "join_team", "collaborate_partner", "join_project", "invite_company", "invite_to_demand"]) {
      expect(invitationImpliesWorkerContext({ invitationType: type, externalSourceSlug: "nonstop" }), type).toBe(false);
    }
    // an open platform link with no source says nothing about who is arriving
    expect(invitationImpliesWorkerContext({ invitationType: "join_platform", externalSourceSlug: null })).toBe(false);
    expect(invitationImpliesWorkerContext({ invitationType: null, externalSourceSlug: null })).toBe(false);
  });
});

describe("wiring - the security invariant and consent boundaries stay where they were", () => {
  const WEB = join(__dirname, "..", "..");
  const read = (p: string) => readFileSync(join(WEB, p), "utf8");

  it("the signup read is service-role-only and writes nothing", () => {
    const mig = readFileSync(join(WEB, "..", "..", "supabase", "migrations", "20261006100500_invitation_signup_context_v1.sql"), "utf8");
    expect(mig).toMatch(/revoke all on function public\.get_invitation_signup_context_v1\(text\) from public, anon, authenticated;/);
    expect(mig).toMatch(/grant execute on function public\.get_invitation_signup_context_v1\(text\) to service_role;/);
    const body = mig.slice(mig.indexOf("create or replace function"), mig.indexOf("revoke all"));
    expect(body).not.toMatch(/\b(insert|update|delete)\b/i);
    // only a still-usable, addressed invitation yields the address
    for (const guard of ["status <> 'pending'", "revoked_at is not null", "expires_at <= now()", "use_count >= v_row.max_uses"]) {
      expect(body).toContain(guard);
    }
  });

  it("auto-accept is the canonical acceptance action, with no consent / country / discoverability side effects", () => {
    const act = read("lib/invitations/signup-accept-action.ts");
    expect(act).toMatch(/acceptInvitationAction/);
    for (const forbidden of [/grant_profile_discoverability|discoverab/i, /privacy_consent|partner_supply/i, /\.insert\(|\.update\(|\.upsert\(|\.rpc\(/, /createAdminClient/]) {
      expect(act, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("the signup form only auto-accepts for an addressed invitation, with the locked address, and never blocks onboarding on it", () => {
    const form = read("components/app/signup-form.tsx");
    expect(form).toMatch(/if \(invitation\) \{[\s\S]*acceptInvitationAfterSignup/);
    expect(form).toMatch(/readOnly=\{Boolean\(invitation\)\}/);
    expect(form).toMatch(/catch \(e\) \{\s*console\.error\("\[signup\] invitation auto-accept failed:"/);
    // the normal (non-invite) signup keeps the confirm-password rule
    expect(form).toMatch(/if \(!invitation && password !== confirm\)/);
  });

  it("the role step is skipped only when the invitation implies a worker (server-decided), and consents are untouched", () => {
    const page = read("app/[locale]/onboarding/page.tsx");
    expect(page).toMatch(/invitationImpliesWorkerContext\(/);
    expect(page).toMatch(/skipRoleStep=\{impliedWorker\}/);
    const wiz = read("components/app/onboarding-wizard.tsx");
    expect(wiz).toMatch(/skipRoleStep && defaultIntents\.length > 0 \? 2 : 1/);
  });
});
