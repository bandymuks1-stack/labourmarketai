import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CONTEXT_PANEL_CONTENT, WORKSPACE_PARTS } from "@/lib/product-gate/world-state";
import { PRODUCT_SURFACES } from "@/lib/product-gate/surface-registry";
import { REGISTERED_ENTITY_TYPES } from "@/lib/world-state/resolvers";

/**
 * W3 — CONTEXT PANEL guards.
 *
 * These pin the decisions that make the panel a WORKSPACE PART rather than
 * another screen. Each one is a rule that would be silently undone by an
 * ordinary-looking future patch, which is the only reason it is in CI:
 *
 *  1. the panel is never a dialog and never traps the person;
 *  2. nothing in the world-state path navigates — no route, no Link, no router;
 *  3. the panel renders every section the owner's lock lists;
 *  4. it owns no read path and no write path of its own;
 *  5. a new entity type is a REGISTRATION, not an edit to the panel;
 *  6. the declaration exists, and its one "no" is waived honestly rather than
 *     answered dishonestly;
 *  7. the copy exists in every active locale.
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const PANEL = "components/app/world-state/context-panel.tsx";
const PROVIDER = "components/app/world-state/world-state-provider.tsx";
const STATE = "lib/world-state/world-state.ts";
const RESOLVERS = "lib/world-state/resolvers.ts";
const JOB_SERVER = "lib/world-state/job-context-server.ts";
const CHAT = "components/app/conversation/chat/conversation-chat.tsx";
/* W3 consolidation: selecting a match is a Context Panel result row now, not
   a thread card. The invariant ("selecting writes World State, it does not
   open a page") is unchanged — only its home is. */
const MESSAGES = "components/app/workspace/opportunities-result.tsx";

