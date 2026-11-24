import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { requiresConfirmation } from "./dispatch-core";

/**
 * Prod defect 2026-09-04 (stage walk on 02e4476c): "etapas pamatai baigtas"
 * answered "Etapo būsenos pakeisti nepavyko" although nothing was wrong — the
 * action is `reversible_write`, so `prepareConfirmationAction` honestly
 * answers `no_confirmation_needed`, and the chat treated that as a failure.
 * The write never ran. This pins the rule: every chat flow that prepares a
 * confirmation for an action whose tier needs NO token must accept that
 * answer and dispatch without one.
 */
const ROOT = join(__dirname, "..", "..");
const FILES = [
  "components/app/conversation/chat/conversation-chat.tsx",
  "components/app/conversation/worker-booking-action.tsx",
  "components/app/conversation/worker-worklog-flow.tsx",
  "components/app/conversation/inline-action-form.tsx",
  "components/app/workspace/candidates-result.tsx",
  "components/app/workspace/engagements-result.tsx",
] as const;

describe("confirmation tiers — the chat honours the dispatcher's answer", () => {
  it("reversible_write and read need no token; important/strong do", () => {
    expect(requiresConfirmation("reversible_write")).toBe(false);
    expect(requiresConfirmation("read")).toBe(false);
    expect(requiresConfirmation("important_write")).toBe(true);
    expect(requiresConfirmation("strong_irreversible")).toBe(true);
  });

  it("every prepared action below the token tier tolerates no_confirmation_needed", () => {
    const offenders: string[] = [];
    let sites = 0;
    for (const rel of FILES) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const rx = /prepareConfirmationAction\("([a-z.-]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(src)) !== null) {
        sites += 1;
        const id = m[1];
        const row = CONVERSATION_ACTIONS.find((a) => a.id === id);
        expect(row, `${rel}: ${id} is a registered action`).toBeDefined();
        if (!row || requiresConfirmation(row.confirmation)) continue;
        const after = src.slice(m.index, m.index + 900);
        if (!after.includes("no_confirmation_needed")) offenders.push(`${rel}: ${id} (${row.confirmation})`);
      }
    }
    expect(sites).toBeGreaterThan(0);
    expect(offenders, "a token-less tier answered as a failure").toEqual([]);
  });

  it("the stage status flow dispatches without a token when none is needed", () => {
    const chat = readFileSync(join(ROOT, FILES[0]), "utf8");
    const at = chat.indexOf('prepareConfirmationAction("company.update-stage-status"');
    expect(at).toBeGreaterThan(-1);
    const flow = chat.slice(at, at + 900);
    expect(flow).toContain('prep.code !== "no_confirmation_needed"');
    expect(flow).toContain("confirmationToken: prep.ok ? prep.token : undefined");
  });
});
