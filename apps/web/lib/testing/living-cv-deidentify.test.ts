import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  buildPseudonyms,
  catalogueWords,
  isRewritableContentType,
  leakCount,
  letterOf,
  maskFreeText,
  nameTokens,
  rewrite,
  sameBytes,
  stemOf,
  stripPngMetadata,
} from "./living-cv-deidentify";

// Synthetic names only — never a real person.
const PEOPLE = ["Linas Testauskas", "Ramūnas Bandomasis", "Ona Pavyzdytė"];
const COMPANIES = ["UAB Kitas Klientas"];
const KEEP = ["Nonstop Pavyzdys", "Labour market ai Sp. z o.o"];
const ALLOW = catalogueWords({ a: "Darbo istorija ir Projektai", b: "Plytelių klojėjas, statyba", c: "darbo plytelių", d: "Pvz.: Jonas Jonaitis", e: "pvz. jonas@example.com" });

describe("tokens and stems", () => {
  it("splits a name into whole words of three or more characters", () => {
    expect(nameTokens("Ona Pavyzdytė")).toEqual(["Ona", "Pavyzdytė"]);
    expect(nameTokens("J. Testauskas")).toEqual(["Testauskas"]);
  });

  it("takes the Lithuanian ending off when three letters stay", () => {
    expect(stemOf("Linas")).toBe("Lin");
    expect(stemOf("Ramūnas")).toBe("Ramūn");
    expect(stemOf("Pavyzdytė")).toBe("Pavyzd");
    expect(stemOf("Ona")).toBe("Ona");
  });

  it("names people by letter, past Z too", () => {
    expect([0, 1, 25, 26, 27].map(letterOf)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });

  it("a network replacement has exactly the byte length of what it replaces", () => {
    for (const n of [1, 2, 5, 11, 13, 30]) expect(Buffer.byteLength(sameBytes("Darbuotojas", "A", n))).toBe(n);
  });
});

describe("network layer", () => {
  const p = () => buildPseudonyms(PEOPLE, COMPANIES, KEEP);

  it("replaces every declined form and the capitals, keeps the byte length and the chosen organizations", () => {
    const q = p();
    const html = `<h1>Linas Testauskas</h1><p>Linui padėjo Ramūno brigada; RAMŪNAS dirbo Nonstop Pavyzdys.</p>`;
    const out = rewrite(html, q);
    expect(leakCount(out, q, false)).toBe(0);
    expect(out).not.toMatch(/Lin(as|ui)|Ramūn|RAMŪN/);
    expect(out).toContain("Nonstop Pavyzdys");
    expect(Buffer.byteLength(out)).toBe(Buffer.byteLength(html));
  });

  it("never touches markup or code", () => {
    const q = p();
    const html = `<link rel="preload"><style>.a{line-height:1}</style><p class="linear">Linksmas</p>`;
    expect(rewrite(html, q)).toBe(html);
  });

  it("masks e-mail, international phones and personal codes with the same length", () => {
    const q = p();
    const s = `rašykite linas@example.lt, +370 612 34567, a.k. 38001010000`;
    const out = rewrite(s, q);
    expect(out).not.toMatch(/linas@|612 34567|38001010000/);
    expect(Buffer.byteLength(out)).toBe(Buffer.byteLength(s));
  });

  it("keeps a React Flight text row valid", () => {
    const q = p();
    const text = "Darbą atliko Linas Testauskas su Ramūnu.";
    const row = `1a:T${Buffer.byteLength(text).toString(16)},${text}`;
    const out = rewrite(row, q);
    const [, hex, rest] = /^1a:T([0-9a-f]+),([\s\S]*)$/u.exec(out)!;
    expect(Buffer.byteLength(rest!)).toBe(parseInt(hex!, 16));
    expect(leakCount(out, q, false)).toBe(0);
  });
});

describe("rendered-text layer", () => {
  it("masks lower-case and declined roster forms, contact data and personal codes", () => {
    const q = buildPseudonyms(PEOPLE, COMPANIES, KEEP);
    const out = maskFreeText("su linu ir ramūnu, tel. +370 612 34567, kodas 48001010000", q, ALLOW);
    expect(out).not.toMatch(/linu|ramūnu|612|48001010000/i);
    expect(leakCount(out, q, true)).toBe(0);
  });

  it("masks any other capitalised word in free text, keeps catalogue words and the chosen organizations", () => {
    const q = buildPseudonyms(PEOPLE, COMPANIES, KEEP);
    const out = maskFreeText("Darbo istorija: Plytelių klojėjas pas Petraitį, Nonstop objektas Vilniuje", q, ALLOW);
    expect(out).toContain("Darbo");
    expect(out).toContain("Plytelių");
    expect(out).toContain("Nonstop");
    expect(out).not.toContain("Petraitį");
    expect(out).not.toContain("Vilniuje"); // over-masking is accepted
  });

  it("a catalogue's example names are never safe words", () => {
    expect(ALLOW.has("jonas")).toBe(false);
    expect(ALLOW.has("jonaitis")).toBe(false);
    expect(ALLOW.has("darbo")).toBe(true);
    const q = buildPseudonyms(PEOPLE, COMPANIES, KEEP);
    expect(maskFreeText("Jonas dirbo", q, ALLOW)).toBe("[…] dirbo");
  });

  it("masks street addresses with their house numbers (run 45401396990)", () => {
    const q = buildPseudonyms(PEOPLE, COMPANIES, KEEP);
    // Synthetic addresses only.
    const cases = [
      "darbai: van eedenlaan 12, objektas",
      "plytelės keizersgracht35 vonioje",
      "Vredenburgstraat 7a",
      "prie kade 3",
      "gedimino gatvė 9-14",
      "Vilniaus g. 12",
      "Laisvės al. 5",
      "ul. Marszałkowska 102/4",
      "ulica Długa 5",
      "Hauptstraße 3",
      "Oude Dreef 4",
    ];
    for (const c of cases) {
      const out = maskFreeText(c, q, ALLOW);
      expect(out, c).toContain("[…]");
      expect(out, c).not.toMatch(/laan|gracht|straat|kade|gatvė|g\. 12|al\. 5|Marszałkowska|Długa|straße|Dreef|\d/i);
    }
  });

  it("does not mask ordinary work text without an address", () => {
    const q = buildPseudonyms(PEOPLE, COMPANIES, KEEP);
    expect(maskFreeText("plytelių klojimas, 8 h, darbo istorija", q, ALLOW)).toBe("plytelių klojimas, 8 h, darbo istorija");
  });

  it("leaves the network pseudonyms alone", () => {
    const q = buildPseudonyms(PEOPLE, COMPANIES, KEEP);
    const replaced = rewrite("Linas", q);
    expect(maskFreeText(replaced, q, ALLOW)).toBe(replaced);
  });

  it("reads only text bodies", () => {
    expect(isRewritableContentType("text/html; charset=utf-8")).toBe(true);
    expect(isRewritableContentType("text/x-component")).toBe(true);
    expect(isRewritableContentType("image/png")).toBe(false);
    expect(isRewritableContentType(undefined)).toBe(false);
  });
});

describe("PNG metadata", () => {
  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from("Author\0someone", "latin1")),
    chunk("tIME", Buffer.alloc(7)),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  it("drops text, time and every other ancillary chunk", () => {
    const out = stripPngMetadata(png);
    expect(out.includes(Buffer.from("tEXt"))).toBe(false);
    expect(out.includes(Buffer.from("someone"))).toBe(false);
    expect(out.includes(Buffer.from("IDAT"))).toBe(true);
  });

  it("refuses something that is not a PNG", () => {
    expect(() => stripPngMetadata(Buffer.from("nope"))).toThrow();
  });
});
