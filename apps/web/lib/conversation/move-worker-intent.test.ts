import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * Owner contract 2026-09-04 §11 — WHAT-IF before commit: "MOVE PERSON PROJECT
 * X → PROJECT Y. Show consequences on BOTH sides. Only confirmation changes
 * canonical state. Do not implement only drag animation. State consequences
 * must be real."
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const LOADER = read("lib/conversation/project-move.ts");
const EXEC = read("lib/conversation/company-executors.ts");

describe("§11 what-if move — a person between projects", () => {
  it("the sentence routes to the intent in the routed locales", () => {
    for (const s of [
      "Perkelk Joną į projektą Vilnius",
      "Move John to project Riga",
      "Переведи Ивана на проект Рига",
      "Verplaats Jan naar project Utrecht",
      "Versetze Jan in das Projekt Berlin",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("move-worker");
    }
    expect(INTENT_REGISTRY["move-worker"]).toMatchObject({ domain: "project", access: "write", handler: "moveWorker" });
  });

  it("the consequences come from canonical reads only — nothing is written by the what-if", () => {
    for (const fn of ["getProjectOperations(", "listProjectTasks(", "getEmployerWorkerAvailability()", "deriveProjectReadinessRatio(", "unavailabilityOverlaps("]) {
      expect(LOADER, fn).toContain(fn);
    }
    expect(LOADER).not.toMatch(/\.from\(["']/);
    expect(LOADER).not.toMatch(/\.rpc\(/);
    expect(LOADER).not.toMatch(/assignWorkerToProjectAction|endAssignmentAction/);
    // both sides are stated: headcount ± 1, the source's open work, the
    // destination's empty checklist, absences inside the destination's dates
    expect(LOADER).toContain("headcountAfter: Math.max(0, from.workers.length - 1)");
    expect(LOADER).toContain("openTasksForWorker");
    expect(LOADER).toContain("readinessTotal: DEFAULT_READINESS_ITEM_KEYS.length");
    expect(LOADER).toContain("unavailabilitySpans");
    expect(LOADER).toContain("countryChanges:");
  });

  it("only the confirm chip commits, and the commit is the strong-tier action over the two canonical RPC actions in the safe order", () => {
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "company.move-worker");
    expect(row?.confirmation).toBe("strong_irreversible");
    expect(row?.allowedRoles).toEqual(["company"]);
    expect(COMPANY_ACTION_SCHEMAS["company.move-worker"]).toBeDefined();
    const at = EXEC.indexOf('"company.move-worker"');
    const body = EXEC.slice(at, at + 1200);
    const assign = body.indexOf("assignWorkerToProjectAction(");
    const end = body.indexOf("endAssignmentAction(");
    expect(assign).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(assign);
    expect(body).toContain("ended: ended.ok");
    // the chat: the what-if shows before the confirm chip exists; the chip
    // dispatches through the ONE dispatcher; a half-done move is said
    const whatIf = CHAT.indexOf("const runMoveWhatIf = useCallback");
    const confirmChip = CHAT.indexOf("move-confirm:${w.workerProfileId}");
    expect(whatIf).toBeGreaterThan(-1);
    expect(confirmChip).toBeGreaterThan(whatIf);
    expect(CHAT).toContain('dispatchWorkerAction("company.move-worker", input');
    expect(CHAT).toContain('t("moveOnlyConfirmLine")');
    expect(CHAT).toContain('t("moveDonePartial")');
  });

  it("every catalogue carries real copy for the what-if lines", () => {
    const en = JSON.parse(read("messages/en.json")) as { conversation: { chat: Record<string, string> } };
    const keys = ["moveWhatIfTitle", "moveFromLine", "moveToLine", "moveCountryLine", "moveAvailabilityLine", "moveOnlyConfirmLine", "moveDone", "moveDonePartial", "moveFailed", "moveConfirmChip"];
    for (const loc of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const doc = JSON.parse(read(`messages/${loc}.json`)) as { conversation: { chat: Record<string, string> } };
      for (const k of keys) {
        const v = doc.conversation.chat[k];
        expect(typeof v, `${loc}.${k}`).toBe("string");
        expect(v.startsWith("[EN]"), `${loc}.${k}`).toBe(false);
        if (loc !== "en") expect(v, `${loc}.${k} identical to English`).not.toBe(en.conversation.chat[k]);
      }
      // placeholders survive translation
      expect(doc.conversation.chat.moveFromLine).toMatch(/\{before\}.*\{after\}.*\{tasks\}.*\{checked\}.*\{total\}/);
      expect(doc.conversation.chat.moveToLine).toMatch(/\{before\}.*\{after\}.*\{total\}/);
    }
  });
});
