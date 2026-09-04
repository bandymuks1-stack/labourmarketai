import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CAPACITY_CHAT_LIMIT, CAPACITY_WINDOW_DAYS } from "./capacity-contract";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * CAPACITY (owner contract 2026-09-04 §11 — "who is available"): the
 * company's roster against the employer-side unavailability read (approved
 * absences: WHEN, never WHY) for the next days, answered in the chat.
 */
describe("who is available, by sentence", () => {
  it.each([
    "Kas laisvas šią savaitę?",
    "kas gali dirbti rytoj?",
    "Who is available this week?",
    "who can work tomorrow",
    "Кто свободен на этой неделе?",
    "Wie is deze week beschikbaar?",
    "Wer ist diese Woche frei?",
  ])("%s → who-available", (text) => {
    expect(classifyIntent(text).intent).toBe("who-available");
  });

  it("nearby sentences keep their intents", () => {
    expect(classifyIntent("parodyk kandidatus").intent).toBe("candidates");
    expect(classifyIntent("kada turiu kitą susitikimą?").intent).toBe("calendar-view");
    expect(classifyIntent("kiek atostogų dienų man liko?").intent).toBe("absences");
  });

  it("is a read intent; the read composes the roster read and the absence read, never a query of its own", () => {
    expect(INTENT_REGISTRY["who-available"]).toMatchObject({ domain: "company", access: "read", handler: "whoAvailable" });
    const READ = readFileSync(join(__dirname, "capacity.ts"), "utf8");
    expect(READ.startsWith('"use server";')).toBe(true);
    expect(READ).toContain("requireEmployerCompany()");
    expect(READ).toContain("listActiveCompanyWorkers(company.companyId)");
    expect(READ).toContain("getEmployerWorkerAvailability()");
    expect(READ).toContain("unavailabilityOverlaps(window, u.item)");
    expect(READ).not.toMatch(/\.from\(|\.rpc\(/);
    // The reason for an absence never travels: the read only touches dates.
    expect(READ).not.toMatch(/absence_type|\.note\b/);
    expect(CAPACITY_WINDOW_DAYS).toBe(7);
    expect(CAPACITY_CHAT_LIMIT).toBeGreaterThan(0);
  });

  it("the chat answers in place with the projects and add-task chips; an empty roster offers the invite", () => {
    const CHAT = readFileSync(join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
    expect(CHAT).toContain("whoAvailable: () => startWhoAvailable()");
    expect(CHAT).toContain("loadWhoIsAvailableForChat()");
    expect(CHAT).toContain('{ id: "f:company.create-task", label: labels.chipAddTask }');
    expect(CHAT).toContain('{ id: "f:company.invite-worker", label: labels.chipInviteCandidate }');
    const fn = CHAT.slice(CHAT.indexOf("const startWhoAvailable = useCallback"), CHAT.indexOf("const startAgencyInvite = useCallback"));
    expect(fn).not.toContain("link:/dashboard");
  });

  it("copy exists in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const chat = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8")).conversation.chat as Record<string, string>;
      for (const key of ["capacityIntro", "capacityFree", "capacityBusyUntil", "capacityAbsencesUnknown", "capacityEmpty", "capacityUnavailable", "chipAddTask"]) {
        expect(chat[key], `${locale}.${key}`).toBeTypeOf("string");
      }
      expect(chat.capacityIntro).toContain("{from}");
      expect(chat.capacityBusyUntil).toContain("{date}");
    }
  });
});
