import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PRODUCTION BILLING WALK NEVER PAYS FOR REAL.
 *
 * `tests/e2e/prod-billing-test-mode.spec.ts` drives Stripe Checkout and the
 * Stripe customer portal on PRODUCTION with a synthetic organization, after the
 * owner armed Stripe TEST mode. Playwright specs are not run by vitest or CI, so
 * these properties are pinned on the source:
 *
 *   1. the only card numbers in the file are Stripe's documented TEST cards
 *      (4242 4242 4242 4242; 4000 0000 0000 0341, which is named only to explain
 *      why the failure path is not automated);
 *   2. the card is filled in exactly one function, and that function proves
 *      Stripe TEST mode (`cs_test_` session + test badge) before touching any
 *      card field; the checkout route's answer is refused unless it is a TEST
 *      session; a LIVE billing state aborts step 0 before any click;
 *   3. the walk never goes to the Stripe Dashboard and only knows the two
 *      hosted Stripe hosts (Checkout, portal); every in-app navigation is
 *      relative to the production base URL;
 *   4. only the synthetic cast's storage slots are used, and no e-mail address
 *      is written in the walk at all: the payer's address comes from the
 *      synthetic allowlist constants (this guard does not import that module;
 *      only the walk-token guards may).
 */
const SPEC = readFileSync(join(__dirname, "..", "..", "tests", "e2e", "prod-billing-test-mode.spec.ts"), "utf8");

const ALLOWED_CARDS = new Set(["4242424242424242", "4000000000000341"]);
const CAST_SLOTS = new Set(["owner", "manager", "worker", "worker2", "agency"]);

