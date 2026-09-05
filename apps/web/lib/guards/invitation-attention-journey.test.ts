import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { INVITATIONS_ATTENTION_LIMIT } from "@/lib/invitations/model";
import { workerRespondInvitationSchema } from "@/lib/conversation/worker-schemas";
import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";
import { getConversationAction } from "@/lib/conversation/action-registry";

/**
 * INVITATION → the person's ATTENTION → accept in the chat over the ONE
 * dispatcher (owner contract 2026-09-04 §4D / §8; clarification §1a: the
 * attention item enters the SAME backbone the visual page uses).
 *
 * The journey: an authorised inviter sends an EXISTING canonical invitation
 * (network page / roster) → the invited person's opening brief says who
 * invited them → "mano kvietimai" lists them → accept runs the SAME accept
 * action the network page / dashboard card call → the row is persisted by the
 * SECURITY DEFINER RPC → the chat re-reads and the brief line disappears.
 *
 * Pins (what a refactor must not undo):
 *   1. ONE domain read (`lib/invitations/attention`) composed of the two
 *      EXISTING reads — the brief, the chat list and the confirmation-token
 *      fingerprint all answer from it; no chat-only query, no new table;
 *   2. the dispatcher asks that read for the fingerprint — it never queries
 *      (no `.rpc` / `.from` for invitations in dispatch.ts);
 *   3. the executor delegates to the two EXISTING accept actions and to
 *      nothing else; it reports `ok` only on a real accept;
 *   4. no decline is invented: the schema admits `accepted` only, because the
 *      canonical layer declines by mailed token alone;
 *   5. the read is bounded for display and the brief names the inviter only
 *      when known;
 *   6. the intent is registered, routed in the five active locales and copy
 *      exists in each.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const ATTENTION = read("lib/invitations/attention.ts");
const CHAT_READ = read("lib/conversation/invitations-chat.ts");
const BRIEF = read("lib/conversation/opening-brief.ts");
const DISPATCH = read("lib/conversation/dispatch.ts");
const EXECUTORS = read("lib/conversation/worker-executors.ts");
const CARD = read("components/app/conversation/worker-invitation-action.tsx");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");

describe("invitation attention journey — ONE read", () => {
  it("the domain read composes the two EXISTING canonical reads and adds no query of its own", () => {
    expect(ATTENTION).toMatch(/import \{ listInvitationsForMe \} from "@\/lib\/invitations\/network"/);
    expect(ATTENTION).toMatch(/import \{ listMyPendingWorkerInvitations \} from "@\/lib\/worker\/invitations"/);
    expect(ATTENTION).not.toMatch(/from\s+["']@\/lib\/supabase/);
    expect(ATTENTION).not.toMatch(/\.from\(|\.rpc\(/);
    expect(ATTENTION).toMatch(/["']server-only["']/);
  });

  it("the brief, the chat list and the fingerprint all answer from that ONE read", () => {
    expect(BRIEF).toMatch(/import \{ listInvitationsAddressedToMe \} from "@\/lib\/invitations\/attention"/);
    expect(BRIEF).not.toMatch(/listInvitationsForMe\(/);
    expect(CHAT_READ).toMatch(/import \{ listInvitationsAddressedToMe \} from "@\/lib\/invitations\/attention"/);
    expect(CHAT_READ).not.toMatch(/from\s+["']@\/lib\/supabase|\.from\(|\.rpc\(/);
    expect(DISPATCH).toMatch(/import \{ invitationStateFingerprint \} from "@\/lib\/invitations\/attention"/);
    expect(CHAT).toMatch(/loadInvitationsForChat\(\)/);
  });

  it("is bounded for display, and the brief counts the real total behind the cap", () => {
    expect(INVITATIONS_ATTENTION_LIMIT).toBeLessThanOrEqual(5);
    expect(ATTENTION).toMatch(/slice\(0, INVITATIONS_ATTENTION_LIMIT\)/);
    expect(BRIEF).toMatch(/count: inv\.total/);
  });
});

describe("invitation attention journey — ONE backbone", () => {
  it("the dispatcher asks the domain for the fingerprint; it never queries the invitation tables", () => {
    const block = DISPATCH.slice(DISPATCH.indexOf('actionId === "worker.respond-invitation"'), DISPATCH.indexOf('actionId === "worker.express-interest"'));
    expect(block).toMatch(/invitationStateFingerprint\(/);
    expect(block).not.toMatch(/\.rpc\(|\.from\(/);
    expect(DISPATCH).not.toMatch(/list_invitations_for_me_v1|company_worker_invitations|agency_worker_invitations/);
  });

  it("a failed or unreadable state never mints an acceptable token", () => {
    // The fingerprint must collapse every non-pending state — including a
    // read error — to something other than `pending`.
    expect(ATTENTION).toMatch(/return `invitation:\$\{all\.status\}`/);
    expect(ATTENTION).toMatch(/catch \{\s*return "invitation:error";/);
  });

  it("the executor delegates to the two EXISTING accept actions and reports ok only on a real accept", () => {
    const block = EXECUTORS.slice(EXECUTORS.indexOf('"worker.respond-invitation": async'), EXECUTORS.indexOf('"worker.express-interest": async'));
    expect(block).toMatch(/acceptInvitationByIdAction\(\{ invitationId: input\.invitationId, locale: ctx\.locale \}\)/);
    expect(block).toMatch(/acceptWorkerInvitationAction\(/);
    expect(block).toMatch(/if \(r\.outcome !== "accepted"\) return \{ ok: false/);
    expect(block).toMatch(/if \(r\.outcome !== "linked"\) return \{ ok: false/);
    // No third path: neither the accept cores nor any RPC is reached here.
    expect(EXECUTORS).not.toMatch(/accept(Company|Agency)WorkerInvitation\b|from\s+["']@\/lib\/worker\/invitations["']|\.rpc\s*\(/);
  });

  it("the action is registered as the strong tier over the network page, keyed to the worker", () => {
    const a = getConversationAction("worker.respond-invitation");
    expect(a).toBeDefined();
    expect(a?.confirmation).toBe("strong_irreversible");
    expect(a?.precondition).toBe("has_pending_invitation");
    expect(a?.advancedRoute).toBe("/dashboard/network");
    expect(a?.handler).toEqual({ kind: "server_action", ref: "acceptInvitationByIdAction" });
  });

  it("the chat card enters the backbone with a structured action — prepare, confirm token, dispatch", () => {
    expect(CARD).toMatch(/prepareConfirmationAction\("worker\.respond-invitation", input\)/);
    expect(CARD).toMatch(/dispatchWorkerAction\("worker\.respond-invitation", input, \{ locale, confirmationToken: token \}\)/);
    expect(CARD).not.toMatch(/from\s+["']@\/lib\/supabase|from\s+["']@\/lib\/invitations\/actions|from\s+["']@\/lib\/worker\//);
  });
});

describe("invitation attention journey — no invented decline", () => {
  it("the schema admits the ONE canonical in-app decision for each existing invitation system", () => {
    expect(workerRespondInvitationSchema.safeParse({ source: "invitation", invitationId: "2f7c4d1e-5a6b-4c3d-9e8f-0a1b2c3d4e5f", decision: "accepted" }).success).toBe(true);
    expect(workerRespondInvitationSchema.safeParse({ source: "company_roster", orgId: "2f7c4d1e-5a6b-4c3d-9e8f-0a1b2c3d4e5f", decision: "accepted" }).success).toBe(true);
    expect(workerRespondInvitationSchema.safeParse({ source: "agency_roster", orgId: "2f7c4d1e-5a6b-4c3d-9e8f-0a1b2c3d4e5f", decision: "accepted" }).success).toBe(true);
    expect(workerRespondInvitationSchema.safeParse({ source: "invitation", invitationId: "2f7c4d1e-5a6b-4c3d-9e8f-0a1b2c3d4e5f", decision: "declined" }).success).toBe(false);
    expect(workerRespondInvitationSchema.safeParse({ source: "invitation", invitationId: "not-a-uuid", decision: "accepted" }).success).toBe(false);
  });

  it("the card offers 'later' (leave it where it is), never a decline it cannot persist", () => {
    expect(CARD).toMatch(/setPhase\(\{ kind: "later" \}\)/);
    expect(CARD).not.toMatch(/decision: "declined"|declineInvitation/);
  });
});

describe("invitation attention journey — reachable by sentence, in five locales", () => {
  it("the intent is registered as a communication read with its own chat handler", () => {
    expect(INTENT_REGISTRY.invitations).toEqual({ domain: "communication", access: "read", handler: "invitations", ownTyping: false });
    expect(CHAT).toMatch(/invitations: \(\) => startInvitations\(\)/);
  });

  it("copy exists in the five routed locales; the brief line carries the inviter and the count", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const cat = JSON.parse(read(`messages/${locale}.json`));
      const chat = cat.conversation?.chat ?? {};
      for (const k of ["briefInvitations", "chipInvitations", "invitationSomeone", "invitationsIntro", "invitationsEmpty", "invAccept", "invLater", "invConfirmNote", "invDone", "invAlreadyAnswered"]) {
        expect(chat[k], `${locale} conversation.chat.${k}`).toBeTruthy();
      }
      expect(chat.briefInvitations).toContain("{who}");
      expect(chat.briefInvitations).toContain("{count");
      expect(cat.conversation?.actions?.worker?.respondInvitation?.label, `${locale} action label`).toBeTruthy();
    }
  });

  it("the brief names the inviter only when known — never an invented one", () => {
    expect(BRIEF).toMatch(/first\.organizationName \?\? first\.inviterName \?\? t\("invitationSomeone"\)/);
    expect(BRIEF).toMatch(/addChip\("invitations", t\("chipInvitations"\)\)/);
  });
});
