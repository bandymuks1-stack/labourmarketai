import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * Owner contract 2026-09-04 §14 — the connected journey WORK / TASK →
 * EVIDENCE / RESULT → EMPLOYER / SUPERVISOR CONFIRMATION → VERIFIED
 * CAPABILITY → LIVING PROFESSIONAL IDENTITY, by sentence. The confirmation
 * is the inbox's one-tap confirm (`confirm_entry_and_verify_skills`, the ONLY
 * path that flips a worker's skill to verified); the person's journal review
 * is switched on by the membership RPC (`set_engagement_journal_review`).
 * No new decision table, no second "confirmed" store, no trust invented.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const LOADER = read("lib/conversation/confirm-work.ts");
const EXEC = read("lib/conversation/company-executors.ts");
const MEMBERS = read("lib/company/org-employee-engagements.ts");
const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;

describe("§14 employer confirmation of work, by sentence", () => {
  it.each([
    "Patvirtink Jono darbą",
    "ką reikia patvirtinti?",
    "patvirtinti darbo įrašus",
    "Confirm John's work",
    "What needs my confirmation?",
    "Bestätige Jans Arbeit",
    "Bevestig het werk van Jan",
    "Подтверди работу Ивана",
    "Potwierdź pracę Jana",
  ])("%s → confirm-work", (text) => {
    expect(classifyIntent(text).intent).toBe("confirm-work");
  });

  it("the approvals area, confirmed hours and the stage / task sentences keep their intents", () => {
    expect(classifyIntent("ką turiu patvirtinti?").intent).toBe("admin-approvals");
    expect(classifyIntent("parodyk patvirtintas valandas").intent).toBe("figures");
    expect(classifyIntent("etapas pamatai baigtas").intent).toBe("stage-status");
    expect(classifyIntent("užduotis sumontuoti pastolius atlikta").intent).toBe("task-status");
  });

  it("is a write over the one dispatcher: confirming is important-tier (the chip is the confirmation); enabling review is reversible", () => {
    expect(INTENT_REGISTRY["confirm-work"]).toMatchObject({ domain: "journal", access: "write", handler: "confirmWork" });
    const confirm = CONVERSATION_ACTIONS.find((a) => a.id === "company.confirm-work");
    expect(confirm).toMatchObject({ subject: "company", confirmation: "important_write", precondition: "has_company", allowedRoles: ["company", "agency"] });
    expect(confirm?.handler).toEqual({ kind: "server_action", ref: "quickConfirmEntry" });
    const enable = CONVERSATION_ACTIONS.find((a) => a.id === "company.enable-journal-review");
    expect(enable).toMatchObject({ subject: "company", confirmation: "reversible_write", precondition: "has_company" });
    expect(enable?.handler).toEqual({ kind: "server_action", ref: "setEngagementJournalReview" });
    const s = COMPANY_ACTION_SCHEMAS["company.confirm-work"];
    expect(s.safeParse({ entryId: "11111111-1111-4111-8111-111111111111", skillIds: [] }).success).toBe(true);
    expect(s.safeParse({ entryId: "11111111-1111-4111-8111-111111111111", skillIds: ["not-a-uuid"] }).success).toBe(false);
    expect(COMPANY_ACTION_SCHEMAS["company.enable-journal-review"].safeParse({ engagementId: "x" }).success).toBe(false);
  });

  it("the read composes the inbox's own queue and the canonical membership spine; nothing is written by the read", () => {
    expect(LOADER.startsWith('"use server";')).toBe(true);
    expect(LOADER).toContain("fetchQuickReviewQueue()");
    expect(LOADER).toContain("listOrgEmployeeEngagements(company.organizationId)");
    expect(LOADER).toContain("requireEmployerCompany()");
    expect(LOADER).not.toMatch(/\.rpc\(|\.from\(/);
    // the membership read is one bounded, indexed query under RLS — no ranking, no write
    expect(MEMBERS).toContain('.eq("relationship_slug", "employee")');
    expect(MEMBERS).toContain('.eq("status", "active")');
    expect(MEMBERS).toContain(".limit(ORG_EMPLOYEE_ENGAGEMENTS_LIMIT)");
    expect(MEMBERS).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.upsert\(/);
  });

  it("executors delegate to the inbox's one-tap confirm and the membership RPC wrapper — the only path that can flip a skill to verified", () => {
    expect(EXEC).toContain("quickConfirmEntry(null, f)");
    expect(EXEC).toContain('f.append("skill_id", id)');
    expect(EXEC).toContain("setEngagementJournalReview(input.engagementId, true)");
    expect(EXEC).not.toMatch(/\.rpc\(|\.from\(/);
  });

  it("the chat: the answer names what awaits, offers one chip per entry and one per not-yet-reviewable person, and re-reads after every write", () => {
    const at = CHAT.indexOf("const runConfirmWrite = useCallback");
    expect(at).toBeGreaterThan(-1);
    const flow = CHAT.slice(at, at + 1800);
    expect(flow).toContain("prepareConfirmationAction(actionId, input)");
    expect(flow).toContain("no_confirmation_needed");
    expect(flow).toContain("dispatchWorkerAction(actionId, input");
    expect(flow).toContain("startConfirmWork(\"\")");
    expect(CHAT).toContain("id: `confirm:${e.entryId}:${e.skillsToConfirm.map((s) => s.id).join(\",\")}`");
    expect(CHAT).toContain("id: `review-on:${m.engagementId}`");
    expect(CHAT).toContain('chip.id.startsWith("confirm:")');
    expect(CHAT).toContain('chip.id.startsWith("review-on:")');
    expect(CHAT).toMatch(/confirmWork: \(\) => startConfirmWork\(text\)/);
  });

  it("every catalogue carries real copy for the confirmation lines and the two actions", () => {
    const keys = ["confirmIntro", "confirmLine", "confirmChip", "confirmDone", "confirmNone", "confirmNotEnabled", "confirmEnableChip", "confirmEnabled", "confirmFailed", "confirmUnavailable"];
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
      expect(doc.conversation.chat.confirmLine).toMatch(/\{name\}.*\{date\}.*\{text\}.*\{skills\}/);
      expect(doc.conversation.chat.confirmDone).toMatch(/\{name\}.*\{count\}/);
      for (const a of ["confirmWork", "enableJournalReview"]) {
        expect(doc.conversation.actions.company[a]?.label?.length ?? 0, `${loc} ${a}`).toBeGreaterThan(3);
      }
    }
  });
});
