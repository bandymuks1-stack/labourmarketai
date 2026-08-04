import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { COMPANY_ACTION_SCHEMAS } from "@/lib/conversation/company-schemas";
import { CONVERSATION_ACTIONS, getConversationAction } from "@/lib/conversation/action-registry";
import { CONVERSATION_RESULTS, getResult, canRenderInline } from "@/lib/conversation/result-registry";

/**
 * Guard — W8 EMPLOYER CHAT WORKSPACE COMPLETION.
 *
 * The audit found a shape, not a bug: every employer executor was wired
 * server-side (schema → executor → dispatcher → confirmation tier) and NINE of
 * the ten had no client caller at all. `company.create-demand` was the only
 * employer action the conversation could reach, so the employer journey ended
 * at the intake form and every step after it required leaving the workspace.
 *
 * A behaviour test on one component cannot stop that from recurring — the next
 * employer executor can be added complete-but-unreachable exactly as these
 * were. So this guard pins the RULE:
 *
 *   1. an executable employer action is either REACHABLE from the conversation
 *      or explicitly listed as a known gap — never silently unreachable;
 *   2. the employer result reuses the canonical reads; it never grows a second
 *      matching engine, shortlist store or pipeline enum;
 *   3. the employer workspace adapter touches no database of its own;
 *   4. no new route, no second dashboard, no second employer workspace;
 *   5. the panel keeps every existing screen reachable (NO REGRESSION);
 *   6. the anonymization boundary still holds — no worker identity leaves the
 *      server through the new projection.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

const CHAT = "components/app/conversation/chat/conversation-chat.tsx";
const RESULT = "components/app/workspace/candidates-result.tsx";
const ADAPTER = "lib/conversation/employer-workspace.ts";
const CONTRACT = "lib/conversation/employer-workspace-contract.ts";
const WORKFLOWS = "lib/ai-workspace/workflows.ts";

const chat = read(CHAT);
const result = read(RESULT);
const adapter = read(ADAPTER);

// ═══════════════════════════════════════════════════════════════════════════
// 1. No executable employer action is silently unreachable
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The actions W8 deliberately leaves without a conversation caller, each with
 * the reason. This list is the POINT of the guard: adding an executor without
 * a caller now forces a conscious edit here, with a justification, instead of
 * shipping a control nobody can press.
 */
const KNOWN_GAPS: Readonly<Record<string, string>> = {
  // The project domain's result (`project`) is declared `unverified` by W11's
  // own audit and has no inline renderer, so there is nowhere in the panel for
  // an assignment to happen. Its existing screen (/dashboard/projects) stays
  // the honest destination and is reachable through the result fallback.
  "company.assign-worker":
    "the project result has no inline renderer (W11 audit P0-4) — assignment stays on /dashboard/projects",
  // The AGENCY journey, not the employer one. W8's scope is the company side;
  // these two belong to the agency bridge and its own surfaces.
  "agency.invite-client": "agency journey — out of W8 scope",
  "agency.propose-candidate": "agency journey — out of W8 scope",
};

/** Where a client caller for an employer action may live. */
const CALLERS = [chat, result, read("lib/conversation/company-forms.ts")].join("\n");

