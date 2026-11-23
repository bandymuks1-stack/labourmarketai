import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  buildPseudonyms,
  isRewritableContentType,
  leakCount,
  letterOf,
  nameTokens,
  rewrite,
  sameBytes,
  stripPngMetadata,
} from "./living-cv-deidentify";

// Synthetic names only — never a real person.
const PEOPLE = ["Žydrūnas Testavičius", "Ona Pavyzdytė-Bandomoji", "Jonas Testavičius"];
const COMPANIES = ["UAB Pavyzdys Statyba", "Kitas Klientas"];
const KEEP = ["Nonstop Pavyzdys", "Labour market ai Sp. z o.o"];

describe("tokens", () => {
  it("splits a name into whole words of three or more characters", () => {
    expect(nameTokens("Ona Pavyzdytė-Bandomoji")).toEqual(["Ona", "Pavyzdytė-Bandomoji"]);
    expect(nameTokens("J. Testavičius")).toEqual(["Testavičius"]);
    expect(nameTokens("  ")).toEqual([]);
  });

  it("names people by letter, past Z too", () => {
    expect([0, 1, 25, 26, 27].map(letterOf)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });

  it("a replacement has exactly the byte length of the original", () => {
    for (const n of [1, 2, 5, 11, 13, 30]) expect(Buffer.byteLength(sameBytes("Darbuotojas", "A", n))).toBe(n);
    const p = buildPseudonyms(PEOPLE, COMPANIES, KEEP);
    for (const [orig, repl] of p.map) {
      expect(Buffer.byteLength(repl, "utf8")).toBe(Buffer.byteLength(orig, "utf8"));
      expect(repl).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe("rewrite", () => {
  const p = buildPseudonyms(PEOPLE, COMPANIES, KEEP);

  it("replaces every person and client token and keeps the chosen organizations", () => {
    const html = `<h1>Žydrūnas Testavičius</h1><p>Ona at UAB Pavyzdys Statyba for Nonstop Pavyzdys</p>`;
    const out = rewrite(html, p);
    expect(leakCount(out, p.tokens)).toBe(0);
    expect(out).toContain("Nonstop Pavyzdys");
    expect(out).toMatch(/Darbuotoj.*A/);
    expect(Buffer.byteLength(out)).toBe(Buffer.byteLength(html));
  });

  it("matches whole words only", () => {
    const q = buildPseudonyms(["Ona Test"], [], []);
    expect(rewrite("Sonata Onai Ona", q)).toBe(`Sonata Onai ${q.map.get("Ona")}`);
  });

  it("keeps a React Flight text row valid: its byte length is unchanged", () => {
    const text = "Darbą atliko Žydrūnas Testavičius.";
    const row = `1a:T${Buffer.byteLength(text).toString(16)},${text}`;
    const out = rewrite(row, p);
    const [, hex, rest] = /^1a:T([0-9a-f]+),([\s\S]*)$/u.exec(out)!;
    expect(Buffer.byteLength(rest!)).toBe(parseInt(hex!, 16));
    expect(leakCount(out, p.tokens)).toBe(0);
  });

  it("counts a leak without returning the text", () => {
    expect(leakCount("x Testavičius y", p.tokens)).toBe(1);
    expect(leakCount("nothing here", p.tokens)).toBe(0);
  });

  it("reads only text bodies", () => {
    expect(isRewritableContentType("text/html; charset=utf-8")).toBe(true);
    expect(isRewritableContentType("text/x-component")).toBe(true);
    expect(isRewritableContentType("application/json")).toBe(true);
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
    expect(out.includes(Buffer.from("tIME"))).toBe(false);
    expect(out.includes(Buffer.from("someone"))).toBe(false);
    expect(out.includes(Buffer.from("IDAT"))).toBe(true);
    expect(out.subarray(0, 8).equals(sig)).toBe(true);
  });

  it("refuses something that is not a PNG", () => {
    expect(() => stripPngMetadata(Buffer.from("nope"))).toThrow();
  });
});
