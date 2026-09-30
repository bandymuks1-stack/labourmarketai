import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./communication-core", () => ({ createConversationCore: vi.fn() }));

import { planDirectContact } from "./direct-conversation-core";
import type { CommunicationCaller } from "./communication-core";

type Script = {
  sharedConversation?: boolean;
  managesProject?: boolean;
  assigned?: boolean;
  admin?: boolean;
};

/** A scripted client that answers exactly the reads the core makes. */
function caller(s: Script): CommunicationCaller {
  const supabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      const rows = (): unknown[] => {
        if (table === "conversation_participants") return s.sharedConversation ? [{ conversation_id: "c-1" }] : [];
        if (table === "conversations") return s.sharedConversation ? [{ id: "c-1" }] : [];
        if (table === "project_worker_assignments") return s.assigned ? [{ id: "a-1" }] : [];
        if (table === "profile_roles") return s.admin ? [{ role: "admin" }] : [];
        return [];
      };
      chain.single = async () => ({ data: { active_role: "company" }, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
      return chain;
    },
    async rpc(fn: string) {
      return fn === "can_manage_project" ? { data: s.managesProject === true, error: null } : { data: null, error: { message: "x" } };
    },
  } as unknown as CommunicationCaller["supabase"];
  return { supabase, userId: "me" };
}

describe("planDirectContact — the §8.1 gate for an explicit caller", () => {
  it("an existing shared thread is reused", async () => {
    expect(await planDirectContact(caller({ sharedConversation: true }), "them")).toEqual({
      kind: "existing",
      conversationId: "c-1",
      permission: "allowed_existing_conversation",
    });
  });

  it("manages the project AND the person is actively assigned → engagement", async () => {
    const p = await planDirectContact(caller({ managesProject: true, assigned: true }), "them", { projectId: "p-1" });
    expect(p).toEqual({ kind: "new", permission: "allowed_engagement" });
  });

  it("managing the project is not enough when the person is not on it", async () => {
    const p = await planDirectContact(caller({ managesProject: true, assigned: false }), "them", { projectId: "p-1" });
    expect(p).toEqual({ kind: "refused", permission: "no_permission" });
  });

  it("being assigned is not enough when the caller does not manage the project", async () => {
    const p = await planDirectContact(caller({ managesProject: false, assigned: true }), "them", { projectId: "p-1" });
    expect(p.kind).toBe("refused");
  });

  it("without a project, no relationship means no contact", async () => {
    expect((await planDirectContact(caller({}), "them")).kind).toBe("refused");
  });

  it("a platform admin keeps the separate, named admin state", async () => {
    expect(await planDirectContact(caller({ admin: true }), "them")).toEqual({ kind: "new", permission: "allowed_admin" });
  });

  it("never with oneself", async () => {
    expect((await planDirectContact(caller({ admin: true }), "me")).kind).toBe("refused");
  });
});

describe("one implementation: the web actions delegate to the shared core", () => {
  const actions = readFileSync(join(__dirname, "actions.ts"), "utf8");
  it("createConversation and sendMessage call the core; neither inserts itself", () => {
    expect(actions).toMatch(/createConversationCore\(\{ supabase, userId: user\.id \}, input\)/);
    expect(actions).toMatch(/sendMessageCore\(\{ supabase, userId: user\.id \}, input\)/);
    expect(actions).not.toMatch(/\.from\("conversation_messages"\)\s*\.insert/);
    expect(actions).not.toMatch(/\.from\("conversations"\)\s*\.insert/);
  });
});
