import { describe, expect, it } from "vitest";

import { conversationIntentInputSchema } from "@/lib/ai/registry/agents/conversation-intent";

import {
  INTENT_HINTS,
  ORGANIZATION_WORKSPACE_ONLY_INTENTS,
  intentCatalogue,
  intentCatalogueFor,
} from "./intent-catalogue";
import { INTENT_REGISTRY } from "./intent-registry";

/**
 * The model reads the catalogue on every unclear sentence, so its size is the
 * proposer's quota (owner order 2026-11-22: Cloudflare's free daily allowance).
 * A person's catalogue leaves out the actions only an organisation's own
 * workspace can run; the company catalogue stays complete.
 */

const size = (rows: ReadonlyArray<unknown>) => JSON.stringify(rows).length;

describe("the catalogue the proposer receives, per identity", () => {
  it("every excluded id is a real, registered intent (no stale exclusion)", () => {
    for (const id of ORGANIZATION_WORKSPACE_ONLY_INTENTS) {
      expect(Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, id), id).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(INTENT_HINTS, id), id).toBe(true);
    }
    expect(new Set(ORGANIZATION_WORKSPACE_ONLY_INTENTS).size).toBe(ORGANIZATION_WORKSPACE_ONLY_INTENTS.length);
  });

  it("a company receives the whole vocabulary", () => {
    expect(intentCatalogueFor("company")).toEqual(intentCatalogue());
  });

  it("a person receives everything except the organisation-workspace-only actions", () => {
    const person = intentCatalogueFor("person").map((r) => r.id);
    for (const id of ORGANIZATION_WORKSPACE_ONLY_INTENTS) expect(person, id).not.toContain(id);
    expect(person.length).toBe(intentCatalogue().length - ORGANIZATION_WORKSPACE_ONLY_INTENTS.length);
  });

  it("the doors a person uses to start acting for an organisation stay in the person's catalogue", () => {
    const person = intentCatalogueFor("person").map((r) => r.id);
    for (const id of ["switch-context", "create-organization", "need-workers", "find-workers", "confirm-work", "context"] as const) {
      expect(person, id).toContain(id);
    }
  });

  it("no personal, journal or CV action is ever withheld from a person", () => {
    for (const id of ORGANIZATION_WORKSPACE_ONLY_INTENTS) {
      expect(["profile", "cv", "documents", "journal"], id).not.toContain(INTENT_REGISTRY[id].domain);
    }
  });

  it("both catalogues still satisfy the agent's input contract", () => {
    for (const identity of ["person", "company"] as const) {
      const parsed = conversationIntentInputSchema.safeParse({
        sentence: "x y",
        locale: "lt",
        identity,
        intents: intentCatalogueFor(identity),
      });
      expect(parsed.success, identity).toBe(true);
    }
  });

  it("the person's catalogue is measurably smaller (quota)", () => {
    const full = size(intentCatalogue());
    const person = size(intentCatalogueFor("person"));
    // Recorded for the PR: characters the model no longer reads per unclear
    // sentence from a person. A regression that re-adds the rows fails here.
    expect(person).toBeLessThan(full * 0.9);
    console.info(`[intent-catalogue] full=${full} chars, person=${person} chars, saved=${full - person} (${Math.round((100 * (full - person)) / full)}%)`);
  });
});
