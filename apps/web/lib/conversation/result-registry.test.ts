import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONVERSATION_RESULTS,
  RESULT_KINDS,
  actionsOpeningResult,
  canRenderInline,
  getResult,
  isResultKind,
  renderableResultsForContext,
  resultForAction,
} from "@/lib/conversation/result-registry";
import { CONVERSATION_ACTION_IDS } from "@/lib/conversation/action-registry";

/**
 * Conversation Control — result registry invariants (unified premium product v1).
 *
 * The result registry is a SATELLITE of the action registry, so its guards are
 * about not drifting away from it, and about the REAL DATA ONLY gate actually
 * biting: an unverified data source must never be renderable inline.
 */

const APP_ROOT = process.cwd();
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const CONTEXTS = ["personal", "organization", "project"] as const;

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"));
}
function deepGet(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

describe("result registry — structure", () => {
  it("has a non-empty, unique kind set", () => {
    expect(CONVERSATION_RESULTS.length).toBeGreaterThan(0);
    expect(new Set(RESULT_KINDS).size).toBe(RESULT_KINDS.length);
  });

  it("every result is well-formed", () => {
    for (const r of CONVERSATION_RESULTS) {
      expect(r.kind, `${r.kind} kind`).toMatch(/^[a-z][a-z-]*$/);
      expect(r.titleKey, `${r.kind} titleKey`).toMatch(/^conversation\.results\./);
      expect(r.openedBy.length, `${r.kind} openedBy`).toBeGreaterThan(0);
      expect(r.contexts.length, `${r.kind} contexts`).toBeGreaterThan(0);
      // advancedRoute must stay a real, locale-prefix-free route: it is the
      // fallback the user still reaches when a result cannot render.
      expect(r.advancedRoute, `${r.kind} advancedRoute`).toMatch(/^\//);
      expect(r.advancedRoute).not.toMatch(/^\/(lt|en|ru|nl|de)\//);
    }
  });
});

describe("result registry — stays a satellite of the action registry", () => {
  it("every openedBy id exists in the action registry", () => {
    const known = new Set(CONVERSATION_ACTION_IDS);
    for (const r of CONVERSATION_RESULTS) {
      for (const id of r.openedBy) {
        expect(known.has(id), `${r.kind} references unknown action "${id}"`).toBe(
          true,
        );
      }
    }
  });

  it("actionsOpeningResult resolves through the action registry", () => {
    for (const r of CONVERSATION_RESULTS) {
      const actions = actionsOpeningResult(r.kind);
      expect(actions.length, `${r.kind} resolves no actions`).toBe(
        r.openedBy.length,
      );
    }
  });

  it("never redefines an action — no id/role/confirmation fields leak in", () => {
    for (const r of CONVERSATION_RESULTS) {
      const keys = Object.keys(r);
      expect(keys).not.toContain("allowedRoles");
      expect(keys).not.toContain("confirmation");
      expect(keys).not.toContain("handler");
      expect(keys).not.toContain("precondition");
    }
  });
});

describe("result registry — REAL DATA ONLY gate", () => {
  it("an unverified result can never render inline in any context", () => {
    const unverified = CONVERSATION_RESULTS.filter(
      (r) => r.dataReadiness === "unverified",
    );
    // NOTE, W6 slice 3: this used to also assert `unverified.length > 0`, on
    // the reasoning that "the gate is meaningless if nothing is gated". Both
    // entries it named have since been verified and promoted — `market` in
    // Goal 3, and `reputation` (now `experiences`) by the W6 experience
    // domain. Keeping that assertion would have meant holding a result back
    // from a data source that IS real just to keep a counter above zero, which
    // is the opposite of what the gate is for. The invariant that matters is
    // unverified ⇒ never inline, and the NEXT test pins it on the gate
    // function itself rather than on a sample, so it cannot rot away when the
    // gated list happens to be empty.
    for (const r of unverified) {
      for (const ctx of CONTEXTS) {
        expect(canRenderInline(r.kind, ctx), `${r.kind} inline in ${ctx}`).toBe(
          false,
        );
      }
    }
  });

  it("the gate itself is readiness AND context — for every entry, always", () => {
    // Pinned on the FUNCTION, not on whichever entries happen to be gated
    // today: `canRenderInline` must agree with the two declared conditions for
    // every kind in every context. A future entry that flips to `unverified`
    // is then covered the moment it is added, with no test to remember.
    for (const r of CONVERSATION_RESULTS) {
      for (const ctx of CONTEXTS) {
        expect(canRenderInline(r.kind, ctx), `${r.kind} in ${ctx}`).toBe(
          r.dataReadiness === "real" && r.contexts.includes(ctx),
        );
      }
    }
  });

  it("renderableResultsForContext excludes every unverified result", () => {
    for (const ctx of CONTEXTS) {
      for (const r of renderableResultsForContext(ctx)) {
        expect(r.dataReadiness).toBe("real");
        expect(r.contexts).toContain(ctx);
      }
    }
  });

  it("a gated result still keeps a working fallback route", () => {
    for (const r of CONVERSATION_RESULTS) {
      if (r.dataReadiness === "unverified") {
        expect(r.advancedRoute, `${r.kind} lost its fallback`).toMatch(/^\//);
      }
    }
  });

  it("canRenderInline respects context, not just readiness", () => {
    const personalOnly = CONVERSATION_RESULTS.find(
      (r) => r.dataReadiness === "real" && !r.contexts.includes("organization"),
    );
    expect(personalOnly).toBeDefined();
    if (personalOnly) {
      expect(canRenderInline(personalOnly.kind, "organization")).toBe(false);
    }
  });
});

describe("result registry — lookups reject invented values", () => {
  it("isResultKind narrows only to real kinds", () => {
    expect(isResultKind("player-card")).toBe(true);
    expect(isResultKind("not-a-result")).toBe(false);
    expect(isResultKind(null)).toBe(false);
    expect(isResultKind(42)).toBe(false);
  });

  it("getResult / resultForAction return undefined for unknown input", () => {
    expect(getResult("not-a-result")).toBeUndefined();
    expect(resultForAction("worker.does-not-exist")).toBeUndefined();
  });

  it("canRenderInline is false for an invented kind", () => {
    expect(canRenderInline("nope" as never, "personal")).toBe(false);
  });
});

describe("result registry — purity (no data system, no domain logic)", () => {
  const src = readFileSync(
    join(APP_ROOT, "lib", "conversation", "result-registry.ts"),
    "utf8",
  );
  it("never imports supabase / server-only / fetch and never writes the DB", () => {
    expect(src).not.toMatch(/from\s+["']@\/lib\/supabase/);
    expect(src).not.toMatch(/["']server-only["']/);
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(src).not.toMatch(/\bfetch\(/);
  });
});

describe("result registry — i18n parity (all active locales)", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}.json defines every result title`, () => {
      const messages = loadMessages(locale);
      for (const r of CONVERSATION_RESULTS) {
        const value = deepGet(messages, r.titleKey);
        expect(typeof value, `${locale} missing ${r.titleKey}`).toBe("string");
        expect((value as string).length, `${locale} empty ${r.titleKey}`).
          toBeGreaterThan(0);
      }
    });
  }
});
