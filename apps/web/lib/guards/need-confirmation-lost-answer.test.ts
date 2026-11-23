import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A SAVED NEED IS ALWAYS CONFIRMED (owner order 2026-11-23, production run
 * 45241051644): when the submit's answer is lost or unreadable, the need form
 * asks whether the need was saved before it says "could not send" — a retry
 * would post a duplicate. The behaviour is walked end to end by
 * tests/e2e/need-confirmation-isolated.spec.ts (signup-isolated job).
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const FORM = read("components/app/demand-request-button.tsx");
const CORE = read("lib/demand/demand-request.ts");
const SPEC = read("tests/e2e/need-confirmation-isolated.spec.ts");
const WORKFLOW = readFileSync(join(WEB, "..", "..", ".github/workflows/signup-isolated.yml"), "utf8");

describe("a saved need is confirmed even when the answer is lost", () => {
  it("the form checks for the saved need before showing the error", () => {
    const lost = FORM.indexOf('if (!res || typeof res !== "object" || typeof res.ok !== "boolean")');
    expect(lost, "the lost-answer branch exists").toBeGreaterThan(-1);
    const branch = FORM.slice(lost, lost + 600);
    expect(branch).toMatch(/findOwnJustSubmittedDemandAction\(intent, \{ role, description \}, sentAt\)/);
    expect(branch).toMatch(/setState\(savedId \? "done" : "error"\)/);
  });

  it("the lookup reads own open needs only, matched exactly, and returns an id only", () => {
    const at = CORE.indexOf("export async function findOwnJustSubmittedDemand(");
    expect(at).toBeGreaterThan(-1);
    const body = CORE.slice(at, CORE.indexOf("export async function getOwnLastDemandPrefill(", at));
    expect(body).toMatch(/requireEmployerCompany\(\)/);
    expect(body).toMatch(/\.eq\("profile_id", user\.id\)/);
    expect(body).toMatch(/\.eq\("organization_id", employer\.organizationId\)/);
    expect(body).toMatch(/\.eq\("status", "submitted"\)/);
    expect(body).toMatch(/\.eq\("need_summary", description\)/);
    expect(body).toMatch(/\.select\("id"\)/);
    expect(body).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("the regression walk breaks the answer both ways and runs in CI", () => {
    expect(SPEC).toMatch(/"lost-after-save"/);
    expect(SPEC).toMatch(/"never-sent"/);
    expect(WORKFLOW).toMatch(/tests\/e2e\/need-confirmation-isolated\.spec\.ts/);
  });
});
