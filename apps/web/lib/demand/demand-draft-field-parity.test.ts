import { describe, expect, it } from "vitest";
import { sanitizeDemandDraftPayload } from "@/lib/demand/demand-drafts";

/**
 * THE DRAFT LEG MUST NOT SILENTLY DROP WHAT THE EMPLOYER TYPED.
 *
 * An employer reported that a real workforce request "did not save":
 *
 *     need: 4 concrete workers · role: Betonuotojai
 *     location: Peleniškiai, Pakruojis · urgency: this week
 *     "Išsaugoti kaip juodraštį" ticked      → "Neišsaugo."
 *
 * The row DID persist — but `teamSize` did not. Two things dropped it: the
 * executor's draft leg never forwarded it, and this allowlist had no key for
 * it. The UI reported "Išsaugota." either way, so the loss was invisible.
 *
 * These cases assert the SURVIVING PAYLOAD, not that a key appears somewhere
 * in the source. A field removed from the allowlist fails here.
 */
describe("company_request draft payload keeps every field the form collects", () => {
  // Exactly the fields `COMPANY_FORMS['company.create-demand']` renders, in
  // the shape the executor forwards them.
  const asTheFormSendsIt = {
    title: "Betonuotojai", // "Pareigos / rolė"
    capabilities: "Reikia 4 betonuotojų.", // "Aprašykite poreikį"
    location: "Peleniškiai, Pakruojis", // "Vieta"
    teamSize: "4", // "Darbuotojų skaičius"
    timing: "this_week", // "Skubumas"
  };

  it("keeps the worker count — the number the whole request is about", () => {
    const out = sanitizeDemandDraftPayload("company_request", asTheFormSendsIt);
    expect(out).toHaveProperty("teamSize", "4");
  });

  it("keeps every other field the employer filled in", () => {
    const out = sanitizeDemandDraftPayload<Record<string, string>>(
      "company_request",
      asTheFormSendsIt,
    );
    expect(out).toEqual(asTheFormSendsIt);
  });

  it("still drops keys that are not part of this draft type", () => {
    const out = sanitizeDemandDraftPayload<Record<string, string>>(
      "company_request",
      { ...asTheFormSendsIt, smuggled: "nope", candidateRoles: "wrong type" },
    );
    expect(out).not.toHaveProperty("smuggled");
    expect(out).not.toHaveProperty("candidateRoles");
  });

  it("drops a non-string value rather than storing something unreadable", () => {
    // The executor stringifies the count for exactly this reason — if it ever
    // stops doing so, the value must be lost LOUDLY here, not written as junk.
    const out = sanitizeDemandDraftPayload<Record<string, string>>(
      "company_request",
      { ...asTheFormSendsIt, teamSize: 4 as unknown as string },
    );
    expect(out).not.toHaveProperty("teamSize");
  });

  it("drops empty strings so a blank field does not overwrite a real value", () => {
    const out = sanitizeDemandDraftPayload<Record<string, string>>(
      "company_request",
      { ...asTheFormSendsIt, location: "   " },
    );
    expect(out).not.toHaveProperty("location");
  });
});
