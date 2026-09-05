import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * READINESS by sentence (owner contract 2026-09-04 §11 project readiness,
 * §12 documents first-class — WHAT IS MISSING? FOR WHAT? WHAT NEXT?, §16
 * matching continues after the gap): "kas trūksta projektui X?" answers with
 * the operations centre's OWN per-person read — the derived reason codes,
 * the manager-kept checklist rows still needed / missing (labels verbatim),
 * the rejected / expired rows, checked/total — and the way forward. Never a
 * document's content, never a score, never a write.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const LOADER = read("lib/conversation/project-readiness.ts");
const EXEC = read("lib/conversation/company-executors.ts");
const BRIEF = read("lib/conversation/opening-brief.ts");
const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;

describe("what a project still needs, by sentence", () => {
  it.each([
    "Kas trūksta projektui Vilnius?",
    "ar komanda pasiruošusi?",
    "projekto parengtis",
    "What is missing for the project?",
    "Is the team ready for Rotterdam?",
    "Was fehlt dem Projekt?",
    "Is het team klaar?",
    "Чего не хватает проекту?",
    "Czego brakuje projektowi?",
  ])("%s → project-readiness", (text) => {
    expect(classifyIntent(text).intent).toBe("project-readiness");
  });

  it("the worker's own gap question, capacity, risk and the project list keep their intents", () => {
    expect(classifyIntent("ko man trūksta?").intent).not.toBe("project-readiness");
    expect(classifyIntent("kas laisvas šią savaitę?").intent).toBe("who-available");
    expect(classifyIntent("kuris projektas rizikoje?").intent).toBe("project-risk");
    expect(classifyIntent("mano projektai").intent).toBe("projects");
  });

  it("is a read; the loader resolves the named LIVE project, asks when ambiguous, and composes the operations centre's own per-person read", () => {
    expect(INTENT_REGISTRY["project-readiness"]).toMatchObject({ domain: "project", access: "read", handler: "projectReadiness" });
    expect(LOADER.startsWith('"use server";')).toBe(true);
    expect(LOADER).toContain("loadProjectsForResult()");
    expect(LOADER).toContain("getProjectOperations(projectId)");
    expect(LOADER).toContain("deriveReadinessRatio(w.readinessItems)");
    expect(LOADER).toContain('p.status !== "completed"');
    expect(LOADER).toContain('return { kind: "ask", projects: named.slice(0, READINESS_CHAT_ASK_LIMIT) }');
    expect(LOADER).toContain('i.status === "needed" || i.status === "missing"');
    expect(LOADER).toContain('i.status === "rejected" || i.status === "expired"');
    expect(LOADER).not.toMatch(/\.rpc\(|\.from\(/);
    // the loader may SAY what it refuses; it may not compute one
    expect(LOADER).not.toMatch(/(percent|score)\w*\s*[:=(]/i);
  });

  it("the chat: the ask chip re-enters the same loader; the answer names the gaps and ends with the operations page (people when there are none)", () => {
    const at = CHAT.indexOf("const runProjectReadiness = useCallback");
    expect(at).toBeGreaterThan(-1);
    const fn = CHAT.slice(at, CHAT.indexOf("/** §14 WORK PERFORMED → RESULT"));
    expect(fn).toContain("loadProjectReadinessForChat({ projectId, sentence })");
    expect(fn).toContain("id: `ready:${p.projectId}`");
    expect(fn).toContain("labels.readinessNoChecklist");
    expect(fn).toContain("labels.readinessNoPeople");
    expect(fn).toContain("id: `link:/dashboard/projects/${res.projectId}/operations`");
    // §12 / §16: the gap continues into the corrective action that EXISTS
    expect(fn).toContain("id: `ready-seed:${res.projectId}`");
    expect(fn).toContain("id: `ready-got:${res.projectId}:${first.workerProfileId}:${it.key}`");
    expect(fn).toContain("id: `ready-ask:${res.projectId}:${first.workerProfileId}`");
    expect(fn).toContain('{ id: "f:company.invite-worker", label: labels.chipInviteCandidate }');
    expect(CHAT).toContain('chip.id.startsWith("ready:")');
    expect(CHAT).toMatch(/projectReadiness: \(\) => startProjectReadiness\(text\)/);
  });

  it("the corrective actions are the operations page's OWN writes over the ONE dispatcher, and each chip re-reads the same readiness afterwards", () => {
    const rows = ["company.set-readiness-item", "company.seed-readiness-checklist", "company.request-readiness"].map((id) => CONVERSATION_ACTIONS.find((a) => a.id === id));
    expect(rows.every(Boolean)).toBe(true);
    expect(rows[0]).toMatchObject({ confirmation: "reversible_write", allowedRoles: ["company", "agency"], precondition: "has_company" });
    expect(rows[0]?.handler).toEqual({ kind: "server_action", ref: "upsertReadinessItemAction" });
    expect(rows[1]).toMatchObject({ confirmation: "reversible_write" });
    expect(rows[1]?.handler).toEqual({ kind: "server_action", ref: "seedReadinessItemsAction" });
    // asking a person is a message to a human — the important tier (token; the chip is the explicit confirmation)
    expect(rows[2]).toMatchObject({ confirmation: "important_write" });
    expect(rows[2]?.handler).toEqual({ kind: "server_action", ref: "sendWorkInstructionAction" });
    const item = COMPANY_ACTION_SCHEMAS["company.set-readiness-item"];
    const base = { projectId: "11111111-1111-4111-8111-111111111111", workerProfileId: "22222222-2222-4222-8222-222222222222", itemKey: "identity_document", label: "Asmens dokumentas" };
    expect(item.safeParse({ ...base, status: "received" }).success).toBe(true);
    expect(item.safeParse({ ...base, status: "rejected" }).success).toBe(false);
    expect(COMPANY_ACTION_SCHEMAS["company.request-readiness"].safeParse({ projectId: base.projectId, workerProfileId: base.workerProfileId, body: "" }).success).toBe(false);
    // executors delegate to the page's own actions — the checklist writes and the instruction send; no RPC here
    expect(EXEC).toContain("upsertReadinessItemAction({");
    expect(EXEC).toContain("seedReadinessItemsAction({ projectId: input.projectId, workerProfileId: w.workerProfileId, items })");
    expect(EXEC).toContain("getProjectOperations(input.projectId)");
    expect(EXEC).toContain('namespace: "projectOps.defaults"');
    expect(EXEC).toContain("sendWorkInstructionAction(");
    expect(EXEC).toContain("project_id: input.projectId");
    // the chat: one write path for the three chips, token-less when the tier says so, then the SAME read again
    const at = CHAT.indexOf("const runReadinessWrite = useCallback");
    expect(at).toBeGreaterThan(-1);
    const flow = CHAT.slice(at, at + 1800);
    expect(flow).toContain("prepareConfirmationAction(actionId, input)");
    expect(flow).toContain("no_confirmation_needed");
    expect(flow).toContain("dispatchWorkerAction(actionId, input");
    expect(flow).toContain('runProjectReadiness(projectId, "")');
    expect(CHAT).toContain('chip.id.startsWith("ready-seed:")');
    expect(CHAT).toContain('chip.id.startsWith("ready-got:")');
    expect(CHAT).toContain('chip.id.startsWith("ready-ask:")');
    // the instruction's body is the REAL gap list — the stored labels and the derived codes, nothing invented
    expect(CHAT).toContain("const gaps = [...w.missing.map(readinessCodeLabel), ...w.itemsMissing.map((i) => i.label)];");
    expect(CHAT).toContain('labels.readinessRequestBody.replace("{title}", last.title).replace("{items}", gaps.join(", "))');
    // the person's side: the instruction is the next thing their brief says, with the one chip to it
    expect(BRIEF).toContain("listAttentionInstructions()");
    expect(BRIEF).toContain('addChip("link:/dashboard/instructions", t("chipInstructions"))');
  });

  it("every catalogue carries real copy for the readiness lines, placeholders intact", () => {
    const keys = [
      "readinessIntro", "readinessReadyLine", "readinessGapLine", "readinessNoChecklist", "readinessNoPeople", "readinessAsk",
      "readinessNotFound", "readinessUnavailable", "chipReadinessPrefix", "chipOpenOperations", "missingName", "missingDeclaredSkills",
      "missingEvidence", "blockedSuffix", "readinessSeedChip", "readinessSeeded", "readinessGotChip", "readinessGotDone", "readinessAskChip",
      "readinessAskDone", "readinessRequestBody", "readinessWriteFailed", "briefInstructions", "chipInstructions",
    ];
    const en = JSON.parse(read("messages/en.json")) as { conversation: { chat: Record<string, string> } };
    for (const loc of LOCALES) {
      const doc = JSON.parse(read(`messages/${loc}.json`)) as { conversation: { chat: Record<string, string> } };
      for (const k of keys) {
        const v = doc.conversation.chat[k];
        expect(typeof v, `${loc}.${k}`).toBe("string");
        expect(v.startsWith("[EN]"), `${loc}.${k}`).toBe(false);
        if (loc !== "en") expect(v, `${loc}.${k} identical to English`).not.toBe(en.conversation.chat[k]);
      }
      expect(doc.conversation.chat.readinessIntro).toMatch(/\{title\}.*\{ready\}.*\{people\}/);
      expect(doc.conversation.chat.readinessReadyLine).toMatch(/\{name\}.*\{checked\}\/\{total\}/);
      expect(doc.conversation.chat.readinessGapLine).toMatch(/\{name\}.*\{gaps\}.*\{checked\}\/\{total\}/);
      expect(doc.conversation.chat.readinessRequestBody).toMatch(/\{title\}.*\{items\}/);
      expect(doc.conversation.chat.readinessGotChip).toMatch(/\{label\}.*\{name\}/);
      expect(doc.conversation.chat.briefInstructions).toContain("{count}");
    }
  });
});
