import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { getCompanyForm } from "./company-forms";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";
import { pinRefForSentence } from "@/lib/workspace/pin-usage-from-intent";

/**
 * F2 (owner contract 2026-09-04 §9/§11 seed) — the SITE as a project object,
 * by sentence. "sukurk projektą Roterdame" opens the ONE inline form over
 * `company.create-project`; the canonical `createProjectAction` (the company
 * page's own core) inserts the row. Need → project → assignment closes in
 * the conversation.
 */
describe("create a project by sentence", () => {
  it.each([
    "sukurk projektą Roterdame",
    "naujas objektas Vilniuje",
    "create a new project in Rotterdam",
    "neues Projekt anlegen",
    "Baustelle anlegen",
    "nieuw project aanmaken",
    "создай проект в Роттердаме",
  ])("%s → create-project", (text) => {
    expect(classifyIntent(text).intent).toBe("create-project");
  });

  it("listing and opening projects stay their own intents", () => {
    expect(classifyIntent("mano projektai").intent).toBe("projects");
    expect(classifyIntent("show my projects").intent).toBe("projects");
    expect(classifyIntent("atidaryk projektą Kaunas").intent).toBe("open-project");
  });

  it("is a write-class intent over the ONE dispatcher, company subject, important tier", () => {
    expect(INTENT_REGISTRY["create-project"]).toMatchObject({ domain: "project", access: "write", handler: "createProject" });
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "company.create-project");
    expect(row).toMatchObject({ subject: "company", confirmation: "important_write", precondition: "has_company" });
    expect(row?.handler).toEqual({ kind: "server_action", ref: "createProjectAction" });
  });

  it("schema: a real title, optional city — nothing else", () => {
    const schema = COMPANY_ACTION_SCHEMAS["company.create-project"];
    expect(schema.safeParse({ title: "Roterdamo sandėlis", city: "Roterdamas" }).success).toBe(true);
    expect(schema.safeParse({ title: "Roterdamo sandėlis" }).success).toBe(true);
    expect(schema.safeParse({ title: "R" }).success).toBe(false);
    expect(schema.safeParse({ title: "x".repeat(121) }).success).toBe(false);
  });

  it("the form is the same InlineActionForm (title required, city optional) and the city pre-fills from the sentence", () => {
    const form = getCompanyForm("company.create-project");
    expect(form?.fields.map((f) => [f.name, "required" in f && f.required === true])).toEqual([["title", true], ["city", false]]);
    const CHAT = readFileSync(join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
    expect(CHAT).toContain("const city = structureValueStatement(sentence).city");
    expect(CHAT).toContain('openForm("company.create-project", undefined, undefined, city ? { city } : undefined)');
    expect(CHAT).toContain("createProject: () => startCreateProject(text)");
  });

  it("the executor goes through the canonical createProjectAction — never its own insert", () => {
    const EXEC = readFileSync(join(__dirname, "company-executors.ts"), "utf8");
    expect(EXEC).toContain("createProjectAction(null, fd({ title: input.title, city: input.city ?? \"\" }))");
    expect(EXEC).not.toContain('from("projects")');
    expect(EXEC).not.toContain('from "@/lib/projects/create-project-core"');
  });

  it("typing it counts toward My Space like its chip would", () => {
    expect(pinRefForSentence("create-project", "company")).toBe("f:company.create-project");
    expect(pinRefForSentence("create-project", "person")).toBeNull();
  });
});
