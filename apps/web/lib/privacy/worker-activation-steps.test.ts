import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkerActivationSteps } from "@/components/app/worker-activation-steps";
import { deriveWorkerActivationSteps } from "@/lib/privacy/worker-activation-steps";
import type { PartnerSupplyState } from "@/lib/privacy/partner-supply-actions";

const declaration = (
  over: Partial<NonNullable<PartnerSupplyState["declaration"]>> = {},
): NonNullable<PartnerSupplyState["declaration"]> => ({
  intentState: "AVAILABLE_NOW",
  availableFrom: null,
  workAuthorisedCountries: ["NO"],
  allowedMarkets: ["NO"],
  allowedChannels: [],
  contactAuthority: false,
  publicationAuthority: false,
  identityDisclosureAuthority: false,
  reconfirmedAt: null,
  validUntil: null,
  withdrawnAt: null,
  freshness: "CURRENT",
  ...over,
});

const states = (v: Parameters<typeof deriveWorkerActivationSteps>[0]) =>
  Object.fromEntries(deriveWorkerActivationSteps(v).map((s) => [s.key, s.state]));

describe("deriveWorkerActivationSteps - restates the person's own answers, never makes one", () => {
  it("a freshly registered worker has answered NOTHING", () => {
    expect(
      states({
        visibility: "off",
        partnerSupply: { kind: "ok", consentStatus: "not_set", declaration: null },
      }),
    ).toEqual({
      visibility: "open",
      representation: "open",
      declaration: "open",
      profile: "na",
    });
  });

  it("each step turns done only by the person's own act", () => {
    expect(
      states({
        visibility: "on",
        partnerSupply: { kind: "ok", consentStatus: "granted", declaration: null },
      }),
    ).toMatchObject({ visibility: "done", representation: "done", declaration: "open" });
    expect(
      states({
        visibility: "on",
        partnerSupply: { kind: "ok", consentStatus: "granted", declaration: declaration() },
      }),
    ).toMatchObject({ declaration: "done" });
  });

  it("a withdrawn declaration is not done", () => {
    expect(
      states({
        visibility: "off",
        partnerSupply: {
          kind: "ok",
          consentStatus: "withdrawn",
          declaration: declaration({ withdrawnAt: "2026-10-01T00:00:00Z" }),
        },
      }),
    ).toMatchObject({ representation: "open", declaration: "open" });
  });

  it("an unreadable state is UNKNOWN, never open and never done (SEP-7)", () => {
    expect(
      states({
        visibility: "unknown",
        partnerSupply: { kind: "error", consentStatus: "not_set", declaration: null },
      }),
    ).toMatchObject({
      visibility: "unknown",
      representation: "unknown",
      declaration: "unknown",
    });
    expect(states({ visibility: "unknown", partnerSupply: null })).toMatchObject({
      representation: "unknown",
    });
  });
});

describe("WorkerActivationSteps markup", () => {
  const labels = {
    title: "Your next steps",
    intro: "Registering does not switch anything on.",
    steps: {
      visibility: { title: "V" },
      representation: { title: "R" },
      declaration: { title: "D", hint: "Nothing is filled in for you." },
      profile: { title: "P", hint: "Optional" },
    },
    stateDone: "Done",
    stateOpen: "Not done yet",
    stateUnknown: "Could not be read",
    go: "Go",
  };

  it("renders the four doors in order, with states, and no control that writes", () => {
    const html = renderToStaticMarkup(
      createElement(WorkerActivationSteps, {
        labels,
        locale: "lt",
        steps: deriveWorkerActivationSteps({
          visibility: "off",
          partnerSupply: { kind: "ok", consentStatus: "not_set", declaration: null },
        }),
      }),
    );
    const order = ["visibility", "representation", "declaration", "profile"].map((k) =>
      html.indexOf(`data-testid="activation-step-${k}"`),
    );
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('href="#visibility"');
    expect(html).toContain('href="#partner-supply"');
    expect(html).toContain('href="/lt/dashboard/profile"');
    expect(html).toContain("Not done yet");
    expect(html).not.toMatch(/<form|<input|<button|type="checkbox"/);
  });
});
