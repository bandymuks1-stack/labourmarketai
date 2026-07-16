import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Bounded request budgets (Wagon 1) — wiring guard.
 *
 * Pins that EVERY company→worker request server action routes through the
 * shared fail-closed budget (lib/limits/request-rate-limits.ts) BEFORE its
 * write, so the cap cannot silently disappear in a refactor:
 *   - booking proposals   (lib/booking/booking-actions.ts)
 *   - conversation opens  (lib/communication/request-worker-conversation.ts)
 *   - contact-detail asks (lib/privacy/contact-disclosure-actions.ts)
 */

const webRoot = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("shared budget module is the single source of the caps", () => {
  it("company budget is 10 open / 30 per day (matches both draft RPC caps)", () => {
    const src = read("lib/limits/request-rate-limits.ts");
    expect(src).toMatch(/maxOpen:\s*10/);
    expect(src).toMatch(/maxPerDay:\s*30/);
  });
});

describe("booking proposals are budget-gated", () => {
  const src = read("lib/booking/booking-actions.ts");

  it("proposeBookingAction evaluates the budget and can return rate-limited", () => {
    expect(src).toMatch(/evaluateRequestBudget/);
    expect(src).toMatch(/COMPANY_REQUEST_LIMITS/);
    expect(src).toMatch(/kind:\s*"rate-limited"/);
  });

  it("tries the v3 defense-in-depth RPC first, falls back to the applied v1", () => {
    expect(src).toMatch(/propose_booking_request_v3/);
    expect(src).toMatch(/rpc\("propose_booking_request",/);
  });
});

describe("conversation requests are budget-gated", () => {
  const src = read("lib/communication/request-worker-conversation.ts");

  it("counts the caller's rolling-24h conversations and evaluates the budget", () => {
    expect(src).toMatch(/CONVERSATION_REQUEST_LIMITS/);
    expect(src).toMatch(/evaluateRequestBudget/);
    expect(src).toMatch(/rollingDayFloorIso/);
    expect(src).toMatch(/reason:\s*"rate_limited"/);
  });

  it("the budget gate runs BEFORE the conversation is created", () => {
    const budgetIdx = src.indexOf("evaluateRequestBudget");
    const createIdx = src.indexOf("getOrCreateDirectConversation(", src.indexOf("export async function"));
    expect(budgetIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(budgetIdx);
  });
});

describe("contact-detail asks are budget-gated", () => {
  const src = read("lib/privacy/contact-disclosure-actions.ts");

  it("evaluates the budget before the propose RPC and can return rate-limited", () => {
    expect(src).toMatch(/evaluateRequestBudget/);
    expect(src).toMatch(/COMPANY_REQUEST_LIMITS/);
    expect(src).toMatch(/kind:\s*"rate-limited"/);
    const budgetIdx = src.indexOf("evaluateRequestBudget");
    const rpcIdx = src.indexOf("propose_contact_disclosure_request_v1");
    expect(budgetIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(budgetIdx);
  });
});

describe("worker-side: TWO SEPARATE decisions (shared contract)", () => {
  const src = read("lib/privacy/contact-disclosure-actions.ts");

  it("the respond action (decision 1) never touches the consent ledger", () => {
    const respondFn = src
      .split("export async function respondContactDisclosureAction")[1]
      ?.split("export ")[0] ?? "";
    expect(respondFn).toContain("respond_contact_disclosure_request_v1");
    expect(respondFn).not.toContain("grant_employer_data_disclosure");
  });

  it("the SEPARATE grant action (decision 2) is the ONLY consent-ledger caller and requires an accepted ask", () => {
    expect(src.split('"grant_employer_data_disclosure"').length - 1).toBe(1);
    const grantFn = src
      .split("export async function grantContactDisclosureAction")[1] ?? "";
    expect(grantFn).toContain('"grant_employer_data_disclosure"');
    expect(grantFn).toContain('row.status !== "accepted"');
  });

  it("never selects a contact column from workers/profiles", () => {
    expect(src).not.toMatch(/select\([^)]*(phone|email|full_name)/i);
  });
});
