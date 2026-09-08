import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * PROJECT → PROGRESS (owner contract 2026-09-04 §11): a stage moved to a real
 * status — by sentence ("etapas pamatai baigtas") or from the stage row's
 * own control in the panel. Both enter the ONE dispatcher; progress is a
 * stored status the manager sets, never derived, never a bar.
 */
describe("a stage moved to a real status", () => {
  it.each([
    "Etapas pamatai baigtas",
    "pradėjome stogo etapą",
    "etapas mūras užstrigo",
    "Stage foundations is done",
    "Phase Rohbau fertig",
    "Fase fundering afgerond",
    "Этап фундамент завершён",
  ])("%s → stage-status", (text) => {
    expect(classifyIntent(text).intent).toBe("stage-status");
  });

  it("listing / opening projects and adding a task keep their intents", () => {
    expect(classifyIntent("mano projektai").intent).toBe("projects");
    expect(classifyIntent("pridėk užduotį projektui: sumontuoti pastolius").intent).toBe("add-task");
    expect(classifyIntent("sukurk projektą Vilniuje").intent).toBe("create-project");
  });

  it("is a write over the one dispatcher; the row is anchored to the projects surface; blocked carries a reason", () => {
    expect(INTENT_REGISTRY["stage-status"]).toMatchObject({ domain: "project", access: "write", handler: "stageStatus" });
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "company.update-stage-status");
    expect(row).toMatchObject({ subject: "company", confirmation: "reversible_write", precondition: "has_company" });
    expect(row?.handler).toEqual({ kind: "server_action", ref: "updateStageStatusAction" });
    const schema = COMPANY_ACTION_SCHEMAS["company.update-stage-status"];
    expect(schema.safeParse({ stageId: "11111111-1111-4111-8111-111111111111", status: "done" }).success).toBe(true);
    expect(schema.safeParse({ stageId: "11111111-1111-4111-8111-111111111111", status: "finished" }).success).toBe(false);
    expect(schema.safeParse({ stageId: "x", status: "done" }).success).toBe(false);
  });

  it("the executor delegates to the operations page's own stage action; the read composes the canonical project + stage reads", () => {
    const exec = readFileSync(join(__dirname, "company-executors.ts"), "utf8");
    expect(exec).toContain("updateStageStatusAction({");
    expect(exec).not.toMatch(/\.rpc\(|\.from\(/);
    const read = readFileSync(join(__dirname, "company-stages.ts"), "utf8");
    expect(read.startsWith('"use server";')).toBe(true);
    expect(read).toContain("loadProjectsForResult()");
    expect(read).toContain("listProjectStages(p.projectId)");
    expect(read).not.toMatch(/\.rpc\(|\.from\(/);
  });

  it("sentence and panel converge on ONE dispatch: runStageStatus, token-confirmed, re-opening the project", () => {
    const chat = readFileSync(join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
    expect(chat).toContain('prepareConfirmationAction("company.update-stage-status", input)');
    expect(chat).toContain('dispatchWorkerAction("company.update-stage-status", input, {');
    expect(chat).toContain("stageStatus: () => startStageStatus(text)");
    expect(chat).toContain('chip.id.startsWith("stage:")');
    expect(chat).toContain("onStageStatus: (projectId: string, stageId: string, status: StageStatus) => runStageStatus(projectId, stageId, status)");
    const panel = readFileSync(join(__dirname, "..", "..", "components", "app", "workspace", "project-result.tsx"), "utf8");
    expect(panel).toContain('data-testid={`project-stage-done-${s.id}`}');
    expect(panel).toContain('canManage && s.status !== "done" && s.status !== "cancelled"');
    expect(panel).toContain('useTranslations("projectStages")');
    const body = readFileSync(join(__dirname, "..", "..", "components", "app", "workspace", "result-body.tsx"), "utf8");
    expect(body).toContain("onStageStatus={navigation.onStageStatus}");
  });

  it("copy exists in all 11 catalogs; the panel word in the 5 routed ones", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const cat = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8"));
      expect(cat.conversation.actions.company.updateStageStatus.label).toBeTypeOf("string");
      for (const key of ["stageAsk", "stageNotFound", "stageNone", "stageDone", "stageStarted", "stageBlocked", "stageFailed", "chipStagePrefix"]) {
        expect(cat.conversation.chat[key], `${locale}.${key}`).toBeTypeOf("string");
      }
      if (["lt", "en", "ru", "nl", "de"].includes(locale)) expect(cat.conversation.results.projectStageMarkDone).toBeTypeOf("string");
    }
  });
});
