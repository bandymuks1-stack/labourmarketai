import { describe, expect, it } from "vitest";

import { redactContactData, restoreRedactions } from "./vacancy-redaction";

/**
 * MINIMUM NECESSARY PAYLOAD (owner decision 2026-09-22). Contact data in a
 * third-party advertisement must not reach a translation provider, and the
 * reader must still see it — so it travels as an opaque token and comes back
 * as the PUBLISHER'S OWN characters, never a model's rendering of them.
 */
describe("contact data never leaves, and comes back verbatim", () => {
  const AD =
    "Vi söker 3 svetsare. Lön 35 000 SEK/mån. Kontakt: Anna Svensson, " +
    "anna.svensson@x-bygg.se, +46 70 123 45 67. Ansök på https://x-bygg.se/jobb/1";

  it("redacts e-mail, phone and URL — and nothing else", () => {
    const r = redactContactData(AD);
    expect(r.text).not.toMatch(/anna\.svensson@x-bygg\.se/);
    expect(r.text).not.toMatch(/\+46 70 123 45 67/);
    expect(r.text).not.toMatch(/https:\/\/x-bygg\.se/);
    // The contractual figures stay: headcount and pay are what the digit
    // check protects, and a redactor that ate them would be worse than none.
    expect(r.text).toMatch(/3 svetsare/);
    expect(r.text).toMatch(/35 000 SEK/);
    expect(r.tokens).toHaveLength(3);
  });

  it("a bare figure is never mistaken for a phone number", () => {
    for (const text of ["24 m²", "8 timmar", "3 svetsare", "2026-10-01", "35 000 SEK"]) {
      expect(redactContactData(text).tokens, text).toHaveLength(0);
    }
  });

  it("restores the publisher's own characters into a translated body", () => {
    const r = redactContactData(AD);
    // A plausible rendering: the words change, the tokens survive.
    const rendered = r.text
      .replace("Vi söker", "Ieškome")
      .replace("Kontakt:", "Kontaktai:")
      .replace("Ansök på", "Teikite paraišką");
    const back = restoreRedactions(rendered, r.tokens);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.text).toContain("anna.svensson@x-bygg.se");
      expect(back.text).toContain("+46 70 123 45 67");
      expect(back.text).toContain("https://x-bygg.se/jobb/1");
      expect(back.text).toContain("Ieškome");
    }
  });

  it("REFUSES a rendering that dropped a token (the contact line vanished)", () => {
    const r = redactContactData(AD);
    const rendered = r.text.replace("[[1]]", "");
    expect(restoreRedactions(rendered, r.tokens)).toEqual({ ok: false, reason: "token_missing" });
  });

  it("REFUSES a rendering that invented a token", () => {
    const r = redactContactData(AD);
    expect(restoreRedactions(`${r.text} [[9]]`, r.tokens)).toEqual({
      ok: false,
      reason: "token_unknown",
    });
  });

  it("text with nothing to redact passes through untouched", () => {
    const plain = "Snickare till nybyggnation, start 2026-10-01.";
    const r = redactContactData(plain);
    expect(r.text).toBe(plain);
    expect(restoreRedactions("Dailidė naujai statybai, pradžia 2026-10-01.", r.tokens)).toEqual({
      ok: true,
      text: "Dailidė naujai statybai, pradžia 2026-10-01.",
    });
  });
});
