import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { SPINE_SIGNALS } from "@/lib/notifications/spine-signals";
import { getDashboardModule } from "@/lib/dashboard/dashboard-module-registry";
import { CONVERSATION_ACTIONS } from "@/lib/conversation/action-registry";
import { AGENCY_CLIENT_PROPOSED_ROLE } from "@/lib/invitations/model";

/**
 * AGENCY → CLIENT INVITATION IS DELIVERED; AGENCY ↔ CLIENT CAN MESSAGE
 * (2026-09-24) — permanent guard.
 *
 * Root cause pinned: `create_agency_client_connection_v1` only INSERTS a row
 * keyed on the client's e-mail; nothing reached that e-mail, and no contact
 * permission existed for an active connection. The fix rides on what
 * exists: the ONE invitation primitive (lib/invitations) delivers, the ONE
 * consent path (`accept_agency_client_connection_v1`) still decides, the
 * spine carries three STATE-DERIVED signals, and `allowed_agency_connection`
 * is a grant-only permission verified server-side. This guard keeps every
 * one of those from quietly becoming a second system or a silent failure.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const stripTs = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function walk(relDir: string): string[] {
  const out: string[] = [];
  const stack = [relDir];
  while (stack.length > 0) {
    const rel = stack.pop() as string;
    for (const name of readdirSync(join(APP, rel))) {
      const childRel = `${rel}/${name}`;
      if (statSync(join(APP, childRel)).isDirectory()) {
        stack.push(childRel);
        continue;
      }
      if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(childRel);
    }
  }
  return out;
}

const ACTIONS = stripTs(read("lib/agency/bridge-actions.ts"));
const READS = stripTs(read("lib/agency/bridge-read.ts"));
const CONVERSATION = stripTs(read("lib/agency/bridge-conversation.ts"));
const AGENCY_SECTION = stripTs(read("components/app/agency-bridge-section.tsx"));
const CLIENT_SECTION = stripTs(read("components/app/client-agency-bridge-section.tsx"));
const INVITE_PAGE = read("app/[locale]/invite/[token]/page.tsx");

// ── 1. Delivery rides on the ONE invitation primitive ─────────────────────

describe("1. the client invitation is delivered through the one invitation primitive", () => {
  it("the invite action creates an invite_company invitation marked agency_client, AFTER the connection RPC", () => {
    expect(ACTIONS).toMatch(/from "@\/lib\/invitations\/actions"/);
    expect(ACTIONS).toMatch(/createShareableInvitationAction\(\{/);
    expect(ACTIONS).toMatch(/invitationType: "invite_company"/);
    expect(ACTIONS).toMatch(/proposedRole: AGENCY_CLIENT_PROPOSED_ROLE/);
    const rpc = ACTIONS.indexOf('rpc("create_agency_client_connection_v1"');
    const deliver = ACTIONS.indexOf("deliverClientInvitation(email.value");
    expect(rpc).toBeGreaterThan(-1);
    expect(deliver).toBeGreaterThan(rpc);
    // The marker is the closed slug from the model, never a loose string.
    expect(AGENCY_CLIENT_PROPOSED_ROLE).toBe("agency_client");
  });

  it("the invitation expires with the connection (14 days, migration 20260723180000 default)", () => {
    expect(ACTIONS).toMatch(/expiresInDays: 14/);
    expect(ACTIONS).toMatch(/maxUses: 1/);
  });

  it("a fresh link is the primitive's own rotate path — never a second invitation row", () => {
    expect(ACTIONS).toMatch(/resendInvitationAction\(\{/);
    expect(ACTIONS).toMatch(/invitationType: "invite_company",\s*\}\)/);
  });

  it("NEGATIVE: the bridge never writes or reads the invitations table itself", () => {
    for (const src of [ACTIONS, READS, CONVERSATION, AGENCY_SECTION, CLIENT_SECTION]) {
      expect(src).not.toMatch(/from\("invitations"\)/);
      expect(src).not.toMatch(/\.rpc\("create_invitation_v[12]"/);
      expect(src).not.toMatch(/\.rpc\("resend_invitation_v1"/);
      expect(src).not.toMatch(/createAdminClient|admin\.from\(/);
    }
  });

  it("NEGATIVE: nothing under lib/invitations or lib/agency touches `invitations` through the admin client", () => {
    // service_role holds NO table grant on `invitations`; the two modules
    // that hold an admin client call SECURITY DEFINER RPCs only.
    const ADMIN_RPC_ONLY = new Set([
      "lib/invitations/public-preview.ts",
      "lib/invitations/external-referral-receive.ts",
    ]);
    for (const rel of [...walk("lib/invitations"), ...walk("lib/agency")]) {
      const src = stripTs(read(rel));
      expect(src, rel).not.toMatch(/admin\.from\(/);
      if (/createAdminClient/.test(src)) {
        expect(ADMIN_RPC_ONLY.has(rel), `${rel} holds an admin client`).toBe(true);
        expect(src, rel).not.toMatch(/\.from\(/);
      }
    }
  });

  it("the sent-list read carries proposed_role so the door pairs invitation ↔ connection by address", () => {
    expect(read("lib/invitations/network.ts")).toMatch(/proposed_role/);
    expect(READS).toMatch(/i\.proposedRole === AGENCY_CLIENT_PROPOSED_ROLE/);
    expect(READS).toMatch(/i\.invitationType === "invite_company"/);
  });

  it("the delivery result is stated in the primitive's own outcome words; `created` is never worded as sent", () => {
    expect(AGENCY_SECTION).toMatch(/data-testid="agency-bridge-delivery"/);
    expect(AGENCY_SECTION).toMatch(/data-testid="agency-bridge-copy-link"/);
    for (const loc of activeLocales) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        agencyBridge: Record<string, string>;
        network: { invite: { outcomes: Record<string, string> } };
      };
      for (const key of [
        "deliveryHeading",
        "deliveryCreated",
        "deliverySent",
        "deliveryFailed",
        "deliveryDuplicate",
        "deliveryRefused",
        "deliveryUnavailable",
        "noInvitationYet",
        "getLink",
        "newLink",
        "messageButton",
      ]) {
        expect(msgs.agencyBridge[key]?.trim().length, `${loc} agencyBridge.${key}`).toBeGreaterThan(0);
      }
      // The "not e-mailed" state must not borrow the "sent" word.
      const sentWord = msgs.network.invite.outcomes.sent.toLowerCase();
      expect(msgs.agencyBridge.deliveryCreated.toLowerCase(), `${loc} deliveryCreated`).not.toBe(sentWord);
    }
    // The label reader resolves the outcome words from the primitive's namespace.
    const labels = stripTs(read("lib/company/company-section-labels.ts"));
    expect(labels).toMatch(/getTranslations\("network\.invite"\)/);
    expect(labels).toMatch(/outcomes\.\$\{k\}/);
  });
});

// ── 2. Acceptance: the truthful addressee ─────────────────────────────────

describe("2. the invite page lands the person on the connection and tells the truth about the addressee", () => {
  it("the mismatch notice lives ONLY in the signed-in branch and masks the address", () => {
    const anon = INVITE_PAGE.slice(
      INVITE_PAGE.indexOf("if (!user) {"),
      INVITE_PAGE.indexOf("// Signed in:"),
    );
    expect(anon).not.toMatch(/addressedToOther|maskEmail|invited_email/);
    const signedIn = INVITE_PAGE.slice(INVITE_PAGE.indexOf("// Signed in:"));
    expect(signedIn).toMatch(/maskEmail\(invitedAddress\)/);
    expect(signedIn).toMatch(/data-testid="invite-addressed-to-other"/);
    expect(signedIn).toMatch(/data-testid="invite-switch-account"/);
    // No accept / decline form is offered under a mismatched account.
    const mismatch = signedIn.slice(
      signedIn.indexOf("addressedToOther ? ("),
      signedIn.indexOf(") : (", signedIn.indexOf("addressedToOther ? (")),
    );
    expect(mismatch).not.toMatch(/acceptInviteFormAction|declineInviteFormAction/);
  });

  it("the marker is localized on the page — the slug never renders raw", () => {
    expect(INVITE_PAGE).toMatch(/agencyClient \? \(/);
    expect(INVITE_PAGE).toMatch(/data-testid="invite-agency-client"/);
    expect(INVITE_PAGE).toMatch(/t\("agencyClientNext"\)/);
  });

  it("acceptance lands on the partners door: the form carries the marker, the action routes on it", () => {
    expect(INVITE_PAGE).toMatch(
      /\{agencyClient && \(\s*<input type="hidden" name="proposedRole" value=\{AGENCY_CLIENT_PROPOSED_ROLE\} \/>/,
    );
    const action = stripTs(read("lib/invitations/invite-page-actions.ts"));
    expect(action).toMatch(/proposedRole,\s*\}\)/);
    // The partners door states what just happened and what is still to do.
    const partners = read("app/[locale]/dashboard/company/partners/page.tsx");
    expect(partners).toMatch(/data-testid="company-partners-invitation-accepted"/);
    expect(partners).toMatch(/t\("invitationAccepted"\)/);
  });

  it("every active locale carries the invite-page and partners copy", () => {
    for (const loc of activeLocales) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        network: { invitePage: Record<string, string> };
        organizationDoors: { pages: { partners: Record<string, string> } };
        clientBridge: Record<string, string>;
      };
      for (const key of ["agencyClient", "agencyClientNext", "addressedToOther", "switchAccount"]) {
        expect(msgs.network.invitePage[key]?.trim().length, `${loc} invitePage.${key}`).toBeGreaterThan(0);
      }
      expect(msgs.network.invitePage.addressedToOther).toContain("{email}");
      expect(msgs.organizationDoors.pages.partners.invitationAccepted?.trim().length, loc).toBeGreaterThan(0);
      expect(msgs.clientBridge.messageButton?.trim().length, loc).toBeGreaterThan(0);
    }
  });
});

// ── 3. The door opens on the merged read ──────────────────────────────────

describe("3. the partners door opens on the merged bridge read", () => {
  it("organization-doors asks listMyClientBridgeConnections for THIS company, never the e-mail-only read", () => {
    const doors = stripTs(read("lib/company/organization-doors.ts"));
    expect(doors).toMatch(/listMyClientBridgeConnections\(ctx\.companyId\)/);
    expect(doors).not.toMatch(/listMyConnectionInvites\(/);
  });
});

// ── 4. Spine: three state-derived signals ────────────────────────────────

describe("4. the bridge's spine signals are state-derived, mapped and localized", () => {
  const IDS = [
    "pending-connection-invites",
    "shared-requests-awaiting-offer",
    "open-candidate-offers",
  ] as const;

  it("exist, route to the door whose action clears them, and badge no primary tab", () => {
    const byId = new Map(SPINE_SIGNALS.map((s) => [s.id, s]));
    expect(byId.get("pending-connection-invites")?.href).toBe("/dashboard/company/partners");
    expect(byId.get("shared-requests-awaiting-offer")?.href).toBe("/dashboard/company/partners");
    expect(byId.get("open-candidate-offers")?.href).toBe("/dashboard/company/scouting");
    for (const id of IDS) expect(byId.get(id)?.featureKey, id).toBeUndefined();
  });

  it("the company module declares exactly them (one card carries the count)", () => {
    expect(getDashboardModule("company").attentionSignalIds).toEqual([...IDS]);
  });

  it("NEGATIVE: offer DECISIONS are not a derived count — no seen model, a terminal state never clears", () => {
    expect(SPINE_SIGNALS.some((s) => /decision/i.test(s.id) || /decision/i.test(s.type))).toBe(false);
  });

  it("the counts come from the bridge reads, side-gated by the active workspace company", () => {
    expect(read("lib/notifications/spine.ts")).toMatch(/getBridgeSpineCounts\(\)/);
    expect(READS).toMatch(/companyType === "staffing_agency"/);
    expect(READS).toMatch(/countSharesAwaitingOffer\(shared, progress\)/);
    expect(READS).toMatch(/countPendingConnectionInvites\(invites\)/);
    expect(READS).toMatch(/countOpenCandidateOffersForClient\(company\.row\.id\)/);
    // A head count on the client's own offers, never rows.
    expect(READS).toMatch(/\.eq\("client_company_id", clientCompanyId\)\s*\.eq\("status", "offered"\)/);
  });

  it("every active locale carries the type AND the readSemantics copy", () => {
    for (const loc of activeLocales) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        auth: { notifications: { types: Record<string, string> } };
        activityCentre: { readSemantics: Record<string, string> };
      };
      for (const type of ["pending_connection_invites", "shared_requests_awaiting_offer", "open_candidate_offers"]) {
        expect(msgs.auth.notifications.types[type]?.trim().length, `${loc} types.${type}`).toBeGreaterThan(0);
        expect(msgs.activityCentre.readSemantics[type]?.trim().length, `${loc} readSemantics.${type}`).toBeGreaterThan(0);
      }
    }
  });
});

// ── 5. Messaging: grant-only, gate first ──────────────────────────────────

describe("5. agency ↔ client messaging is a server-verified grant", () => {
  it("gate order: active connection + caller's side verified BEFORE the grant is passed", () => {
    const gate = CONVERSATION.indexOf('evaluateAgencyConnectionContact(facts) !== "allowed"');
    const grant = CONVERSATION.indexOf('"allowed_agency_connection"');
    expect(gate).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(gate);
    // The side comes from the membership-validated employer context, not a field.
    expect(CONVERSATION).toMatch(/resolveEmployerCompanyContext\(\)/);
    expect(CONVERSATION).toMatch(/callerCompanyId: ctx!\.companyId/);
    expect(CONVERSATION).not.toMatch(/formData\.get\("companyId"\)|formData\.get\("agencyCompanyId"\)/);
    // The counterpart is the other side's consenting person.
    expect(CONVERSATION).toMatch(/side === "agency" \? connection!\.accepted_by : side === "client" \? connection!\.invited_by : null/);
  });

  it("no counterpart profile id reaches the client; the action redirects", () => {
    expect(read("lib/agency/bridge-conversation.ts")).toMatch(/^"use server";/);
    expect(CONVERSATION).toMatch(/Promise<void>/);
    expect(CONVERSATION).toMatch(/notice=cannot_open/);
  });

  it("both sections offer the message button on ACTIVE connections only", () => {
    expect(AGENCY_SECTION).toMatch(
      /c\.status === "active" && \([\s\S]{0,600}openAgencyConnectionConversationAction/,
    );
    const invitesBlock = CLIENT_SECTION.slice(
      CLIENT_SECTION.indexOf("client-bridge-invite-row"),
      CLIENT_SECTION.indexOf("client-bridge-active-row"),
    );
    expect(invitesBlock).not.toMatch(/openAgencyConnectionConversationAction/);
    const activeBlock = CLIENT_SECTION.slice(CLIENT_SECTION.indexOf("client-bridge-active-row"));
    expect(activeBlock).toMatch(/openAgencyConnectionConversationAction/);
  });
});

// ── 6. Failures are not silent ────────────────────────────────────────────

describe("6. no bridge failure is silent", () => {
  it("the agency section reads the revoke, withdraw and link states", () => {
    expect(AGENCY_SECTION).toMatch(/const \[revokeState, revokeAction\]/);
    expect(AGENCY_SECTION).toMatch(/const \[withdrawState, withdrawAction\]/);
    expect(AGENCY_SECTION).toMatch(
      /\[inviteState, offerState, revokeState, withdrawState, linkState\]\.some\(failed\)/,
    );
    expect(AGENCY_SECTION).toMatch(/data-testid="agency-bridge-error"/);
  });

  it("UNKNOWN is not 'no invitation': the per-row delivery state renders only from an ok read", () => {
    expect(AGENCY_SECTION).toMatch(/deliveries\.kind === "ok" \? pendingDeliveryByEmail\(deliveries\.rows\) : null/);
    expect(AGENCY_SECTION).toMatch(/pendingByEmail !== null &&/);
  });
});

// ── 7. The agency's chat actions point at the relationship door ──────────

describe("7. agency chat actions route to the relationship door", () => {
  it("review-clients, invite-client and propose-candidate advance to /dashboard/company/partners", () => {
    for (const id of ["agency.review-clients", "agency.invite-client", "agency.propose-candidate"]) {
      const a = CONVERSATION_ACTIONS.find((x) => x.id === id);
      expect(a?.advancedRoute, id).toBe("/dashboard/company/partners");
    }
  });
});
