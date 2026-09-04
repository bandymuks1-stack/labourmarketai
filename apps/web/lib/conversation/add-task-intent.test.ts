import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { companyCreateTaskForm } from "./company-forms";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";
import { pinRefForSentence } from "@/lib/workspace/pin-usage-from-intent";

/**
 * PROJECT → WORK (owner contract 2026-09-04 §11): a work package on the
 * company's project, by sentence, through THE ONE task create — the core
 * both the tasks page's form and the chat insert through.
 */
describe("a work package by sentence", () => {
  it.each([
    "Pridėk užduotį projektui: sumontuoti pastolius",
    "nauja užduotis: išvalyti aikštelę iki spalio 3",
    "Add a task to the project: erect the scaffold",
    "new task: clean the site",
    "Nieuwe taak voor het project: steiger opbouwen",
    "Neue Aufgabe für das Projekt: Gerüst aufbauen",
    "Добавь задачу в проект: собрать леса",
  ])("%s → add-task", (text) => {
    expect(classifyIntent(text).intent).toBe("add-task");
  });

  it("creating a project and listing projects keep their intents", () => {
    expect(classifyIntent("sukurk projektą Vilniuje").intent).toBe("create-project");
    expect(classifyIntent("mano projektai").intent).toBe("projects");
  });

  it("is a write intent over the one dispatcher; the row is anchored to the tasks screen", () => {
    expect(INTENT_REGISTRY["add-task"]).toMatchObject({ domain: "project", access: "write", handler: "addTask" });
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "company.create-task");
    expect(row).toMatchObject({ subject: "company", confirmation: "reversible_write", precondition: "has_company", advancedRoute: "/dashboard/tasks" });
    expect(row?.handler).toEqual({ kind: "server_action", ref: "createWorkTaskAction" });
    const schema = COMPANY_ACTION_SCHEMAS["company.create-task"];
    expect(schema.safeParse({ title: "Sumontuoti pastolius", projectId: "11111111-1111-4111-8111-111111111111", dueDate: "2026-10-03" }).success).toBe(true);
    expect(schema.safeParse({ title: "ab" }).success).toBe(false);
    expect(schema.safeParse({ title: "Sumontuoti", priority: "urgent" }).success).toBe(false);
    expect(pinRefForSentence("add-task", "company")).toBe("f:company.create-task");
  });

  it("the form is BUILT from the company's real projects and the closed priority set", () => {
    const form = companyCreateTaskForm([{ value: "11111111-1111-4111-8111-111111111111", label: "E2E objektas" }]);
    expect(form.fields.map((f) => f.name)).toEqual(["title", "projectId", "dueDate", "priority"]);
    const project = form.fields[1];
    expect(project.kind === "select" && project.options.map((o) => o.value)).toEqual(["", "11111111-1111-4111-8111-111111111111"]);
    expect(form.build({ title: "Sumontuoti pastolius", projectId: "11111111-1111-4111-8111-111111111111", dueDate: "2026-10-03", priority: "" })).toEqual({ title: "Sumontuoti pastolius", projectId: "11111111-1111-4111-8111-111111111111", dueDate: "2026-10-03", priority: "normal" });
  });

  it("ONE task create: the page action and the chat action both insert through the core", () => {
    const page = readFileSync(join(__dirname, "..", "tasks", "task-actions.ts"), "utf8");
    const chat = readFileSync(join(__dirname, "..", "tasks", "task-chat-actions.ts"), "utf8");
    const core = readFileSync(join(__dirname, "..", "tasks", "create-task-core.ts"), "utf8");
    expect(page).toContain("const result = await createWorkTaskCore(supabase, user!.id, {");
    expect(page).not.toContain('.rpc("create_work_task_v2"');
    expect(chat.startsWith('"use server";')).toBe(true);
    expect(chat).toContain("createWorkTaskCore(supabase, user.id, input)");
    expect(core).toContain('.rpc("create_work_task_v2"');
    expect(core).toContain('.rpc("create_work_task_v1"');
    expect(core).toContain("await emitWorkTaskAssignedNotification(outcome, userId);");
    const exec = readFileSync(join(__dirname, "company-executors.ts"), "utf8");
    expect(exec).toContain("createWorkTaskForChatAction({");
    expect(exec).not.toMatch(/\.rpc\(|\.from\(/);
  });

  it("the chat pre-fills from the sentence and re-opens the project so the pulse shows the task", () => {
    const CHAT = readFileSync(join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
    expect(CHAT).toContain("addTask: () => startCreateTask(text)");
    expect(CHAT).toContain("companyCreateTaskForm(projects)");
    expect(CHAT).toContain("parseEndDate(sentence, todayIso(), null) ?? parseStartDate(sentence, todayIso())");
    expect(CHAT).toContain("if (projectId) selectProjectRef.current(projectId);");
  });

  it("copy exists in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const cat = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8"));
      expect(cat.conversation.actions.company.createTask.label).toBeTypeOf("string");
      for (const key of ["taskTitle", "taskTitlePlaceholder", "taskProject", "taskDue", "taskPriority"]) expect(cat.conversation.forms.fields[key], `${locale}.${key}`).toBeTypeOf("string");
      for (const key of ["taskCreateIntro", "taskCreatedNext"]) expect(cat.conversation.chat[key], `${locale}.${key}`).toBeTypeOf("string");
      // The priority labels live in the routed catalogs' `tasks` namespace (fallback covers the rest).
      if (["lt", "en", "ru", "nl", "de"].includes(locale)) expect(cat.tasks.priority.normal).toBeTypeOf("string");
    }
  });
});
