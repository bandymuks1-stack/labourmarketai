import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * PROGRESS / READINESS / RISK by sentence (owner contract 2026-09-04 §4A
 * "Which project is at risk?", §11, §16 "matching continues after no"): every
 * live project with the SAME facts the project panel's pulse renders —
 * overdue tasks, blocked stages, people with missing documents, a live
 * project with nobody on it — most signals first, then the chips that
 * continue. A COUNT of real facts; never a score, a percentage or a colour.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const LOADER = read("lib/conversation/project-risk.ts");
const CONTRACT = read("lib/conversation/project-risk-contract.ts");
const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;

describe("which project is at risk, by sentence", () => {
  it.each([
    "Kuris projektas rizikoje?",
    "kaip sekasi projektams?",
    "projektų būklė",
    "Which project is at risk?",
    "How are the projects going?",
    "Welches Projekt ist gefährdet?",
    "Welk project loopt risico?",
    "Какой проект под угрозой?",
    "Który projekt jest zagrożony?",
  ])("%s → project-risk", (text) => {
    expect(classifyIntent(text).intent).toBe("project-risk");
  });

  it("the project list, opening a project and the agency's proposal status keep their own intents", () => {
    expect(classifyIntent("mano projektai").intent).toBe("projects");
    expect(classifyIntent("atidaryk projektą").intent).toBe("open-project");
    expect(classifyIntent("kaip sekasi mano pasiūlymams?").intent).toBe("proposal-status");
  });

  it("is a read; the loader composes the panel's own project reads, drops finished projects, counts real facts and writes nothing", () => {
    expect(INTENT_REGISTRY["project-risk"]).toMatchObject({ domain: "project", access: "read", handler: "projectRisk" });
    expect(LOADER.startsWith('"use server";')).toBe(true);
    expect(LOADER).toContain("loadProjectsForResult()");
    expect(LOADER).toContain("loadProjectDetailForResult(p.projectId)");
    expect(LOADER).toContain('p.status !== "completed"');
    expect(LOADER).toContain('pr.status === "live" && pr.assignmentTotal === 0');
    expect(LOADER).toContain("pulse.tasksOverdue + pulse.workersWithMissingDocs");
    expect(LOADER).not.toMatch(/\.rpc\(|\.from\(/);
    // no fabricated figure can travel: the contract has no percentage, score or colour
    expect(CONTRACT).not.toMatch(/readonly \w*(percent|score|colou?r)\w*:/i);
    expect(CONTRACT).toContain("readonly signals: number");
  });

  it("the chat says an unreadable pulse as such, orders nothing itself, and continues with real chips (open the project, add people)", () => {
    const at = CHAT.indexOf("const startProjectRisk = useCallback");
    expect(at).toBeGreaterThan(-1);
    const fn = CHAT.slice(at, CHAT.indexOf("const startWhoAvailable = useCallback"));
    expect(fn).toContain("loadProjectRiskForChat()");
    expect(fn).toContain("labels.riskUnknownLine");
    expect(fn).toContain("r.signals === 0 ? labels.riskOkLine : labels.riskLine");
    expect(fn).toContain("id: `link:/dashboard/projects/${r.projectId}`");
    expect(fn).toContain('{ id: "f:company.invite-worker", label: labels.chipInviteCandidate }');
    expect(fn).not.toMatch(/\.sort\(/);
    expect(CHAT).toMatch(/projectRisk: \(\) => startProjectRisk\(\)/);
  });

  it("every catalogue carries real copy for the risk lines, placeholders intact", () => {
    const keys = ["riskIntro", "riskLine", "riskOkLine", "riskUnknownLine", "riskNobody", "riskNone", "riskUnavailable", "chipCreateProject"];
    const en = JSON.parse(read("messages/en.json")) as { conversation: { chat: Record<string, string> } };
    for (const loc of LOCALES) {
      const doc = JSON.parse(read(`messages/${loc}.json`)) as { conversation: { chat: Record<string, string> } };
      for (const k of keys) {
        const v = doc.conversation.chat[k];
        expect(typeof v, `${loc}.${k}`).toBe("string");
        expect(v.startsWith("[EN]"), `${loc}.${k}`).toBe(false);
        if (loc !== "en") expect(v, `${loc}.${k} identical to English`).not.toBe(en.conversation.chat[k]);
      }
      for (const ph of ["{title}", "{people}", "{open}", "{overdue}", "{blocked}", "{docs}", "{checked}", "{total}"]) {
        expect(doc.conversation.chat.riskLine, `${loc}.riskLine ${ph}`).toContain(ph);
      }
      expect(doc.conversation.chat.riskIntro).toContain("{count}");
      expect(doc.conversation.chat.riskOkLine).toMatch(/\{title\}.*\{people\}.*\{open\}/);
      expect(doc.conversation.chat.riskUnknownLine).toContain("{title}");
    }
  });
});
