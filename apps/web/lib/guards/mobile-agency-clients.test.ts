/**
 * GUARD — the agency bridge's FIRST step from the phone, through the web
 * chat's own capabilities (owner order 2026-11-16: one shared client, no
 * parallel backend): an agency invites a client company; that company answers
 * the invitation and shares its own needs. Each write is prepare → confirm
 * with the prepare's own input, and every line is the web's own wording.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

describe("mobile agency ↔ client connection", () => {
  const invite = read("apps/mobile/src/screens/agency-invite-client.tsx");
  const client = read("apps/mobile/src/screens/client-agencies.tsx");

  it("uses the canonical capabilities only", () => {
    expect(invite).toContain('name: "agency.invite-client.prepare"');
    expect(invite).toContain('name: "agency.invite-client.confirm"');
    expect(invite).toContain("args: { email: email.trim() },");
    expect(client).toContain('useCapability<ClientAgenciesData>("client.agency_connections.get", NO_ARGS)');
    expect(client).toContain('accept: "company.accept-connection"');
    expect(client).toContain('decline: "company.decline-connection"');
    expect(client).toContain('share: "company.share-request"');
    for (const src of [invite, client]) expect(src).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("never sends a company id: the active workspace's company is the agency or the client", () => {
    for (const src of [invite, client]) expect(src).not.toMatch(/agencyCompanyId|clientCompanyId/);
  });

  it("confirms with the prepare's own input and token", () => {
    for (const src of [invite, client]) {
      expect(src).toContain("args: { input: prepared.input, confirmationToken: prepared.confirmationToken },");
    }
  });

  it("the agency invites from its own station; the client answers from an organization station", () => {
    expect(read("apps/mobile/src/screens/agency.tsx")).toContain("<AgencyInviteClient />");
    const today = read("apps/mobile/app/(shell)/today.tsx");
    const start = today.indexOf("{personal ? null : (");
    expect(today.slice(start, today.indexOf("</>", start))).toContain('testID="today-open-agencies"');
  });

  it("uses the web's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const web = JSON.parse(read(`apps/web/messages/${locale}.json`));
      const c = web.conversation;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["agencyInvite.title", c.actions.agency.inviteClient.label],
        ["agencyInvite.email", c.forms.fields.clientEmail],
        ["agencyInvite.emailPlaceholder", c.forms.fields.clientEmailPlaceholder],
        ["agencyInvite.done", c.chat.agencyInviteClientDone],
        ["clientBridge.title", web.clientBridge.title],
        ["clientBridge.invitesIntro", c.chat.clientBridgeInvitesIntro],
        ["clientBridge.none", c.chat.clientBridgeNone],
        ["clientBridge.shareIntro", c.chat.clientBridgeShareIntro],
        ["clientBridge.accept", c.chat.chipConnectionAccept],
        ["clientBridge.decline", c.chat.chipConnectionDecline],
        ["clientBridge.share", c.chat.chipShareRequest],
        ["clientBridge.accepted", c.chat.connectionAccepted],
        ["clientBridge.declined", c.chat.connectionDeclined],
        ["clientBridge.shared", c.chat.requestShared],
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });
});
