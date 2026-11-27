import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MSG-3 (docs/audits/DUPLICATION_AUDIT.md): a work instruction and the worker's
 * clarification reply are messages like any other, so the other side is told a
 * new message arrived — through the ONE emitter every message uses
 * (communication-core → emitMessageReceivedNotifications), never a second one.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const ACTIONS = read("lib/instructions/actions.ts");
const CORE = read("lib/communication/communication-core.ts");

function bodyOf(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function ", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("work instructions send the new-message notification (MSG-3)", () => {
  it("the core exposes the same notify path the composer uses, and nothing else", () => {
    const notify = bodyOf(CORE, "notifyNewMessageRecipients");
    expect(notify).toMatch(/await notifyOtherParticipants\(supabase, authorId, conversationId\);/);
    expect((ACTIONS.match(/emitMessageReceivedNotifications/g) ?? []).length).toBe(0);
  });

  it("the instruction is notified after the RPC succeeds, in the message's own thread", () => {
    const send = bodyOf(ACTIONS, "sendWorkInstructionAction");
    const rpc = send.indexOf('rpc("send_work_instruction"');
    const notified = send.indexOf("await notifyNewMessageRecipients(supabase, user.id, conversationId)");
    expect(rpc).toBeGreaterThan(-1);
    expect(notified).toBeGreaterThan(rpc);
    expect(send.indexOf("if (error)")).toBeLessThan(notified);
    expect(send).toMatch(/\.from\("conversation_messages"\)\s+\.select\("conversation_id"\)\s+\.eq\("id", messageId\)/);
  });

  it("the worker's clarification reply is notified after its insert", () => {
    const reply = bodyOf(ACTIONS, "requestInstructionClarificationAction");
    const insert = reply.indexOf('.from("conversation_messages")');
    const notified = reply.indexOf("await notifyNewMessageRecipients(supabase, user.id, conversationId)");
    expect(insert).toBeGreaterThan(-1);
    expect(notified).toBeGreaterThan(reply.lastIndexOf("if (error)"));
  });

  it("a direct hire on a project can be instructed there: the picker reads project assignments too", () => {
    const lib = read("lib/instructions/instructions.ts");
    const page = read("app/[locale]/dashboard/instructions/page.tsx");
    const composer = read("components/app/manager-instruction-composer.tsx");
    expect(lib).toMatch(/export async function listProjectAssignedWorkers\(/);
    expect(lib).toMatch(/readActiveAssignmentRowsForProjects\(supabase, projectIds\)/);
    expect(page).toMatch(/mergeInstructionRecipients\(\s+roster,\s+await listProjectAssignedWorkers\(projects\.map\(\(p\) => p\.id\)\),/);
    // A project-only worker is never offered the team-level send, which the database refuses.
    expect(composer).toMatch(/\{projectOnly \? null : <option value="">\{labels\.teamLevelOption\}<\/option>\}/);
  });
});
