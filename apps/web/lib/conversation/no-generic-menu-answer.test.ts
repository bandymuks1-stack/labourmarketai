/**
 * NEVER THE GENERIC MENU AS AN ANSWER (owner order 2026-11-24, decision 0034
 * rule 3). The greeting's starter row and its "I can help with … What would
 * you like to do?" line answer nothing: a routed request gets one clear
 * answer or one clarifying question. Before this, 24 places in the chat
 * answered with that menu — an organization action asked where no space can
 * do it, a read that failed, a task or stage with no stated state, a
 * profession that was not read, saved opportunities inside an organization.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const SRC = readFileSync(join(WEB, "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");

describe("the chat never answers a request with the generic menu", () => {
  it("the menu line appears only where the CV handlers still hold it (intercepted before dispatch by the space check)", () => {
    const uses = [...SRC.matchAll(/assistant\(fallbackText\b/g)].map((m) => SRC.slice(0, m.index).split("\n").length);
    const owners = uses.map((line) => {
      const before = SRC.split("\n").slice(0, line).reverse();
      return before.find((l) => /^\s{8}[a-zA-Z]+: \(\) =>/.test(l))?.trim().split(":")[0] ?? "?";
    });
    expect(owners.sort()).toEqual(["cvChoose", "cvExport"]);
  });

  it("an organization action where no space can do it says so, with one door", () => {
    const body = SRC.slice(SRC.indexOf("const answerNeedsOrganization = useCallback("), SRC.indexOf("const answerPersonalOnly = useCallback("));
    expect(body).toContain('assistant(t("needsOrganization"), [');
    expect(body).toContain('{ id: "link:/dashboard/start/company", label: labels.chipCreateOrganization }');
    expect((SRC.match(/answerNeedsOrganization\(\)/g) ?? []).length).toBeGreaterThanOrEqual(15);
  });

  it("a failed read is said as a failure, a missing state or trade is asked — and a state can be answered", () => {
    expect((SRC.match(/assistant\(t\("readFailed"\)\)/g) ?? []).length).toBe(4);
    // The state question carries the three states; a tap re-runs the SAME
    // handler on the SAME sentence (Codex P2 on #3783: the bare question lost
    // the task or stage it was about).
    expect(SRC).toContain('assistant(t(kind === "task" ? "taskStatusAsk" : "stageStatusAsk"), [');
    for (const s of ["in_progress", "done", "blocked"]) expect(SRC).toContain(`{ id: "pstatus:${s}"`);
    expect(SRC).toContain('askStatus("task", sentence);');
    expect(SRC).toContain('askStatus("stage", sentence);');
    expect(SRC).toContain("const status: WorkTaskStatus | null = picked ?? readStatedProgress(sentence, \"task\");");
    expect(SRC).toContain("const status: StageStatus | null = picked ?? readStatedProgress(sentence, \"stage\");");
    const tap = SRC.slice(SRC.indexOf('chip.id.startsWith("pstatus:")'), SRC.indexOf('chip.id.startsWith("oc:")'));
    expect(tap).toContain("pendingStatusRef.current = null;");
    expect(tap).toContain('if (pending.kind === "task") startTaskStatus(pending.sentence, picked);');
    expect(tap).toContain("else startStageStatus(pending.sentence, picked);");
    expect(SRC).toContain('askToClarify(t("professionAsk"))');
  });

  it("saved opportunities inside an organization offer the switch, not the menu", () => {
    const saved = SRC.slice(SRC.indexOf("savedOpportunities: () => {"), SRC.indexOf("savedOpportunities: () => {") + 300);
    expect(saved).toContain("answerPersonalOnly();");
  });

  it.each(["en", "lt", "pl", "de", "nl", "ru", "sv", "da", "et", "lv", "no"])("%s carries every new line", (l) => {
    const chat = JSON.parse(readFileSync(join(WEB, "messages", `${l}.json`), "utf8")).conversation.chat;
    for (const k of ["needsOrganization", "readFailed", "taskStatusAsk", "stageStatusAsk", "professionAsk", "chipStatusStarted", "chipStatusDone", "chipStatusBlocked"]) {
      expect(typeof chat[k], `${l}.${k}`).toBe("string");
      expect(chat[k], `${l}.${k} is a real sentence`).not.toMatch(/^\[EN\]/);
    }
  });
});

describe("the state question can be answered (Codex P2 on #3783)", () => {
  it("'Är etappen grund klar?' states nothing, so it asks; the state alone names no stage", async () => {
    const { readStatedProgress } = await import("./progress-status-phrase");
    expect(readStatedProgress("Är etappen grund klar?", "stage")).toBeNull();
    expect(readStatedProgress("Blockerad", "stage")).toBe("blocked");
    // …which is why the tap carries the state to the handler WITH the original
    // sentence (pinned above): "Blockerad" alone names no stage.
  });
});
