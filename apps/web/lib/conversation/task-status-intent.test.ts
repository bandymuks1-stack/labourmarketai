import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * WORK PERFORMED → RESULT (owner contract 2026-09-04 §14): a task moved to a
 * real status — by sentence ("užduotis sumontuoti pastolius atlikta") or from
 * the task row's own control on the tasks page. Both enter the ONE status
 * core (§5.5); the RPC re-checks creator / assignee / project manager, so the
 * WORKER who was given the task can close it from the same sentence.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const EXEC = read("lib/conversation/company-executors.ts");
const LOADER = read("lib/conversation/company-tasks.ts");
const CORE = read("lib/tasks/set-task-status-core.ts");
const PAGE_ACTIONS = read("lib/tasks/task-actions.ts");
const CHAT_ACTIONS = read("lib/tasks/task-chat-actions.ts");
const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;

describe("§14 a task moved to a real status, by sentence", () => {
  it.each([
    "Užduotis sumontuoti pastolius atlikta",
    "pradėjau užduotį pastoliai",
    "užduotis užstrigo",
    "Task install scaffolding is done",
    "Aufgabe Gerüst aufbauen erledigt",
    "Taak steiger opbouwen is klaar",
    "Задача смонтировать леса выполнена",
    "Zadanie montaż rusztowania wykonane",
  ])("%s → task-status", (text) => {
    expect(classifyIntent(text).intent).toBe("task-status");
  });

  it("adding a task, a stage's status and the project list keep their own intents", () => {
    expect(classifyIntent("pridėk užduotį projektui: sumontuoti pastolius").intent).toBe("add-task");
    expect(classifyIntent("Add a task: install scaffolding").intent).toBe("add-task");
    expect(classifyIntent("etapas pamatai baigtas").intent).toBe("stage-status");
    expect(classifyIntent("mano projektai").intent).toBe("projects");
  });

  it("is a write over the one dispatcher; the row lets the assignee through and the RPC keeps row authority; cancel stays a page decision", () => {
    expect(INTENT_REGISTRY["task-status"]).toMatchObject({ domain: "project", access: "write", handler: "taskStatus" });
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "company.update-task-status");
    expect(row).toMatchObject({ subject: "company", confirmation: "reversible_write", precondition: "authenticated" });
    expect(row?.allowedRoles).toEqual(["company", "agency", "worker"]);
    expect(row?.handler).toEqual({ kind: "server_action", ref: "setWorkTaskStatusAction" });
    const schema = COMPANY_ACTION_SCHEMAS["company.update-task-status"];
    for (const status of ["in_progress", "blocked", "done"]) {
      expect(schema.safeParse({ taskId: "11111111-1111-4111-8111-111111111111", status }).success, status).toBe(true);
    }
    expect(schema.safeParse({ taskId: "11111111-1111-4111-8111-111111111111", status: "cancelled" }).success).toBe(false);
    expect(schema.safeParse({ taskId: "11111111-1111-4111-8111-111111111111", status: "todo" }).success).toBe(false);
    expect(schema.safeParse({ taskId: "x", status: "done" }).success).toBe(false);
  });

  it("ONE status core (§5.5): the page's action and the chat's action both call it; only the core names the RPCs", () => {
    expect(CORE).toContain('"set_work_task_status_v2"');
    expect(CORE).toContain('"set_work_task_status_v1"');
    expect(PAGE_ACTIONS).toContain("setWorkTaskStatusCore(supabase, taskId, status)");
    expect(PAGE_ACTIONS).not.toContain('rpc("set_work_task_status_v2"');
    // the page's ONLY remaining v1 status call is reopen's pre-apply fallback (p_status: "todo")
    expect(PAGE_ACTIONS.match(/rpc\("set_work_task_status_v1"/g)?.length ?? 0).toBe(1);
    expect(CHAT_ACTIONS).toContain("setWorkTaskStatusCore(supabase, input.taskId, input.status)");
    expect(EXEC).toContain("setWorkTaskStatusForChatAction({ taskId: input.taskId, status: input.status })");
    expect(EXEC).not.toMatch(/\.rpc\(|\.from\(/);
  });

  it("the read composes the tasks page's own reads — mine and the company's projects' — and writes nothing", () => {
    expect(LOADER.startsWith('"use server";')).toBe(true);
    expect(LOADER).toContain("listMyTasks()");
    expect(LOADER).toContain("listProjectTasks(p.projectId)");
    expect(LOADER).toContain("loadProjectsForResult()");
    expect(LOADER).not.toMatch(/\.rpc\(|\.from\(/);
  });

  it("sentence and chip converge on runTaskStatus: token-less reversible dispatch; a company re-opens the project, a person is offered the journal", () => {
    const at = CHAT.indexOf('prepareConfirmationAction("company.update-task-status", input)');
    expect(at).toBeGreaterThan(-1);
    const flow = CHAT.slice(at, at + 1600);
    expect(flow.slice(0, 900)).toContain("no_confirmation_needed");
    expect(flow).toContain('dispatchWorkerAction("company.update-task-status", input');
    expect(flow).toContain("selectProjectRef.current(projectId)");
    expect(flow).toContain('{ id: "logwork", label: labels.chipLogWork }');
    expect(CHAT).toContain('id: `task:${t.projectId ?? "-"}:${t.taskId}:${status}`');
    expect(CHAT).toContain('chip.id.startsWith("task:")');
    expect(CHAT).toMatch(/taskStatus: \(\) => startTaskStatus\(text\)/);
  });

  it("every catalogue carries real copy for the task lines and the action", () => {
    const keys = ["taskAsk", "taskNotFound", "taskNone", "taskUnavailable", "taskDone", "taskStarted", "taskBlocked", "taskFailed", "chipTaskPrefix"];
    type Doc = { conversation: { chat: Record<string, string>; actions: { company: Record<string, { label: string; description: string }> } } };
    const en = JSON.parse(read("messages/en.json")) as Doc;
    for (const loc of LOCALES) {
      const doc = JSON.parse(read(`messages/${loc}.json`)) as Doc;
      for (const k of keys) {
        const v = doc.conversation.chat[k];
        expect(typeof v, `${loc}.${k}`).toBe("string");
        expect(v.startsWith("[EN]"), `${loc}.${k}`).toBe(false);
        if (loc !== "en") expect(v, `${loc}.${k} identical to English`).not.toBe(en.conversation.chat[k]);
      }
      const action = doc.conversation.actions.company.updateTaskStatus;
      expect(action.label.length, `${loc} action label`).toBeGreaterThan(3);
      expect(action.description.length, `${loc} action description`).toBeGreaterThan(10);
    }
  });
});