const LOCALES = ["lt", "en", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv"] as const;

describe("W3 — the panel is a part of the workspace, not a screen", () => {
  it("is never a dialog and never modal", () => {
    const src = read(PANEL);
    // A modal would make the workspace two places: the conversation would stop
    // being usable while the panel is open, which is the entire failure mode
    // WORLD_STATE_UX_ARCHITECTURE_V1 exists to prevent.
    expect(src).not.toMatch(/role=["']dialog["']/);
    expect(src).not.toMatch(/<Dialog\b|<Modal\b|showModal\(|aria-modal/);
    // It is a complementary landmark instead.
    expect(src).toMatch(/<aside/);
  });

  it("never navigates — not from the panel, not from the state", () => {
    for (const file of [PANEL, PROVIDER, STATE]) {
      const src = read(file);
      expect(src, `${file} must not route`).not.toMatch(/useRouter|router\.push|redirect\(/);
      expect(src, `${file} must not link`).not.toMatch(/<Link\b|href=/);
    }
  });

  it("has no commit control — the world never waits for an Apply button", () => {
    const src = read(PANEL).toLowerCase();
    for (const forbidden of ['>apply<', '>search<', '>go<', "applyfilters"]) {
      expect(src, `"${forbidden}" is a forbidden commit control`).not.toContain(forbidden);
    }
  });

  it("renders every section the lock lists for a selected object", () => {
    const src = read(PANEL);
    const serverSrc = read(JOB_SERVER);
    // CONTEXT_PANEL_CONTENT is the owner's list. Each entry must be reachable:
    // either the panel renders a section for it, or the server fills it.
    const covered: Record<string, boolean> = {
      title: /view\.title|entity\?\.title/.test(src),
      description: /view\.description/.test(src),
      salary: /fieldPay/.test(serverSrc),
      schedule: /fieldStart/.test(serverSrc),
      contacts: /contactNote/.test(src) && /contactNote/.test(serverSrc),
      requirements: /view\.requirements/.test(src),
      history: /view\.history/.test(src),
      related_objects: /view\.related/.test(src),
      ai_recommendations: /view\.recommendations/.test(src),
      available_actions: /view\.actions/.test(src),
    };
    for (const key of CONTEXT_PANEL_CONTENT) {
      expect(covered[key], `panel does not cover "${key}"`).toBe(true);
    }
  });

  it("is mounted in the workspace beside the conversation, once", () => {
    const src = read(CHAT);
    expect(src).toMatch(/<WorldStateProvider/);
    expect(src).toMatch(/<ContextPanel/);
    // One mount: two would be two panels that could disagree.
    expect(src.match(/<ContextPanel/g) ?? []).toHaveLength(1);
    // The panel is one of the three declared workspace parts, never a surface.
    expect(WORKSPACE_PARTS).toContain("context_panel");
  });
});

describe("W3 — one dispatcher, one write path", () => {
  it("the panel performs no action of its own — it dispatches into the chat", () => {
    const src = read(PANEL);
    // No server action other than the two READ entrypoints may be imported.
    expect(src).toMatch(/loadEntityContext/);
    expect(src).toMatch(/loadWorkContext/);
    expect(src).not.toMatch(/Action\(|createClient|supabase/);
    // The one interactive control it renders is the CANONICAL interest button.
    expect(src).toMatch(/WorkerInterestButton/);
    // Everything else goes back through the conversation's chip handler.
    expect(src).toMatch(/onChip/);
  });

  it("the chat routes panel chips into its EXISTING handler", () => {
    const src = read(CHAT);
    expect(src).toMatch(/handlePanelChip/);
    expect(src).toMatch(/handleChip\(\{\s*id: chipId/);
  });

  it("the server half reads through the canonical use case only", () => {
    const src = read(JOB_SERVER);
    expect(src).toMatch(/loadWorkerOpportunityBoard/);
    // No table, no RPC, no client of its own — the authorization rules live in
    // the use case, and a second read path would be a second set of them.
    expect(src).not.toMatch(/createClient|\.from\(|\.rpc\(/);
  });

  it("selecting a match writes World State instead of opening a page", () => {
    const src = read(MESSAGES);
    expect(src).toMatch(/openEntity\(\{\s*type: "job"/);
    expect(src).toMatch(/useWorldStateOptional/);
  });
});

describe("W3 — a new entity type is a registration", () => {
  it("the registry is the only place a type is bound to a resolver", () => {
    const src = read(RESOLVERS);
    expect(src).toMatch(/registerEntityContextResolver\("job", resolveJobContext\)/);
    // W4 added `project` — one registration line, no panel change. The exact
    // list is not pinned (the world is meant to grow); what is pinned is that
    // growth happens HERE and nowhere else, plus the two-way sync below.
    expect(REGISTERED_ENTITY_TYPES).toContain("job");
  });

  it("the allowlist and the registrations stay in sync, both ways", () => {
    // A registered resolver missing from the allowlist would be unreachable;
    // an allowlisted type with no resolver would degrade for no reason. Both
    // are silent failures, so both are asserted.
    const src = read(RESOLVERS);
    const registered = [...src.matchAll(/registerEntityContextResolver\("([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect([...registered].sort()).toEqual([...REGISTERED_ENTITY_TYPES].sort());
  });

  it("the entity type never reaches the lookup unvalidated", () => {
    // The type comes from the client. CodeQL flagged the direct
    // `resolverFor(ref.type)` form as an unvalidated dynamic dispatch; the
    // fix — match against this module's own constant list, then look up with
    // the MATCHED LITERAL — must not be undone by a later simplification.
    const src = read(RESOLVERS);
    expect(src).not.toMatch(/resolverFor\(ref\.type\)/);
    expect(src).toMatch(/REGISTERED_ENTITY_TYPES\.find\(/);
    expect(src).toMatch(/typeof resolver !== "function"/);
  });

  it("the panel has no per-type branch — it renders the resolved view", () => {
    const src = read(PANEL);
    // If the panel ever learns what a "job" is, registering a type stops being
    // enough and `registrationIsEnough` in the declaration becomes a lie.
    expect(src).not.toMatch(/"job"|'job'/);
    expect(src).not.toMatch(/"person"|"organization"|"project"/);
  });

  it("an unregistered type degrades honestly instead of rendering emptiness", () => {
    expect(read(RESOLVERS)).toMatch(/unknownTypeReason/);
    expect(read(PANEL)).toMatch(/context-panel-unavailable/);
  });
});

describe("W3 — the declaration", () => {
  const decl = PRODUCT_SURFACES.find((s) => s.id === PANEL);

  it("exists and cites the axiom that names the Context Panel", () => {
    expect(decl, "the Context Panel must be declared").toBeTruthy();
    expect(decl?.originAxiom).toBe("A-01");
  });

  it("answers the map question with a REAL yes — the waiver is gone (W6)", () => {
    // W6 shipped the workspace map: the selection flies the map to the
    // entity's place and a marker click opens the entity. The transitional
    // waiver was deleted the moment the answer became true — the self-expiry
    // the owner demanded, enforced here so it can never quietly return.
    expect(decl?.reflectedOnMap).toBe(true);
    expect(decl?.transitionalWaiver).toBeUndefined();
  });

  it("answers every blocking question with a real YES", () => {
    expect(decl?.changesWorldState).toBe(true);
    expect(decl?.aiControlled).toBe(true);
    expect(decl?.usableWithoutLeavingWorkspace).toBe(true);
    expect(decl?.needsNoNewPage).toBe(true);
    expect(decl?.usesEntity).toBe(true);
    expect(decl?.registrationIsEnough).toBe(true);
    expect(decl?.worldStateCanControlIt).toBe(true);
  });

  it("adds no route — `needsNoNewPage` is a fact, not a claim", () => {
    // The whole slice must not introduce a page. If a future patch adds one
    // while keeping this declaration, the declaration becomes false — so the
    // panel's own directory is asserted to contain no route file.
    const panelDir = join(WEB, "components", "app", "world-state");
    expect(() => readFileSync(join(panelDir, "page.tsx"), "utf8")).toThrow();
  });
});

describe("W3 — copy exists in every active locale", () => {
  const KEYS = [
    "regionLabel",
    "workTitle",
    "notStated",
    "contactNote",
    "sectionRequirements",
    "sectionRecommendations",
    "sectionActions",
    "unavailableNoAccess",
  ];

  it("every panel key is present in all 11 catalogues", () => {
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        workspace?: { panel?: Record<string, unknown> };
      };
      const panel = json.workspace?.panel;
      expect(panel, `${locale}: workspace.panel missing`).toBeTruthy();
      for (const key of KEYS) {
        expect(String(panel?.[key] ?? ""), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("the honest 'no direct contact' note is real copy in every locale", () => {
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        workspace: { panel: Record<string, string> };
      };
      // Contact policy is `platform_workflow_only`; the panel must state it
      // everywhere, not only in English.
      expect(json.workspace.panel.contactNote.length).toBeGreaterThan(20);
    }
  });
});
