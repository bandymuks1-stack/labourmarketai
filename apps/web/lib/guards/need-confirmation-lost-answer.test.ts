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
const ROUTE = read("app/api/demand/just-saved/route.ts");
const WORKFLOW = readFileSync(join(WEB, "..", "..", ".github/workflows/signup-isolated.yml"), "utf8");

describe("a saved need is confirmed even when the answer is lost", () => {
  it("'was it saved?' is a plain request to the route, never a server action", () => {
    // The lost answer came through the router's one action queue; a follow-up
    // action can be stranded behind it (CI run 45365699921: no request in 30 s).
    const ask = FORM.indexOf("const askSaved = (): Promise<string | null> =>");
    expect(ask, "one helper asks").toBeGreaterThan(-1);
    expect(FORM.slice(ask, ask + 300)).toMatch(/fetch\("\/api\/demand\/just-saved"/);
    expect(FORM).not.toMatch(/findOwnJustSubmittedDemandAction/);
  });

  it("a lost answer asks before it says 'could not send'", () => {
    const lost = FORM.indexOf('if (!res || typeof res !== "object" || typeof res.ok !== "boolean")');
    expect(lost, "the lost-answer branch exists").toBeGreaterThan(-1);
    const branch = FORM.slice(lost, lost + 300);
    expect(branch).toMatch(/const savedId = await askSaved\(\);/);
    expect(branch).toMatch(/if \(savedId\) await confirmSaved\(savedId\);\s*else setState\("error"\);/);
  });

  it("an answer that never comes: the watchdog only ever confirms a saved need, never fails early", () => {
    const dog = FORM.indexOf("for (const wait of [10_000, 8_000, 8_000, 8_000])");
    expect(dog, "the watchdog exists").toBeGreaterThan(-1);
    const body = FORM.slice(dog, dog + 400);
    expect(body).toMatch(/const id = await askSaved\(\);/);
    expect(body).toMatch(/await confirmSaved\(id\);/);
    expect(body).not.toMatch(/setState\("error"\)/);
    // One outcome per send: the answer and the watchdog both check `settled`.
    expect(FORM.match(/if \(settled\) return;/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("the route only reads, through the one lookup, and answers an id or null", () => {
    expect(ROUTE).toMatch(/export async function POST\(/);
    expect(ROUTE).toMatch(/findOwnJustSubmittedDemand\(/);
    expect(ROUTE).toMatch(/NextResponse\.json\(\{ id \}/);
    expect(ROUTE).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(ROUTE).not.toMatch(/"use server"/);
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
