import { describe, expect, it } from "vitest";

import {
  contextKey,
  holdingsFromHeldRoles,
  initialSelection,
  selectContext,
  type ActorContext,
  type ContextHoldings,
  type ParticipationMode,
} from "./actor-context";

const worker: ActorContext = { mode: "worker", organizationId: null, label: "Mano darbas" };
const acme: ActorContext = { mode: "company", organizationId: "org-a", label: "Acme" };
const beta: ActorContext = { mode: "company", organizationId: "org-b", label: "Beta" };

const known = (contexts: readonly ActorContext[]): ContextHoldings => ({
  status: "known",
  contexts,
});

describe("a context nobody could read is not 'no contexts'", () => {
  // Until the canonical transport opens, this client cannot read a person's
  // contexts at all. Rendering an empty switcher would tell the manager of
  // three companies that they manage none.
  it("unavailable holdings select nothing and stay unavailable", () => {
    const selection = initialSelection(
      { status: "unavailable", because: "transport not open" },
      "company:org-a",
    );
    expect(selection.active).toBeNull();
    expect(selection.holdings.status).toBe("unavailable");
  });

  it("unknown holdings select nothing", () => {
    expect(initialSelection({ status: "unknown" }, null).active).toBeNull();
  });
});

describe("opening the app puts the person where they were", () => {
  it("restores the remembered context", () => {
    const selection = initialSelection(known([worker, acme, beta]), "company:org-b");
    expect(selection.active).toEqual(beta);
  });

  it("a remembered context they no longer hold is ignored, not restored", () => {
    // Being removed from a company must not leave a stale employer view behind.
    // With more than one context left the person is asked; with exactly one,
    // there is nothing to ask about.
    expect(initialSelection(known([worker, acme]), "company:org-b").active).toBeNull();
    expect(initialSelection(known([worker]), "company:org-b").active).toEqual(worker);
  });

  it("one context needs no choice", () => {
    expect(initialSelection(known([worker]), null).active).toEqual(worker);
  });

  it("several contexts and no memory means ASK, never guess", () => {
    // Guessing would open an employer view for someone who unlocked their
    // phone to log their own hours.
    expect(initialSelection(known([worker, acme]), null).active).toBeNull();
  });
});

describe("switching context", () => {
  it("switches to a held context", () => {
    const start = initialSelection(known([worker, acme]), null);
    expect(selectContext(start, acme).active).toEqual(acme);
  });

  it("refuses a context the person does not hold", () => {
    // Not a security control — the database is that. This makes a client bug
    // surface as a refusal instead of as a screen that renders an empty
    // backend answer as fact. The refusal LEAVES THE PERSON WHERE THEY WERE —
    // it never drops them into an unselected state as a side effect.
    const start = initialSelection(known([worker]), null);
    expect(start.active).toEqual(worker);
    expect(selectContext(start, beta).active).toEqual(worker);
  });

  it("a switch is refused outright while holdings are not known", () => {
    const unread: ContextHoldings = { status: "unavailable", because: "transport not open" };
    const start = initialSelection(unread, null);
    expect(selectContext(start, acme)).toEqual(start);
  });

  it("two organizations in the same mode are different contexts", () => {
    expect(contextKey(acme)).not.toBe(contextKey(beta));
    expect(contextKey(worker)).toBe("worker");
  });
});

describe("held roles → contexts", () => {
  const label = (m: ParticipationMode) => `label:${m}`;

  it("drops recorded roles that are not participation modes", () => {
    // `admin` is a real `profile_roles` value and is NOT a mode. Passing it
    // through would offer a context this client has no surface for.
    const holdings = holdingsFromHeldRoles(
      { status: "known", roles: ["worker", "admin", "company"] },
      label,
    );
    expect(holdings.status).toBe("known");
    if (holdings.status !== "known") throw new Error("unreachable");
    expect(holdings.contexts.map((c) => c.mode)).toEqual(["worker", "company"]);
  });

  it("keeps an unavailable read unavailable — never an empty set", () => {
    // The defect this exists to prevent: a failed read rendered as "you hold
    // nothing" to someone who manages three companies.
    const holdings = holdingsFromHeldRoles({ status: "unavailable" }, label);
    expect(holdings.status).toBe("unavailable");
  });

  it("an empty KNOWN set is an answer, not a failure", () => {
    const holdings = holdingsFromHeldRoles({ status: "known", roles: [] }, label);
    expect(holdings).toEqual({ status: "known", contexts: [] });
  });

  it("names no organization — that is the workspace axis", () => {
    const holdings = holdingsFromHeldRoles({ status: "known", roles: ["company"] }, label);
    if (holdings.status !== "known") throw new Error("unreachable");
    expect(holdings.contexts[0]).toEqual({
      mode: "company",
      organizationId: null,
      label: "label:company",
    });
  });

  it("de-duplicates a role recorded twice", () => {
    const holdings = holdingsFromHeldRoles(
      { status: "known", roles: ["worker", "worker"] },
      label,
    );
    if (holdings.status !== "known") throw new Error("unreachable");
    expect(holdings.contexts).toHaveLength(1);
  });
});
