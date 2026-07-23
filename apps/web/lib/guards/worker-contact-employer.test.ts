import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard — canonical-journey P1: the worker → employer contact action stays
 * honest and default-closed.
 *
 * The action (lib/opportunities/contact-employer.ts) is the ONLY place a
 * worker can turn their interest signal into a real thread. This guard pins:
 *   1. the caller's OWN facts (worker row + own interest signal) are
 *      verified under the caller's RLS session BEFORE the owner resolution;
 *   2. the owner resolution goes through the gated SECURITY DEFINER RPC
 *      contact_demand_owner_v1 — NEVER the service-role client (production
 *      allowlists service_role table grants; the admin-client read failed
 *      42501 for every worker, 2026-07-23 E2E first break) — and never
 *      returns a profile id to the caller; the missing RPC is
 *      feature-detected as the honest "needs_migration";
 *   3. the same visibility gate as the worker board (submitted + verified
 *      company) is enforced through the pure eligibility function;
 *   4. the §8.1 grant used is allowed_demand_interest (the real relationship),
 *      and the thread is opened via the canonical 0021 backend — no second
 *      communication system, no fabricated first message, no phone/email.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const src = read("lib/opportunities/contact-employer.ts");

describe("worker contact-employer action — order + default-closed", () => {
  it("is a server action with server-only import", () => {
    expect(src).toMatch(/"use server"/);
    expect(src).toMatch(/import "server-only"/);
  });

  it("verifies the caller's own signal BEFORE the owner-resolution RPC", () => {
    const ownSignalIdx = src.indexOf("demand_interest_signals");
    const rpcIdx = src.indexOf('rpc("contact_demand_owner_v1"');
    expect(ownSignalIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(ownSignalIdx).toBeLessThan(rpcIdx);
    // Withdrawn signals never pass.
    expect(src).toMatch(/signalStatus !== "withdrawn"/);
  });

  it("never uses the service-role client — owner resolution is the gated RPC", () => {
    // service_role table grants are a deliberate allowlist in production;
    // an admin-client read of customer_requests/companies dies with 42501.
    expect(src).not.toMatch(/createAdminClient/);
    expect(src).not.toMatch(/@\/lib\/supabase\/admin/);
    // The missing RPC degrades honestly, never as a generic error.
    expect(src).toMatch(/"needs_migration"/);
    expect(src).toMatch(/42883|PGRST202/);
  });

  it("routes the decision through the pure eligibility gate", () => {
    expect(src).toMatch(/evaluateWorkerContactRequest\(/);
    expect(src).toMatch(/demandOpen: row\.demand_open/);
    expect(src).toMatch(/companyVerified: row\.company_verified/);
  });

  it("never returns a profile id to the caller", () => {
    // The success shape carries ONLY the conversation id.
    expect(src).toMatch(/\{ ok: true; conversationId: string \}/);
    expect(src).not.toMatch(/profileId[^)]*ok: true/);
    expect(src).not.toMatch(/return \{[^}]*profile_id/);
  });

  it("opens the thread through the canonical backend with the real grant", () => {
    expect(src).toMatch(/getOrCreateDirectConversation\(/);
    expect(src).toMatch(/"allowed_demand_interest"/);
    expect(src).toMatch(/type: "demand_interest", id: requestId/);
  });

  it("exposes no contact channel and sends nothing external", () => {
    // Strip comments first — the doc comment intentionally names the
    // forbidden channels to document the rule.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/phone|email/i);
    expect(code).not.toMatch(/fetch\(|axios|nodemailer|sendgrid|resend/i);
  });
});
