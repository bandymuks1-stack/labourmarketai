/**
 * Word-number parsing (V9 value-intent foundation) — PURE, deterministic.
 *
 * "trūks keturių suvirintojų" carries the headcount as a WORD, and every
 * digit-only extractor read it as no number at all. This module maps written
 * numbers to integers across the active locales — LT (with the case endings
 * people actually type: keturi/keturios/keturių), EN, RU — plus opportunistic
 * NL/DE. Matching is diacritic-folded like the rest of lib/structuring, so
 * "keturiu" typed without diacritics parses identically.
 *
 * Deliberately NOT a numeral grammar: single tokens only (compounds like
 * "dvidešimt trys" parse as their tens word — coarse and honest). Ambiguous
 * article-words (NL "een", DE "ein") are excluded on purpose: reading every
 * Dutch article as the number 1 would fabricate quantities.
 */
import { foldText } from "./normalize";

/** folded token → value. Keys MUST already be folded (lowercase, no marks). */
const WORD_NUMBERS: Record<string, number> = {
  // ── Lithuanian (nominative m/f + genitive — the counted-noun case) ──
  vienas: 1, viena: 1, vieno: 1, vienos: 1,
  du: 2, dvi: 2, dvieju: 2, dviem: 2,
  trys: 3, triju: 3, trims: 3,
  keturi: 4, keturios: 4, keturiu: 4, keturiems: 4, keturioms: 4,
  penki: 5, penkios: 5, penkiu: 5, penkiems: 5, penkioms: 5,
  sesi: 6, sesios: 6, sesiu: 6, sesiems: 6, sesioms: 6,
  septyni: 7, septynios: 7, septyniu: 7, septyniems: 7, septynioms: 7,
  astuoni: 8, astuonios: 8, astuoniu: 8, astuoniems: 8, astuonioms: 8,
  devyni: 9, devynios: 9, devyniu: 9, devyniems: 9, devynioms: 9,
  desimt: 10, desimties: 10, desimtis: 10,
  vienuolika: 11, vienuolikos: 11,
  dvylika: 12, dvylikos: 12,
  trylika: 13, trylikos: 13,
  keturiolika: 14, keturiolikos: 14,
  penkiolika: 15, penkiolikos: 15,
  sesiolika: 16, sesiolikos: 16,
  septyniolika: 17, septyniolikos: 17,
  astuoniolika: 18, astuoniolikos: 18,
  devyniolika: 19, devyniolikos: 19,
  dvidesimt: 20, dvidesimties: 20,
  trisdesimt: 30, trisdesimties: 30,
  keturiasdesimt: 40, penkiasdesimt: 50, sesiasdesimt: 60,
  septyniasdesimt: 70, astuoniasdesimt: 80, devyniasdesimt: 90,
  simtas: 100, simto: 100,
  // ── English ──
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100,
  // ── Russian (nominative + the counted genitive) ──
  один: 1, одна: 1, одного: 1, одной: 1,
  два: 2, две: 2, двух: 2,
  три: 3, трех: 3,
  четыре: 4, четырех: 4,
  пять: 5, пяти: 5,
  шесть: 6, шести: 6,
  семь: 7, семи: 7,
  восемь: 8, восьми: 8,
  девять: 9, девяти: 9,
  десять: 10, десяти: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
  пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60,
  семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100,
  // ── opportunistic NL/DE (unambiguous words only — no een/ein) ──
  twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7,
  negen: 9, tien: 10, elf: 11, twaalf: 12, twintig: 20,
  zwei: 2, drei: 3, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, zwolf: 12, zwanzig: 20,
};

/** Parse ONE token as a written number; null when it is not one. */
export function parseWordNumber(token: string): number | null {
  const folded = foldText((token ?? "").trim());
  if (!folded || folded.includes(" ")) return null;
  return WORD_NUMBERS[folded] ?? null;
}

export interface FoundWordNumber {
  readonly value: number;
  /** The original token as typed. */
  readonly raw: string;
  /** Token index in the text's word sequence (for adjacency checks). */
  readonly tokenIndex: number;
}

/** Every written number in the text, in order, with token positions. */
export function findWordNumbers(text: string): FoundWordNumber[] {
  const tokens = (text ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: FoundWordNumber[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const value = parseWordNumber(tokens[i]);
    if (value !== null) out.push({ value, raw: tokens[i], tokenIndex: i });
  }
  return out;
}