describe("1. every executable employer action is reachable, or a declared gap", () => {
  const ids = Object.keys(COMPANY_ACTION_SCHEMAS);

  it("the executable set is non-empty (the guard would otherwise pass vacuously)", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  it.each(ids)("%s is dispatched from the conversation, or declared a gap", (id) => {
    if (id in KNOWN_GAPS) {
      expect(KNOWN_GAPS[id].length, `${id} needs a real reason`).toBeGreaterThan(20);
      return;
    }
    expect(
      CALLERS.includes(`"${id}"`),
      `${id} is executable server-side but no conversation surface calls it`,
    ).toBe(true);
  });

  it("the declared gaps are real registry ids, not typos", () => {
    for (const id of Object.keys(KNOWN_GAPS)) {
      expect(getConversationAction(id), `${id} is not in the action registry`).toBeDefined();
    }
  });

  it("every dispatched id carries the confirmation tier the registry declares", () => {
    // The panel mints a token for exactly the important/strong employer
    // actions. A tier upgrade in the registry that this list does not follow
    // would silently drop a consent gate.
    const IMPORTANT = ["company.confirm-need", "company.contact-worker", "company.propose-booking"];
    for (const id of IMPORTANT) {
      const d = getConversationAction(id);
      expect(d?.confirmation, `${id} tier`).toBe("important_write");
      expect(result, `${id} must mint a token`).toMatch(
        new RegExp(`actionId === "${id.replace(".", "\\.")}"`),
      );
    }
    // …and the reversible ones must NOT be in that list, or the panel would
    // demand a token the dispatcher never asks for and the write would fail.
    for (const id of ["company.shortlist-candidate", "company.close-demand", "company.reopen-demand"]) {
      expect(getConversationAction(id)?.confirmation, `${id} tier`).toBe("reversible_write");
      expect(result).not.toMatch(
        new RegExp(`needsToken[\\s\\S]{0,200}"${id.replace(".", "\\.")}"`),
      );
    }
  });

  it("the panel writes ONLY through the canonical dispatcher", () => {
    expect(result).toMatch(/from "@\/lib\/conversation\/dispatch"/);
    // No direct canonical-action import — that would bypass role re-checks,
    // zod validation and the confirmation token in one step.
    expect(result).not.toMatch(/@\/lib\/(scouting|demand|booking|communication)\//);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. One matching engine, one shortlist, one pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("2. the employer result reuses the canonical reads", () => {
  it("candidates come from runScouting — the scouting page's own read", () => {
    // No `s` flag: `[^}]` already spans newlines, and the repo's tsconfig
    // target predates dotAll (TS1501).
    expect(adapter).toMatch(/import \{[^}]*runScouting[^}]*\} from "@\/lib\/scouting\/scouting"/);
    // The page and the adapter must be the only two callers; a third reader
    // would be a second definition of "who is a candidate".
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/runScouting/);
  });

  it("the adapter ranks, scores and filters NOTHING of its own", () => {
    for (const forbidden of [/\.sort\(/, /matchWorkerToNeed/, /compareMatches/, /buildSupplyCandidates/]) {
      expect(forbidden.test(adapter), `adapter must not re-implement ${forbidden}`).toBe(false);
    }
  });

  it("the pipeline stage is the ONE derived stage, not a new enum", () => {
    expect(adapter).toMatch(/deriveCandidatePipelineStage/);
    expect(adapter).toMatch(/@\/lib\/pipeline\/candidate-pipeline/);
    // No stage vocabulary of its own anywhere in the new surface.
    expect(read(CONTRACT)).toMatch(/import type \{ CandidatePipelineStage \}/);
  });

  it("the shortlist write is the canonical executor, not a second store", () => {
    expect(adapter).not.toMatch(/demand_shortlist/);
    expect(result).not.toMatch(/demand_shortlist/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. The adapter owns no data system
// ═══════════════════════════════════════════════════════════════════════════

describe("3. the adapter is an adapter", () => {
  it("never opens a supabase client and never touches a table", () => {
    expect(adapter).not.toMatch(/@\/lib\/supabase/);
    expect(adapter).not.toMatch(/\.from\(/);
    expect(adapter).not.toMatch(/\.rpc\(/);
    expect(adapter).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });

  it("the contract stays pure — no server-only, no IO", () => {
    const contract = read(CONTRACT);
    expect(contract).not.toMatch(/["']server-only["']/);
    expect(contract).not.toMatch(/\bfetch\(/);
    expect(contract).not.toMatch(/@\/lib\/supabase/);
  });

  it("the company-context gate is the canonical resolver, never a re-derivation", () => {
    expect(adapter).toMatch(/from "@\/lib\/company\/employer-company-context"/);
    // The exact shortcut the W8 slice-1 audit banned across the spine.
    expect(
      /from\(\s*["']companies["']\s*\)[\s\S]{0,240}?\.eq\(\s*["']profile_id["']/.test(adapter),
    ).toBe(false);
  });

  it("no-company-context is its own state, never folded into empty", () => {
    // "you are in your personal space" and "your company has no needs" are
    // fixed by different acts, so they may never render as one sentence.
    expect(adapter).toMatch(/kind: "no-company-context"/);
    expect(adapter).toMatch(/kind: "empty"/);
    expect(result).toMatch(/candidatesNoCompany/);
    expect(result).toMatch(/candidatesNoDemands/);
    expect(chat).toMatch(/labels\.candidatesNoCompany/);
    expect(chat).toMatch(/labels\.candidatesNoDemands/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. No new route, no second workspace
// ═══════════════════════════════════════════════════════════════════════════

describe("4. the employer journey stays inside the one workspace", () => {
  it("this slice created no screen of its own", () => {
    // W6 slice 3B is the precedent: it briefly added `/dashboard/experiences`
    // and the Product Gate refused it (A-09, undeclared surface). An answer
    // belongs in the result panel, not in another route.
    for (const p of [
      "app/[locale]/dashboard/company/candidates",
      "app/[locale]/dashboard/company/scouting/[request]",
      "app/[locale]/dashboard/employer",
    ]) {
      expect(existsSync(join(APP, p)), `${p} must not exist`).toBe(false);
    }
  });

  it("the result does NOT hijack the unrelated /dashboard/candidates screen", () => {
    // That route already exists and is a DIFFERENT domain: private drafts of
    // unregistered people (candidate-provider-draft-v1), not scouting matches
    // against a demand. Same word, different thing — so the result names the
    // scouting screen and this slice does not touch the drafts page at all.
    expect(getResult("candidates")?.advancedRoute).not.toBe("/dashboard/candidates");
    expect(result).not.toMatch(/\/dashboard\/candidates/);
    expect(adapter).not.toMatch(/@\/lib\/candidates\//);
  });

  it("the employer's candidates starter is a RESULT, not a link", () => {
    // The chip used to be `link:/dashboard/company/scouting` — the employer's
    // second step navigated out of the chat-first workspace.
    expect(chat).not.toMatch(/id: "link:\/dashboard\/company\/scouting"/);
    expect(chat).toMatch(/id: "candidates", label: labels\.chipCandidates/);
  });

  it("the result component contains no router and no Link", () => {
    expect(result).not.toMatch(/useRouter/);
    expect(result).not.toMatch(/from "next\/link"/);
    expect(result).toMatch(/onOpenFull/);
  });

  it("the AI workflow answers with in-workspace depth, never a link chip", () => {
    const wf = read(WORKFLOWS);
    // The documented dead end is gone…
    expect(wf).not.toMatch(/t\("scoutingNotInWorkspaceYet"\)/);
    // …replaced by demand chips that change the RESULT DEPTH, not the page.
    expect(wf).toMatch(/id: `demand:\$\{d\.id\}`/);
    expect(wf).not.toMatch(/id: `link:/);
  });

  it("the chat routes a demand chip to the one depth writer", () => {
    expect(chat).toMatch(/chip\.id\.startsWith\("demand:"\)/);
    expect(chat).toMatch(/selectDemandRef\.current/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. NO REGRESSION — the existing screen stays reachable from every state
// ═══════════════════════════════════════════════════════════════════════════

describe("5. the existing scouting screen is never taken away", () => {
  it("the registry keeps the real route as the fallback", () => {
    const r = getResult("candidates");
    expect(r).toBeDefined();
    expect(r?.advancedRoute).toBe("/dashboard/company/scouting");
    expect(r?.advancedRoute).toMatch(/^\//);
    expect(r?.advancedRoute).not.toMatch(/^\/(lt|en|ru|nl|de)\//);
  });

  it("every honest state offers the way to the full screen", () => {
    // Each non-ok state renders through `Explained`, which always carries the
    // open-full control — a dead end is the one thing a result may not be.
    const explained = (result.match(/<Explained/g) ?? []).length;
    expect(explained).toBeGreaterThanOrEqual(4);
    expect(result).toMatch(/function Explained\([\s\S]{0,400}<OpenFull/);
  });

  it("the result is organization-scoped, and the gate actually bites", () => {
    const r = getResult("candidates");
    expect(r?.contexts).toEqual(["organization"]);
    // Personal space falls back to the route rather than rendering a panel
    // that could only ever say "you are not acting for a company".
    expect(canRenderInline("candidates", "personal")).toBe(false);
    expect(canRenderInline("candidates", "organization")).toBe(true);
  });

  it("both of its openedBy ids are real actions the employer holds", () => {
    const r = getResult("candidates");
    expect(r?.openedBy.length).toBeGreaterThan(0);
    for (const id of r?.openedBy ?? []) {
      const d = getConversationAction(id);
      expect(d, `${id} missing from the action registry`).toBeDefined();
      expect(d?.allowedRoles).toContain("company");
    }
  });

  it("adding it did not disturb the other results", () => {
    // A new entry may not change anybody else's readiness or route.
    const byKind = new Map(CONVERSATION_RESULTS.map((r) => [r.kind, r]));
    expect(byKind.get("opportunities")?.dataReadiness).toBe("real");
    expect(byKind.get("project")?.dataReadiness).toBe("unverified");
    expect(byKind.get("project")?.advancedRoute).toBe("/dashboard/projects");
    expect(CONVERSATION_ACTIONS.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. The anonymization boundary still holds
// ═══════════════════════════════════════════════════════════════════════════

describe("6. no worker identity leaves the server", () => {
  it("the projection carries no contact or name field", () => {
    const contract = read(CONTRACT);
    for (const banned of ["email", "phone", "fullName", "full_name", "displayName", "contact"]) {
      expect(
        new RegExp(`readonly\\s+${banned}\\b`, "i").test(contract),
        `${banned} must never be projected to the employer surface`,
      ).toBe(false);
    }
  });

  it("the adapter reads only the already-safe view", () => {
    // `toScoutSafeCandidate` ran `assertContactSafe` before this adapter saw
    // anything; reading `preview` is reading that proven-safe object.
    expect(adapter).toMatch(/c\.preview\./);
    expect(adapter).toMatch(/anonymizedToken/);
    // Never the raw subject, which still carries unfiltered worker fields.
    expect(adapter).not.toMatch(/c\.subject/);
  });

  it("the panel renders the anonymized token, never a name", () => {
    expect(result).toMatch(/candidateLabel/);
    expect(result).not.toMatch(/fullName|full_name|displayName/);
  });
});