/** The body of one top-level `async function name(` up to its closing brace at column 0. */
function functionBody(name: string): string {
  const start = SPEC.indexOf(`async function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const end = SPEC.indexOf("\n}\n", start);
  expect(end).toBeGreaterThan(start);
  return SPEC.slice(start, end);
}

describe("prod billing walk — card numbers", () => {
  it("every card-like digit run is a Stripe TEST card", () => {
    // 13–19 digits, optionally grouped by spaces or dashes (PAN shapes).
    const runs = SPEC.match(/\b\d(?:[ -]?\d){12,18}\b/g) ?? [];
    const cards = runs.map((r) => r.replace(/[ -]/g, ""));
    expect(cards.length, "the test card is present").toBeGreaterThan(0);
    for (const c of cards) expect(ALLOWED_CARDS.has(c), `card-like number ${c.slice(0, 4)}… is not a Stripe test card`).toBe(true);
  });

  it("the card constant is used only inside payWithTestCard", () => {
    const uses = SPEC.split("STRIPE_TEST_CARD").length - 1;
    const inPay = functionBody("payWithTestCard").split("STRIPE_TEST_CARD").length - 1;
    expect(inPay).toBe(1);
    expect(uses, "declaration + one use").toBe(2);
    // No other place fills a card field.
    const cardFills = SPEC.match(/#card(Number|Expiry|Cvc)/g) ?? [];
    const cardFillsInPay = functionBody("payWithTestCard").match(/#card(Number|Expiry|Cvc)/g) ?? [];
    expect(cardFills.length).toBe(cardFillsInPay.length);
  });
});

describe("prod billing walk — test mode before any card", () => {
  it("payWithTestCard proves Stripe TEST mode before touching a card field", () => {
    const body = functionBody("payWithTestCard");
    const proof = body.indexOf('await proveStripeTestMode(page, "checkout")');
    expect(proof, "the proof is called").toBeGreaterThan(0);
    expect(proof).toBeLessThan(body.indexOf("#cardNumber"));
    expect(proof).toBeLessThan(body.indexOf("STRIPE_TEST_CARD"));
    expect(proof).toBeLessThan(body.indexOf(".fill("));
  });

  it("the proof requires the cs_test_ session and Stripe's test badge on Checkout", () => {
    const body = functionBody("proveStripeTestMode");
    expect(body).toMatch(/toMatch\(\/\\\/cs_test_\/\)/);
    expect(body).toMatch(/test mode\|sandbox/);
    expect(body).toMatch(/toMatch\(\/\\\/session\\\/test_\/\)/);
  });

  it("the checkout route answer is refused unless it is a Stripe TEST session", () => {
    expect(SPEC).toMatch(/page\.route\("\*\*\/api\/billing\/test-checkout"/);
    expect(SPEC).toMatch(/body\.testMode === true && host === STRIPE_CHECKOUT_HOST && \/\\\/cs_test_\/\.test/);
    expect(SPEC).toMatch(/walk_refused_not_test_mode/);
  });

  it("step 0 aborts on LIVE billing and fails (never skips) when billing is not armed", () => {
    const step0 = SPEC.slice(SPEC.indexOf('test("0 '), SPEC.indexOf('test("1 '));
    const live = step0.indexOf("live_mode_refused");
    expect(live).toBeGreaterThan(0);
    // The first thing in step 0 that can click: a direct click, the portal
    // cancellation helper or the order button.
    const actions = [".click(", "cancelInPortal(", "orderButton("].map((a) => step0.indexOf(a)).filter((i) => i >= 0);
    expect(actions.length, "step 0 reaches an action").toBeGreaterThan(0);
    expect(live, "the LIVE check precedes every click").toBeLessThan(Math.min(...actions));
    expect(step0).toMatch(/billing_not_armed/);
    expect(step0).not.toMatch(/test\.skip\(/);
  });

  it("a payment step is never retried", () => {
    expect(SPEC).toMatch(/test\.describe\.configure\(\{ mode: "serial",[^}]*retries: 0 \}\)/);
  });
});

describe("prod billing walk — hosts", () => {
  it("never the Stripe Dashboard, only the two hosted Stripe hosts", () => {
    // This scans the spec's SOURCE TEXT. Every dotted name in it that ends in
    // ".stripe.com" must be exactly one of the two hosted hosts, so the Dashboard
    // and the API host (dashboard./api.stripe.com) can never appear. Exact-set
    // equality, not substring or unanchored-regex checks (CodeQL alerts 139/141).
    const src = SPEC.toLowerCase();
    const hosts = new Set(
      (src.match(/[a-z0-9.-]+/g) ?? []).filter((w) => w === "stripe.com" || w.endsWith(".stripe.com")),
    );
    expect([...hosts].sort()).toEqual(["billing.stripe.com", "checkout.stripe.com"]);
  });

  it("every page.goto in the walk is relative to the production base URL", () => {
    const gotos = SPEC.match(/\.goto\(\s*[`"'][^`"']*/g) ?? [];
    expect(gotos.length).toBeGreaterThan(0);
    for (const g of gotos) expect(g.replace(/^\.goto\(\s*[`"']/, ""), g).toMatch(/^\//);
  });
});

describe("prod billing walk — synthetic cast only", () => {
  it("uses only the minted synthetic storage slots", () => {
    const slots = [
      ...(SPEC.match(/as\(browser, "([a-z0-9]+)"/g) ?? []).map((m) => m.replace(/.*"([a-z0-9]+)"$/, "$1")),
      ...(SPEC.match(/slot: "([a-z0-9]+)"/g) ?? []).map((m) => m.replace(/.*"([a-z0-9]+)"$/, "$1")),
      ...(SPEC.match(/bearerOf\("([a-z0-9]+)"\)/g) ?? []).map((m) => m.replace(/.*"([a-z0-9]+)"\)$/, "$1")),
      ...(SPEC.match(/\["[a-z0-9", ]+\]\.every\(\(s\) => existsSync/g) ?? []).flatMap(
        (m) => m.match(/"([a-z0-9]+)"/g)?.map((q) => q.replace(/"/g, "")) ?? [],
      ),
    ];
    expect(slots.length).toBeGreaterThan(3);
    for (const s of slots) expect(CAST_SLOTS.has(s), `slot "${s}" is not in the synthetic cast`).toBe(true);
  });

  it("writes no e-mail address; the payer's comes from the synthetic allowlist constants", () => {
    expect(SPEC.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).toEqual([]);
    expect(SPEC).toMatch(/import \{ PROD_QA_MANAGER_EMAIL, PROD_QA_OWNER_EMAIL \} from "\.\.\/\.\.\/lib\/testing\//);
  });

  it("acts only for QA-SYNTHETIC organizations", () => {
    const orgs = SPEC.match(/const (ALFA|GAMA) = "([^"]+)"/g) ?? [];
    expect(orgs.length).toBe(2);
    for (const o of orgs) expect(o).toMatch(/"QA-SYNTHETIC /);
  });
});

describe("prod billing walk — VAT total before paying (owner 2026-10-21)", () => {
  it("checks the Checkout total is €99.00 or €119.79 before the pay button, and only then submits", () => {
    const pay = SPEC.slice(SPEC.indexOf("async function payWithTestCard"));
    const check = pay.indexOf("await proveTestTotal(page);");
    const submit = pay.indexOf(`await page.locator('button[type="submit"]').first().click();`);
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(submit);
    expect(SPEC).toContain("vat_total_unexpected");
  });
});
