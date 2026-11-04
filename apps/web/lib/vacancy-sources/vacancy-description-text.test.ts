import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getPublicVacancyById } from "@/lib/vacancy-store/vacancy-read";

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

  it("an escaped tag stays readable text that cannot open a tag; blocks vanish with their content", () => {
    expect(vacancyDescriptionText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe("< script>alert(1)< /script>");
    expect(vacancyDescriptionText("<p>Hei</p><script>alert(1)</script><style>p{}</style><!-- x -->")).toBe("Hei");
    expect(vacancyDescriptionText('<p onclick="x()">Hei <a href="javascript:x()">her</a></p>')).toBe("Hei her");
  });

  it("the output never holds a tag start, whatever the payload (nested, split, unclosed, encoded)", () => {
    const payloads = [
      "<scr<script>ipt>alert(1)</scr</script>ipt>",
      "<scr<script></script>ipt>alert(1)</script>",
      "<p>A</p><scr<script>x</script>ipt>alert(1)</p><!-<!-- c -->- d<!-- open",
      "<<script>script>alert(1)<</script>/script>",
      "<script>never closed",
      "<script",
      "<p>x</p><!-",
      "<p>x</p><img src=x onerror=alert(1)>",
      "<p>x</p><svg/onload=alert(1)>",
      "<p>x</p><iframe src=javascript:alert(1)></iframe>",
      "<p>x</p>&lt;img src=x onerror=alert(1)&gt;",
      "<p>x</p>&#60;script&#62;alert(1)&#60;/script&#62;",
      "<p>x</p>&#x3c;script&#x3e;",
      "<p>x</p><\nscript>",
      "plain <unknown-tag attr=1> text",
    ];
    for (const payload of payloads) {
      expect(vacancyDescriptionText(payload), payload).not.toMatch(/<[a-z!/?]/i);
    }
    expect(vacancyDescriptionText("<p>A</p><script>never closed").trim()).toBe("A");
  });

  it("reads malformed HTML: unclosed, uppercase, stray, attributes, nothing readable lost", () => {
    expect(vacancyDescriptionText("<p>Første<li>Andre<li>Tredje")).toBe("Første\n• Andre\n• Tredje");
    expect(vacancyDescriptionText("<P ALIGN=center>Hei</P><BR/>der")).toBe("Hei\n\nder");
    expect(vacancyDescriptionText("</div></p>Tekst<p></p><p>  </p>")).toBe("Tekst");
    expect(vacancyDescriptionText('<a href="x>y">Søk</a>')).not.toMatch(/<[a-z/]/i);
    for (const broken of ["<p>Tekst<br", "<p>Tekst</p", "<p>Tekst<", "<<p>>Tekst", "<p <b>Tekst"]) {
      const out = vacancyDescriptionText(broken);
      expect(out, broken).toContain("Tekst");
      expect(out, broken).not.toMatch(/<[a-z!/?]/i);
    }
  });

  it("what the feeds really carry (counted in production 2026-11-04)", () => {
    // Swedish ads embed these; they are not words for a reader.
    expect(vacancyDescriptionText('Vi söker<iframe src="https://example.invalid/v"></iframe> svetsare')).toBe("Vi söker svetsare");
    expect(vacancyDescriptionText('<p>Hej</p><img src="x.png" alt="logo">')).toBe("Hej");
    // An address in angle brackets stays readable and cannot open a tag.
    expect(vacancyDescriptionText("Mejla <filip@example.invalid> eller <http://example.invalid>")).toBe(
      "Mejla < filip@example.invalid> eller < http://example.invalid>",
    );
    // Norwegian ads write punctuation, addresses and emoji as numeric entities.
    expect(vacancyDescriptionText("<p>post&#64;example.invalid &#x1F4CD; Oslo</p>")).toBe("post@example.invalid 📍 Oslo");
    expect(vacancyDescriptionText("<p>Rolle &#150; lønn &#39;god&#39; &#34;sikker&#34;</p>")).toBe("Rolle – lønn 'god' \"sikker\"");
    // An ad cut off mid-tag by the import limit ends with its words.
    expect(vacancyDescriptionText('<p>Kontakt oss</p><p>Ring <a href="tel:')).toBe("Kontakt oss\n\nRing");
    expect(vacancyDescriptionText("<ul><li>Rør</li><l")).toBe("• Rør");
    // Invisible characters do not reach the reader.
    expect(vacancyDescriptionText("<p>&#xFEFF;Start&#xFFF8; slutt</p>")).toBe("Start slutt");
    expect(vacancyDescriptionText("\u200b\nÄr du vår nästa expert?")).toBe("Är du vår nästa expert?");
    // A table reads cell by cell (Norwegian contact tables).
    expect(vacancyDescriptionText("<table><tr><td>Sted</td><td>Telefon</td></tr><tr><td>Oslo</td><td>Spør</td></tr></table>")).toBe(
      "Sted Telefon\n\nOslo Spør",
    );
    // A stray Word tag in a plain Swedish ad keeps its paragraphs.
    expect(vacancyDescriptionText("Är du säljaren?<o:p></o:p>\n\nPå Volt arbetar vi.\n· Kollektivavtal")).toBe(
      "Är du säljaren?\n\nPå Volt arbetar vi.\n· Kollektivavtal",
    );
  });

  it("leaves plain text as typed: its own breaks, and angle brackets that are not tags", () => {
    const plain = "Arbetsuppgifter:\n- svetsning\n- montage\n\nLön < 30 000 kr, krav <10 år>";
    expect(vacancyDescriptionText(plain)).toBe(plain);
    expect(vacancyDescriptionText("")).toBe("");
  });
});

describe("the member's read gives the page readable text; the store is untouched", () => {
  const stored = {
    id: "00000000-0000-4000-8000-0000000000aa",
    content_hash: "stored-hash",
    title_raw: "Tømrer",
    description_raw: "<p>Er du en <strong>dyktig</strong> tømrer?</p><script>alert(1)</script>",
  };
  const clientReturning = (row: Record<string, unknown>) => {
    const writes: string[] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      maybeSingle: async () => ({ data: row, error: null }),
      update: () => writes.push("update"),
      upsert: () => writes.push("upsert"),
      insert: () => writes.push("insert"),
    };
    return { client: { from: () => chain } as never, writes };
  };

  it("getPublicVacancyById returns the text, keeps the stored hash, writes nothing", async () => {
    const { client, writes } = clientReturning(stored);
    const found = await getPublicVacancyById(client, stored.id);
    if (found.status !== "ok") throw new Error(found.status);
    expect(found.vacancy.descriptionRaw).toBe("Er du en dyktig tømrer?");
    expect(found.vacancy.contentHash).toBe("stored-hash");
    expect(writes).toEqual([]);
    expect(stored.description_raw).toContain("<p>");
  });

  it("the page renders that value as a text child, never as HTML", () => {
    const page = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "(marketing)", "jobs", "[id]", "page.tsx"), "utf8");
    expect(page).toContain("{member.descriptionRaw}");
    const html = page.match(/dangerouslySetInnerHTML=\{\{[\s\S]*?\}\}/g) ?? [];
    for (const block of html) expect(block).not.toMatch(/descriptionRaw/);
  });

  it("matching does not read the description, so this changes no reading of a job", () => {
    const need = readFileSync(join(__dirname, "vacancy-need.ts"), "utf8");
    expect(need).not.toContain("descriptionRaw");
  });
});
