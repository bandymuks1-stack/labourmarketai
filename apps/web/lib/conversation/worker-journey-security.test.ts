import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Worker conversation journey — runtime security invariants (Phase B).
 *
 * These complement the pure unit tests (confirmation-token, dispatch-core) by
 * pinning the SHAPE of the server dispatcher + client flow so a refactor cannot
 * silently drop a control: server-derived identity, mandatory confirmation for
 * strong/important tiers, no client-asserted profile ids, no PII in telemetry,
 * and no LLM dependency in the deterministic surface.
 */

const APP_ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("dispatcher enforces confirmation + server-derived identity", () => {
  const src = read("lib/conversation/dispatch.ts");

  it("derives the acting user server-side and never accepts a client profile id", () => {
    expect(src).toMatch(/supabase\.auth\.getUser\(\)/);
    // No parameter/among-input path that would let the caller assert who they are.
    expect(src).not.toMatch(/profileId/);
    expect(src).not.toMatch(/userId\s*:\s*input/);
  });

  it("requires a confirmation token for important/strong tiers and rejects when missing", () => {
    expect(src).toMatch(/requiresConfirmation\(/);
    expect(src).toContain("confirmation_required");
    expect(src).toContain("stale_confirmation");
    expect(src).toMatch(/verifyConfirmationToken\(/);
  });

  it("validates every input with a zod schema before executing", () => {
    expect(src).toMatch(/WORKER_ACTION_SCHEMAS\[/);
    expect(src).toMatch(/\.safeParse\(/);
    expect(src).toContain('code: "invalid"');
  });

  it("re-checks authorization via the pure core (role gate) before executing", () => {
    expect(src).toMatch(/authorizeDispatch\(/);
  });
});

describe("executors delegate only — never write the DB directly", () => {
  const src = read("lib/conversation/worker-executors.ts");
  it("imports canonical server actions, not the supabase client", () => {
    expect(src).not.toMatch(/from\s+["']@\/lib\/supabase/);
    expect(src).toMatch(/from\s+["']@\/lib\/booking\/booking-actions["']/);
    expect(src).toMatch(/from\s+["']@\/lib\/worker\//);
  });
  it("marks itself server-only", () => {
    expect(src).toMatch(/["']server-only["']/);
  });
});

describe("conversation telemetry carries no PII", () => {
  const booking = read("components/app/conversation/worker-booking-action.tsx");
  it("the booking flow emits only bounded scalars (surface/role_context/success)", () => {
    // No free-text, no names, no ids in the tracked metadata.
    expect(booking).toMatch(/surface:\s*"conversation"/);
    expect(booking).not.toMatch(/trackFunnel\([^)]*\b(name|email|title|note|bookingId)\b/);
  });
});

describe("deterministic surface does not depend on the LLM", () => {
  const shell = read("components/app/conversation/conversation-shell.tsx");
  const page = read("app/[locale]/dashboard/assistant/page.tsx");
  it("shell + page never import an AI runtime / provider", () => {
    for (const src of [shell, page]) {
      expect(src).not.toMatch(/from\s+["']@\/lib\/ai\//);
      expect(src).not.toMatch(/runAiAgent|getAiRuntimeConfig|resolveAiRuntimeConfig/);
    }
  });
  it("intent resolution uses the deterministic command matcher", () => {
    expect(shell).toMatch(/matchCommands\(/);
  });
});
