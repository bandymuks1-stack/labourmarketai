import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE ACTIONS ON A PERSON'S PAGE LEAD SOMEWHERE.
 *
 * Owner readiness window, 2026-09-09, Priority 4. The page listed a person's
 * active service offerings as plain text with no way to act on any of them —
 * real data, no next action. §Priority 4's rule cuts both ways: no dead
 * buttons, and no decorative lists either.
 *
 * A SECOND ENTRY POINT, NOT A SECOND LOOP. The button calls the SAME
 * `requestServiceOffering` server action the marketplace surface calls, which
 * goes through the SAME `request_service_offering` SECURITY DEFINER RPC —
 * verified live on production 2026-09-09: the function exists and
 * `authenticated` has execute on it. These pins are what stop a future change
 * from quietly forking a second request model.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const page = read("app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx");
const button = read("components", "app", "person-service-request-button.tsx");

describe("1. the request action is the canonical one", () => {
  it("it calls the shared server action, not a new fetch or RPC", () => {
    expect(button).toContain(
      'from "@/lib/marketplace/service-requests"',
    );
    expect(button).toContain("requestServiceOffering(offeringId)");
    // No second transport, no second RPC name, no second table.
    expect(button).not.toMatch(/fetch\(/);
    expect(button).not.toMatch(/\.rpc\(/);
    expect(button).not.toMatch(/\.from\(/);
  });

  it("it is rendered for every listed offering, keyed by the real id", () => {
    expect(page).toContain("<PersonServiceRequestButton");
    expect(page).toContain("offeringId={o.id}");
  });

  it("its copy comes from the EXISTING marketplace namespace", () => {
    // A second entry point must not grow a second vocabulary.
    expect(page).toContain('getTranslations("marketplace")');
    for (const key of [
      "request",
      "requested",
      "duplicate",
      "offeringInactive",
      "notAvailable",
      "errorGeneric",
    ]) {
      expect(page, `label ${key}`).toContain(`tMarket("${key}")`);
      // …and the key really exists in the catalogue, in every routed locale.
      for (const loc of ["en", "lt", "ru", "nl", "de"]) {
        const cat = JSON.parse(read("messages", `${loc}.json`)) as {
          marketplace?: Record<string, unknown>;
        };
        expect(
          typeof cat.marketplace?.[key],
          `${loc}.marketplace.${key}`,
        ).toBe("string");
      }
    }
  });
});

describe("2. every outcome says something DIFFERENT, and none is a dead button", () => {
  it("all five honest results are handled distinctly", () => {
    for (const kind of ["ok", "duplicate", "inactive", "needs-migration"]) {
      expect(button, `result ${kind}`).toContain(`"${kind}"`);
    }
    // Four distinct messages, not one generic failure.
    for (const label of [
      "labels.duplicate",
      "labels.offeringInactive",
      "labels.notAvailable",
      "labels.errorGeneric",
      "labels.requested",
    ]) {
      expect(button, label).toContain(label);
    }
  });

  /** NEGATIVE CONTROL — a permanent "no" must REMOVE the button, not leave one
   *  that cannot succeed. That is the dead-button case §Priority 4 forbids. */
  it("a permanent no leaves no pressable button", () => {
    expect(button).toMatch(/const retryable\s*=\s*state === "idle" \|\| state === "error"/);
    expect(button).toContain("{retryable ? (");
    // The success state is a state, not a button that could fire again.
    expect(button).toContain('data-testid="person-service-requested"');
  });

  it("success and failure are BOTH reported to the funnel", () => {
    expect(button).toContain("FUNNEL_EVENTS.serviceRequestStarted");
    expect(button).toContain("FUNNEL_EVENTS.serviceRequestSent");
    expect(button).toContain('success: res.kind === "ok"');
    // Attributed to this surface, so the person-page entry point is
    // distinguishable from the marketplace one rather than inflating it.
    expect(button).toContain('surface: "person_page"');
  });
});

describe("3. the offering's country is named, not printed as a code", () => {
  it("the offering row reads through the shared catalogue", () => {
    expect(page).toContain("countryLabel(o.locationCountry, countries)");
    expect(page).not.toMatch(/\{o\.locationCountry\}/);
  });
});

describe("4. no self-request path exists to guard", () => {
  it("the page redirects a viewer looking at their own row", () => {
    // This is WHY the button needs no self-check. If the redirect is ever
    // removed, this fails and the omission becomes visible.
    expect(page).toMatch(/worker\.profile_id === user\.id/);
    expect(page).toMatch(/redirect\(`\/\$\{locale\}\/dashboard\/profile`\)/);
  });
});
