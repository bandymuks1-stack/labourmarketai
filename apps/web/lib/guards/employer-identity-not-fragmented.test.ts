import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { activeLocales } from "@/lib/i18n/config";
import { baseIdentityForRole } from "@/lib/config/roles";

/**
 * §2 — THE PERSON IS ONE, AND HIRING IS NOT A COSTUME.
 *
 * `identity` in the chat is the ACTIVE workspace, not who the person is.
 * Production, 2026-08-26: five profiles hold the `company` role while their
 * active role is `worker` — exactly as many as are currently sitting in
 * `company`. So half the employer-capable people on the platform were typing
 * "reikia darbuotojų" into a chat that answered with the not-understood
 * fallback, on the very intake path that has produced no new demand in six
 * weeks.
 *
 * The gate that matters is HELD roles: `requireRoleOrRedirect` checks
 * `profile_roles`, not `profiles.active_role`, so somebody holding `company`
 * can open the hub without switching anything. These pins keep the chat's
 * predicate aligned with the gate it is predicting, and keep the honest
 * fallback for people who genuinely cannot act as an employer.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const CHAT = read(
  "components", "app", "conversation", "chat", "conversation-chat.tsx",
);

describe("employer capability is read from HELD roles, not the active one", () => {
  it("the chat derives it from the held-role catalogue", () => {
    expect(CHAT).toMatch(/const canActAsEmployer = Boolean\(\s*auth0\?\.roles\?\.includes\("company"\)/);
  });

  it("the predicate matches the gate it is predicting", () => {
    // requireRoleOrRedirect admits on profile_roles (is_active), which is the
    // same set AuthState.roles carries. If that gate ever moved to
    // active_role, this chip would start promising a redirect.
    const gate = read("lib", "auth", "require-role.ts");
    expect(gate).toMatch(/from\("profile_roles"\)/);
    expect(gate).toMatch(/heldRoles\.has\(expectedRole\)/);
    // Comments stripped: the file's own doc-block SAYS "active_role" while
    // explaining that it deliberately does not read it, so asserting on raw
    // text would pass for the wrong reason.
    const code = gate
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/active_role/);
  });

  it("`company` really is an employer identity", () => {
    expect(baseIdentityForRole("company")).toBe("company");
    expect(baseIdentityForRole("worker")).toBe("person");
  });
});

describe("a sentence about hiring never dead-ends for an employer", () => {
  it("need-workers bridges instead of falling back", () => {
    // G2: routing is registry-dispatched — the branch is the component's
    // `needWorkers` handler (order pinned by the handlers object).
    const branch = CHAT.slice(
      CHAT.indexOf("needWorkers: () =>"),
      CHAT.indexOf("needService: () =>"),
    );
    expect(branch.length).toBeGreaterThan(0);
    // The active-workspace employer still gets the real intake form.
    expect(branch).toMatch(/openForm\(\s*"company\.create-demand"/);
    // The employer standing in their personal space gets the door, not a shrug.
    expect(branch).toMatch(/else if \(canActAsEmployer\)/);
    expect(branch).toMatch(/employerBridgeHint/);
    expect(branch).toMatch(/link:\/dashboard\/company#demand-intake/);
    // And somebody who genuinely holds no company role must NOT see the
    // employer chip — the demand-intake door is for employers only. Since
    // 2026-09-06 (real-user fitness walk) that person is no longer shrugged
    // at either: the sentence named a trade, so the PERSON's doors are
    // offered — the service-request loop and the company-setup door — both
    // of which already existed. The employer door stays out of that branch.
    const personBranch = branch.slice(branch.lastIndexOf("} else {"));
    expect(personBranch).not.toMatch(/demand-intake/);
    expect(personBranch).toMatch(/link:\/dashboard\/service-requests/);
    expect(personBranch).toMatch(/link:\/dashboard\/start\/company/);
    expect(personBranch).not.toMatch(/assistant\(fallbackText/);
  });

  it("company-overview answers an owner in any workspace", () => {
    const branch = CHAT.slice(
      CHAT.indexOf("companyOverview: () =>"),
      CHAT.indexOf("createOrganization: () =>"),
    );
    expect(branch.length).toBeGreaterThan(0);
    expect(branch).toMatch(/identity === "company" \|\| canActAsEmployer/);
    // 2026-09-04: the not-understood answer is the context-aware
    // `fallbackText` (worker / employer / agency / education), never the
    // worker copy read directly.
    expect(branch).toMatch(/fallbackText/);
  });

  it("nothing is switched on the person's behalf", () => {
    // The chip IS the confirmation (§36). A silent switchRole here would be
    // the product changing someone's workspace because of a sentence.
    const branch = CHAT.slice(
      CHAT.indexOf("needWorkers: () =>"),
      CHAT.indexOf("needService: () =>"),
    );
    expect(branch).not.toMatch(/switchRole|switchWorkspace|switchOrganization/);
  });
});

describe("the bridge line ships in every routable locale", () => {
  it("formats for each active locale", () => {
    for (const loc of activeLocales) {
      const messages = JSON.parse(read("messages", `${loc}.json`));
      const t = createTranslator({ locale: loc, messages });
      const out = t("conversation.chat.employerBridgeHint");
      expect(typeof out, `${loc}`).toBe("string");
      expect(out.trim().length, `${loc} empty`).toBeGreaterThan(0);
      // A missing key renders as the echoed path — the exact failure this
      // catalogue convention exists to prevent.
      expect(out, `${loc} did not resolve`).not.toContain(
        "conversation.chat.employerBridgeHint",
      );
    }
  });

  it("is present in every catalogue file, routable or not", () => {
    // §2.4 file-presence: the non-active files stay complete for the key even
    // though routing does not surface them today.
    const locales = readdirSync(join(WEB, "messages"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
    for (const loc of locales) {
      const msgs = JSON.parse(read("messages", `${loc}.json`));
      expect(
        msgs?.conversation?.chat?.employerBridgeHint,
        `${loc}: employerBridgeHint missing`,
      ).toBeTruthy();
    }
  });
});

describe("a workforce statement is not called ambiguous", () => {
  /**
   * Fourth instance. `structureValueStatement` had already decided the
   * sentence was about workforce — `v.subject === "workforce"` is its own
   * verdict — and the chat then told a person holding the company role "I am
   * not sure whether you are offering something or looking for something".
   * The product understood them and then said it did not.
   */
  it("an employer in their personal space gets the door, not a shrug", () => {
    const i = CHAT.indexOf('v.subject === "workforce" || v.axis === "seek"');
    expect(i).toBeGreaterThan(0);
    // The SECOND occurrence is the bridge — the first is the employer
    // workspace arm that opens the real form and must stay untouched.
    const j = CHAT.indexOf(
      'v.subject === "workforce" || v.axis === "seek"',
      i + 1,
    );
    expect(j, "the bridge branch is missing").toBeGreaterThan(i);

    // The CONDITION itself, not a window around it. A wide slice reached the
    // callback dependency array — which also names `canActAsEmployer` — so an
    // earlier version of this test passed with the branch hard-disabled to
    // `false`. Read to the `) {` that closes this condition and no further.
    const condition = CHAT.slice(j, CHAT.indexOf(") {", j));
    expect(condition, "the bridge is not gated on held roles").toMatch(
      /canActAsEmployer/,
    );

    // The body, bounded by the `return;` that ends it.
    const bodyStart = CHAT.indexOf(") {", j);
    const body = CHAT.slice(bodyStart, CHAT.indexOf("return;", bodyStart));
    expect(body).toMatch(/employerBridgeHint/);
    expect(body).toMatch(/link:\/dashboard\/company#demand-intake/);
  });

  it("the employer workspace still opens the real intake form", () => {
    const i = CHAT.indexOf('v.subject === "workforce" || v.axis === "seek"');
    const first = CHAT.slice(i, i + 400);
    expect(first).toMatch(/identity === "company"/);
    expect(first).toMatch(/openForm\(\s*"company\.create-demand"/);
  });

  it("somebody with no company role still gets the honest question", () => {
    // The ambiguity path must survive: for a person who cannot act as an
    // employer the reading really is unclear, and inventing a demand form for
    // them would be the wrong-audience form this all exists to avoid.
    expect(CHAT).toMatch(/valueIntent\.unclear/);
  });
});
