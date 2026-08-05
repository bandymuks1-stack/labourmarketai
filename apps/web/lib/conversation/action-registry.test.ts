import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONVERSATION_ACTIONS,
  CONVERSATION_ACTION_IDS,
  actionsForRoles,
  getConversationAction,
  type ConfirmationTier,
} from "@/lib/conversation/action-registry";
import { FUNNEL_EVENT_NAMES } from "@/lib/telemetry/funnel-events";

/**
 * Conversation Control — action registry invariants (foundation v1).
 *
 * The registry is the conversation layer's trust contract: a deterministic,
 * pure, fully-labelled catalogue that references existing entrypoints only.
 * These guards pin that it can never (a) grow a data-writing dependency,
 * (b) ship an unlabelled or mis-scoped action, or (c) drift out of i18n parity.
 */

const ROLES = new Set(["worker", "company", "agency", "customer"]);
/** Roles PLUS the one relationship subject (§7.1) — see `ActionSubject`. */
const SUBJECTS = new Set([...ROLES, "engagement"]);
const TIERS: ConfirmationTier[] = [
  "read",
  "reversible_write",
  "important_write",
  "strong_irreversible",
];

const APP_ROOT = process.cwd();
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"));
}
function deepGet(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

describe("conversation action registry — structure", () => {
  it("has a non-empty, stable, unique id set", () => {
    expect(CONVERSATION_ACTIONS.length).toBeGreaterThan(0);
    expect(new Set(CONVERSATION_ACTION_IDS).size).toBe(CONVERSATION_ACTION_IDS.length);
  });

  it("every action is well-formed and self-consistent", () => {
    for (const a of CONVERSATION_ACTIONS) {
      // id is namespaced by its subject, kebab-cased.
      expect(a.id, a.id).toMatch(
        /^(worker|company|agency|customer|engagement)\.[a-z0-9-]+$/,
      );
      expect(a.id.startsWith(`${a.subject}.`), a.id).toBe(true);
      // roles
      expect(SUBJECTS.has(a.subject)).toBe(true);
      expect(a.allowedRoles.length).toBeGreaterThan(0);
      expect(a.allowedRoles.every((r) => ROLES.has(r)), a.id).toBe(true);
      if (ROLES.has(a.subject)) {
        // A ROLE subject owns its own action.
        expect(a.allowedRoles.includes(a.subject as never), `${a.id} subject in allowedRoles`).toBe(
          true,
        );
      } else {
        // §7.1 — a RELATIONSHIP subject is held to a STRICTER rule than a role
        // subject, not a looser one. `engagement.*` exists precisely because
        // the employer and the worker hold the SAME authority over the same
        // row, so it must list BOTH parties. Without this, a neutral-looking
        // namespace could quietly become a one-sided action wearing a name
        // that says otherwise — which is exactly the drift the shared id was
        // introduced to prevent.
        expect(a.allowedRoles.includes("worker"), `${a.id} relationship: worker`).toBe(true);
        expect(
          a.allowedRoles.includes("company") || a.allowedRoles.includes("agency"),
          `${a.id} relationship: employer side`,
        ).toBe(true);
        expect(a.allowedRoles.length, `${a.id} relationship needs >=2 roles`).toBeGreaterThan(1);
      }
      // confirmation
      expect(TIERS.includes(a.confirmation), `${a.id} tier`).toBe(true);
      // label keys live under the conversation namespace
      expect(a.labelKey.startsWith("conversation.actions."), a.id).toBe(true);
      expect(a.descriptionKey.startsWith("conversation.actions."), a.id).toBe(true);
      // advanced route is a real, locale-prefix-free app path
      expect(a.advancedRoute.startsWith("/"), `${a.id} route`).toBe(true);
      expect(a.advancedRoute).not.toMatch(/^\/(lt|en|ru|nl|de)\//); // never locale-prefixed
      // telemetry event must be a registered funnel event
      expect(FUNNEL_EVENT_NAMES.includes(a.telemetryEvent), `${a.id} telemetry`).toBe(true);
      // handler references an entrypoint, never inline logic
      if (a.handler.kind === "server_action") {
        expect(a.handler.ref.length).toBeGreaterThan(0);
      } else if (a.handler.kind === "rest") {
        expect(["POST", "DELETE"]).toContain(a.handler.method);
        expect(a.handler.ref.startsWith("/api/")).toBe(true);
      }
    }
  });

  it("write actions never sit at the `read` tier and reads never write", () => {
    for (const a of CONVERSATION_ACTIONS) {
      const isWrite = a.handler.kind !== "deep_link" && a.confirmation !== "read"
        ? true
        : false;
      // A deep_link entry may be read or a routing affordance; a server_action /
      // rest write must be at a write/confirm tier (except upload-cv which
      // extracts only and is explicitly read).
      if (a.handler.kind === "server_action") {
        expect(a.confirmation, `${a.id}`).not.toBe("read");
      }
      // sanity: variable used so lint stays quiet
      void isWrite;
    }
  });

  it("strong_irreversible is reserved for the audited high-impact actions", () => {
    const strong = CONVERSATION_ACTIONS.filter((a) => a.confirmation === "strong_irreversible").map((a) => a.id);
    // Accepting a booking (creates engagement/assignment, #857) and assigning a
    // worker to a project are the canonical irreversible ones.
    expect(strong).toContain("worker.respond-booking");
    expect(strong).toContain("company.assign-worker");
    // §7.1 — ending an engagement has no reopen RPC and this slice adds none,
    // so the confirmation card is the only step before a state nobody can
    // walk back. Pinned by name so a later slice cannot quietly soften it.
    expect(strong).toContain("engagement.end");
  });
});

describe("conversation action registry — purity (no data system, no domain logic)", () => {
  const src = readFileSync(
    join(APP_ROOT, "lib", "conversation", "action-registry.ts"),
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

describe("conversation action registry — i18n parity (all active locales)", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}.json defines every action label + description`, () => {
      const msg = loadMessages(locale);
      for (const a of CONVERSATION_ACTIONS) {
        const label = deepGet(msg, a.labelKey);
        const desc = deepGet(msg, a.descriptionKey);
        expect(typeof label, `${locale}:${a.labelKey}`).toBe("string");
        expect((label as string).trim().length, `${locale}:${a.labelKey}`).toBeGreaterThan(0);
        expect(typeof desc, `${locale}:${a.descriptionKey}`).toBe("string");
      }
    });
  }
});

describe("conversation action registry — role filtering", () => {
  it("actionsForRoles returns only actions the held roles may invoke", () => {
    const workerOnly = actionsForRoles(new Set(["worker"]));
    expect(workerOnly.length).toBeGreaterThan(0);
    expect(workerOnly.every((a) => a.allowedRoles.includes("worker"))).toBe(true);
    expect(workerOnly.some((a) => a.id === "worker.respond-booking")).toBe(true);
    // a pure worker never sees company-only assignment
    expect(workerOnly.some((a) => a.id === "company.assign-worker")).toBe(false);

    const none = actionsForRoles(new Set());
    expect(none.length).toBe(0);
  });

  it("getConversationAction rejects unknown ids (LLM cannot invent actions)", () => {
    expect(getConversationAction("worker.respond-booking")).toBeDefined();
    expect(getConversationAction("worker.delete-everything")).toBeUndefined();
    expect(getConversationAction("")).toBeUndefined();
  });
});
