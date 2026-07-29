import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { AI_MAY_NEVER_CHANGE } from "@/lib/product-gate/world-state";
import {
  UNSUPPORTED_DIMENSIONS,
  WORLD_STATE_DIMENSIONS,
} from "@/lib/ai-workspace/world-state-language";
import { EMPTY_DISCOVERY_FILTERS } from "@/lib/opportunities/discovery-filters";

/**
 * W4 — AI WORKSPACE guards.
 *
 * The owner's rules for this phase, each turned into something CI can check:
 *
 *   "use real data"          → no workflow may query, rank or write
 *   "use existing APIs"      → every workflow enters a canonical use case
 *   "never fabricate"        → a dimension with no filter is NAMED, not dropped
 *   "never duplicate logic"  → filters run inside the ONE ranking path
 *   "explain WHY"            → the explanation is a required field
 *   AI-first, not navigation → nothing in this layer can reach a route
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const WORKFLOWS = "lib/ai-workspace/workflows.ts";
const CONTEXT = "lib/ai-workspace/ai-context.ts";
const LANGUAGE = "lib/ai-workspace/world-state-language.ts";
const VOCAB = "lib/ai-workspace/vocabulary-server.ts";
const CONTRACT = "lib/ai-workspace/workflow-contract.ts";
const RECOMMENDATIONS = "lib/opportunities/recommendations.ts";
const CHAT = "components/app/conversation/chat/conversation-chat.tsx";

const LOCALES = ["lt", "en", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv"] as const;

describe("W4 — the AI executes workflows over REAL data", () => {
  it("no workflow queries, names a table, or writes", () => {
    const src = read(WORKFLOWS);
    // Every fact must arrive through a canonical use case that already decided
    // authorization. A query here would be a second read path with its own
    // visibility rules to get wrong.
    expect(src).not.toMatch(/createClient|supabase/);
    expect(src).not.toMatch(/\.from\(|\.rpc\(/);
    expect(src).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i);
  });

  it("enters only canonical use cases", () => {
    const src = read(WORKFLOWS);
    for (const useCase of [
      "findWorkForChat", // the SAME adapter the chip uses
      "loadWorkerOpportunityBoard",
      "getReportsView",
      "listManagedProjects",
      "listCompanyDemands",
      "getPlanning",
    ]) {
      expect(src, `${useCase} is the canonical entrypoint`).toContain(useCase);
    }
  });

  it("cannot navigate — the AI changes World State, never the page", () => {
    for (const file of [WORKFLOWS, CONTEXT, LANGUAGE, VOCAB]) {
      const src = read(file);
      expect(src, `${file} must not route`).not.toMatch(/useRouter|router\.push|redirect\(/);
      expect(src, `${file} must not link`).not.toMatch(/<Link\b|href=/);
    }
    // …and the lock's own list says why.
    expect(AI_MAY_NEVER_CHANGE).toContain("page");
    expect(AI_MAY_NEVER_CHANGE).toContain("route");
  });

  it("opens an entity instead of returning a destination", () => {
    const src = read(WORKFLOWS);
    expect(src).toMatch(/kind: "open-entity"/);
    // An EntityRef, never a path.
    expect(src).toMatch(/ref: \{ type: "project", id:/);
  });

  it("no LLM anywhere in the layer", () => {
    for (const file of [WORKFLOWS, CONTEXT, LANGUAGE, VOCAB]) {
      const src = read(file);
      // Checked as CODE, not as prose: these modules describe themselves as
      // LLM-free in their headers, so a bare word match would fail on the
      // documentation that states the very property being asserted.
      expect(src, `${file} imports a model SDK`).not.toMatch(
        /from\s+["'](openai|@anthropic-ai\/[^"']+|@google\/gener[^"']+)["']/,
      );
      expect(src, `${file} calls a model`).not.toMatch(
        /chat\.completions|messages\.create\(|generateText\(/,
      );
      expect(src, `${file} reaches a model endpoint`).not.toMatch(/fetch\(/);
    }
  });
});

describe("W4 — every answer explains WHY", () => {
  it("the explanation is a REQUIRED field of the contract", () => {
    const src = read(CONTRACT);
    // Not `why?:` — a caller must not be able to omit it.
    expect(src).toMatch(/readonly why: string;/);
    expect(src).not.toMatch(/readonly why\?:/);
  });

  it("every workflow result in the module carries one", () => {
    const src = read(WORKFLOWS);
    const results = src.match(/kind: "(answer|matches|open-entity|blocked)"/g) ?? [];
    expect(results.length).toBeGreaterThan(5);
    // Each returned shape sits next to an `explanation:` key.
    const explanations = src.match(/explanation:/g) ?? [];
    expect(explanations.length).toBeGreaterThanOrEqual(results.length);
  });

  it("the chat renders the explanation, not just the answer", () => {
    const src = read(CHAT);
    expect(src).toMatch(/res\.explanation\.why/);
    expect(src).toMatch(/unsupportedDimension/);
  });
});

describe("W4 — a dimension the world cannot honour is NAMED, never dropped", () => {
  it("supported and unsupported dimensions are disjoint and both recorded", () => {
    const supported = Object.keys(WORLD_STATE_DIMENSIONS);
    for (const d of UNSUPPORTED_DIMENSIONS) {
      expect(supported).not.toContain(d);
    }
    // Salary is the one that matters most to a worker; it must stay on the
    // honest list until a real pay filter exists.
    expect(UNSUPPORTED_DIMENSIONS).toContain("salary");
  });

  it("every supported dimension maps onto a REAL canonical filter field", () => {
    for (const field of Object.values(WORLD_STATE_DIMENSIONS)) {
      expect(EMPTY_DISCOVERY_FILTERS).toHaveProperty(field);
    }
  });
});

describe("W4 — filtering runs inside the ONE ranking path", () => {
  it("filters are applied BEFORE the derivation, never to a ranked top-N", () => {
    // The structural claim: the filtered board is the DERIVATION'S INPUT.
    // Filtering an already-narrowed top-3 would silently drop matches the
    // person explicitly asked for, and the result would still look plausible.
    expect(read(RECOMMENDATIONS)).toMatch(
      /deriveJobRecommendations\(\s*applyDiscoveryFilters\(/,
    );
  });

  it("an unfiltered request still uses the request-cached result", () => {
    // Byte-identical behaviour for every existing surface is what makes this
    // change safe to make in a canonical module.
    expect(read(RECOMMENDATIONS)).toMatch(/activeFilterCount\(filters\) > 0[\s\S]{0,400}: result\.all/);
  });

  it("no surface filters after the fact", () => {
    // The conversation adapter passes filters DOWN; it must not post-filter.
    const findWork = read("lib/conversation/find-work.ts");
    expect(findWork).toMatch(/filters,/);
    expect(findWork).not.toMatch(/\.filter\(/);
  });
});

describe("W4 — the AI knows the current context, and says when it does not", () => {
  it("resolves the owner's seven facts from canonical readers only", () => {
    const src = read(CONTEXT);
    for (const canonical of [
      "getWorkspaceContext", // workspace + company
      "getSessionProfile", // identity
      "readHeldRoles", // permissions
      "getPlanning", // project + journal
    ]) {
      expect(src).toContain(canonical);
    }
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("unknown is a value — permissions are never guessed", () => {
    const src = read(CONTEXT);
    expect(src).toMatch(/permissionsKnown/);
    // The role reader fails closed and says so.
    expect(read("lib/auth/held-roles.ts")).toMatch(/fail(s)? CLOSED/i);
  });

  it("the active project follows the exactly-one rule", () => {
    // Two active projects is ambiguity; guessing would attach a person's words
    // to the wrong project.
    expect(read(CONTEXT)).toMatch(/assignedToday\.length === 1/);
  });
});

describe("W4 — intents route to the right workflow", () => {
  it("recognises the owner's example sentences", () => {
    expect(classifyIntent("I want work in Germany").intent).toBe("find-work");
    expect(classifyIntent("What skills am I missing?").intent).toBe("skill-gap");
    expect(classifyIntent("kokių įgūdžių man trūksta?").intent).toBe("skill-gap");
    expect(classifyIntent("Show my latest journal").intent).toBe("journal-recent");
    expect(classifyIntent("parodyk mano žurnalą").intent).toBe("journal-recent");
    expect(classifyIntent("Show my approved hours").intent).toBe("figures");
    expect(classifyIntent("Prepare this week report").intent).toBe("figures");
    expect(classifyIntent("Open this project").intent).toBe("open-project");
    expect(classifyIntent("atidaryk šį projektą").intent).toBe("open-project");
    expect(classifyIntent("Find workers").intent).toBe("find-workers");
    expect(classifyIntent("Compare these candidates").intent).toBe("find-workers");
  });

  it("does NOT steal the intents that already existed", () => {
    // The employer demand-intake phrasings are pinned by their own guard; this
    // asserts the W4 rules did not quietly outrank them.
    expect(classifyIntent("reikia darbuotojų").intent).toBe("need-workers");
    expect(classifyIntent("ieškau darbuotojų statybose").intent).toBe("need-workers");
    expect(classifyIntent("we are hiring workers").intent).toBe("need-workers");
    expect(classifyIntent("ieškau darbo").intent).toBe("find-work");
    expect(classifyIntent("šiandien dirbau nuo 8 iki 17").intent).toBe("log-work");
    expect(classifyIntent("pridėk kalbą").intent).toBe("profile");
  });

  it("every AI-workspace intent has a workflow wired in the chat", () => {
    const src = read(CHAT);
    for (const intent of [
      "find-work",
      "skill-gap",
      "journal-recent",
      "figures",
      "open-project",
      "find-workers",
      "context",
    ]) {
      expect(src, `${intent} has no workflow`).toMatch(
        new RegExp(`["']?${intent.replace("-", "\\-")}["']?:\\s*\\(\\)`),
      );
    }
  });
});

describe("W4 — copy exists in every active locale", () => {
  it("workspace.ai and workspace.project are complete", () => {
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        workspace?: { ai?: Record<string, unknown>; project?: Record<string, unknown> };
      };
      expect(json.workspace?.ai, `${locale}: workspace.ai missing`).toBeTruthy();
      expect(json.workspace?.project, `${locale}: workspace.project missing`).toBeTruthy();
      for (const key of ["whyFiltered", "skillGapIntro", "figuresNoHoursLedger", "ctxRolesUnknown"]) {
        expect(String(json.workspace?.ai?.[key] ?? ""), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("the honest 'no approved-hours ledger' line is real copy everywhere", () => {
    // The owner asked for "approved hours". The product does not keep them, and
    // every locale has to say so rather than quietly answering something else.
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        workspace: { ai: Record<string, string> };
      };
      expect(json.workspace.ai.figuresNoHoursLedger.length).toBeGreaterThan(20);
    }
  });
});
