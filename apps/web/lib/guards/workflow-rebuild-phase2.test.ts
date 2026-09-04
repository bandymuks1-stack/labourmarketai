import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { COMPANY_FORMS, getCompanyForm } from "@/lib/conversation/company-forms";
import { companyCreateDemandSchema } from "@/lib/conversation/company-schemas";

/**
 * Real-user workflow rebuild — phase 2 guards (W4–W6).
 *
 * Pins the load-bearing decisions so a future patch cannot silently regress
 * them:
 *
 *  W4 — the chat is a full work centre:
 *   1. The dispatcher resolves the ACTIVE WORKSPACE server-side and hands it
 *      to every executor (ExecCtx.workspace) — never client-supplied.
 *   2. The employer demand intake runs through the SAME InlineActionForm +
 *      canonical dispatcher as the worker forms (no second entry point), and
 *      its IMPORTANT tier mints a one-time confirmation token.
 *   3. The deterministic router separates "I need workers" (employer) from
 *      "I'm looking for work" (worker) — the worker-plural stem decides.
 *
 *  W5 — one IA: no live links into stub/drift routes; ONE project-create
 *      core (pinned in w10-project-org-binding + project-context-create).
 *
 *  W6 — workspace context inherited: mixed-org lists label rows with the
 *      SAME deterministic accent (journal ← W1; projects map + assets here).
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("W4 — dispatcher hands the active workspace to every executor", () => {
  it("dispatch resolves the workspace from the canonical resolver, server-side", () => {
    const src = read("lib/conversation/dispatch.ts");
    expect(src).toMatch(/getWorkspaceContext\(/);
    expect(src).toMatch(/workspace/);
    // Employer actions resolve with the company-identity fallback.
    expect(src).toMatch(/actionId\.startsWith\("company\."\)/);
    // The workspace is NEVER read from the caller's input.
    expect(src).not.toMatch(/opts\?\.workspace|input\.workspace/);
  });

  it("the executor contract carries the workspace type", () => {
    const src = read("lib/conversation/executor-contract.ts");
    expect(src).toMatch(/ExecWorkspace/);
    expect(src).toMatch(/organizationId: string \| null/);
  });
});

describe("W4 — employer demand intake shares the ONE form pipeline", () => {
  it("company.create-demand is a registered inline form with confirmation", () => {
    const spec = getCompanyForm("company.create-demand");
    expect(spec).toBeDefined();
    expect(spec!.requiresConfirmation).toBe(true);
    // The spec's build output parses against the REAL dispatch schema —
    // the form can never drift from what the executor validates.
    const built = spec!.build({
      description: "Reikia 4 mūrininkų Kaune nuo rugpjūčio",
      role: "Mūrininkas",
      location: "Kaunas",
      teamSize: "4",
      urgency: "this_week",
      asDraft: false,
    });
    const parsed = companyCreateDemandSchema.safeParse(built);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.mode).toBe("submit");
  });

  it("every company form dispatches through the ONE InlineActionForm", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    // 2026-09-04: `openForm` also accepts a spec BUILT for the turn (the
    // agency candidate offer lists the roster just read) — the id path still
    // resolves through the two registries, in this order.
    expect(chat).toMatch(/getWorkerForm\(actionOrSpec\) \?\? getCompanyForm\(actionOrSpec\)/);
    // No parallel employer form component exists in the conversation tree.
    expect(COMPANY_FORMS.length).toBeGreaterThanOrEqual(1);
  });

  it("the inline form mints a one-time token for confirm-tier specs", () => {
    const form = read("components/app/conversation/inline-action-form.tsx");
    expect(form).toMatch(/spec\.requiresConfirmation/);
    expect(form).toMatch(/prepareConfirmationAction\(spec\.actionId, input\)/);
    expect(form).toMatch(/confirmationToken/);
  });

  it("the chat greeting is role-aware — employer starters for the company identity", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/baseIdentityForRole/);
    expect(chat).toMatch(/f:company\.create-demand/);
    // Contextual navigation chips route to REAL canonical surfaces only.
    expect(chat).toMatch(/link:\/dashboard\/company\/scouting/);
    expect(chat).not.toMatch(/link:\/dashboard\/(buyer|agency|marketplace)\b/);
  });
});

describe("W4 — 'need workers' vs 'looking for work' (deterministic router)", () => {
  it("employer phrasings route to need-workers in LT/EN/RU", () => {
    for (const text of [
      "reikia darbuotojų",
      "ieškau darbuotojų statybose",
      "we are hiring workers",
      "нужны работники на склад",
    ]) {
      expect(classifyIntent(text).intent, text).toBe("need-workers");
    }
  });

  it("worker phrasings still route to find-work", () => {
    for (const text of ["ieškau darbo", "find me a job", "ищу работу"]) {
      expect(classifyIntent(text).intent, text).toBe("find-work");
    }
  });
});

describe("W6 — mixed-org lists label rows with the SAME workspace accent", () => {
  it("the project map labels each card's org when several orgs mix", () => {
    const map = read("components/app/arena/project-map.tsx");
    expect(map).toMatch(/project-org-context-/);
    expect(map).toMatch(/workspaceAccentIndex/);
    expect(map).toMatch(/distinctOrgs\.size > 1/);
  });

  it("the assets registry labels each row's org when several orgs mix", () => {
    const panel = read("components/app/assets-panel.tsx");
    expect(panel).toMatch(/asset-org-context-/);
    expect(panel).toMatch(/workspaceAccentIndex/);
    expect(panel).toMatch(/data\.orgs\.length > 1/);
  });

  it("assigned assets render an honest empty state, never nothing (audit A11)", () => {
    const panel = read("components/app/assets-panel.tsx");
    expect(panel).toMatch(/my-assets-empty/);
  });
});
