import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { vacancyDescriptionText } from "./vacancy-description-text";

describe("vacancyDescriptionText — HTML feeds read as text", () => {
  it("turns a NAV-shaped description into paragraphs and bullets, no tags", () => {
    const raw =
      '<section id="arb-aapningstekst">\n  <p>Er du en dyktig tømrer?</p>\n</section>' +
      "<p><strong>Vi tilbyr:</strong></p><ul><li>Fast stilling</li><li>Gode&nbsp;vilkår &amp; lønn</li></ul>" +
      "<p>Linje en<br/>Linje to</p>";
    const out = vacancyDescriptionText(raw);
    expect(out).toBe(
      "Er du en dyktig tømrer?\n\nVi tilbyr:\n\n• Fast stilling\n• Gode vilkår & lønn\n\nLinje en\nLinje to",
    );
    expect(out).not.toMatch(/<\/?[a-z]/i);
  });

  it("decodes named and numeric entities once", () => {
    expect(vacancyDescriptionText("Sm&aring;land &#8211; 30&#x20AC; &oslash;")).toBe("Småland – 30€ ø");
    // Double-encoded stays one level encoded: never decoded twice.
    expect(vacancyDescriptionText("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });

  it("an escaped tag becomes literal text, and script/style blocks vanish with their content", () => {
    expect(vacancyDescriptionText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe("<script>alert(1)</script>");
    expect(vacancyDescriptionText("<p>Hei</p><script>alert(1)</script><style>p{}</style><!-- x -->")).toBe("Hei");
    expect(vacancyDescriptionText('<p onclick="x()">Hei <a href="javascript:x()">her</a></p>')).toBe("Hei her");
    // Nested / unclosed openers do not survive a single pass.
    const nested = vacancyDescriptionText("<p>A</p><scr<script>x</script>ipt>alert(1)</p><!-<!-- c -->- d<!-- open");
    expect(nested).not.toMatch(/<script|<!--/i);
    expect(nested.startsWith("A")).toBe(true);
  });

  it("leaves plain text as typed: its own breaks, and angle brackets that are not tags", () => {
    const plain = "Arbetsuppgifter:\n- svetsning\n- montage\n\nLön < 30 000 kr, krav <10 år>";
    expect(vacancyDescriptionText(plain)).toBe(plain);
    expect(vacancyDescriptionText("")).toBe("");
  });
});

describe("the job page shows the description through it, as text", () => {
  const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "(marketing)", "jobs", "[id]", "page.tsx"), "utf8");
  it("renders vacancyDescriptionText(member.descriptionRaw), never the raw string", () => {
    expect(page).toMatch(/\{descriptionText\}/);
    expect(page).toMatch(/vacancyDescriptionText\(member\.descriptionRaw\)/);
    expect(page).not.toMatch(/\{member\.descriptionRaw\}/);
  });
  it("never renders a description as HTML", () => {
    const html = page.match(/dangerouslySetInnerHTML=\{\{[\s\S]*?\}\}/g) ?? [];
    for (const block of html) expect(block).not.toMatch(/description(Raw|Text)/);
  });
});
