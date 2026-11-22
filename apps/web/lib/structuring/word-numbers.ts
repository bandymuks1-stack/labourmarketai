/**
 * Word-number parsing (V9 value-intent foundation) — PURE, deterministic.
 *
 * "trūks keturių suvirintojų" carries the headcount as a WORD, and every
 * digit-only extractor read it as no number at all. This module maps written
 * numbers to integers across the active locales — LT (with the case endings
 * people actually type: keturi/keturios/keturių/keturis), EN, RU (with the
 * collective "пятеро"), PL (with the counted "pięciu") — plus opportunistic
 * NL/DE and, in a Swedish sentence only, SV. Matching is diacritic-folded like the rest of lib/structuring, so
 * "keturiu" typed without diacritics parses identically.
 *
 * Deliberately NOT a numeral grammar: one token is one word. A RUN of number
 * words is one quantity only when it is tens + unit ("twenty five",
 * "dvidešimt trys", "двадцать пять" → 25, `wordNumberRunValue`); any other
 * run ("one hundred", "two three") is unknown — never one of its parts. Ambiguous
 * article-words (NL "een", DE "ein") are excluded on purpose: reading every
 * Dutch article as the number 1 would fabricate quantities.
 */
import { foldText } from "./normalize";
import { looksSwedish } from "./looks-swedish";

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
  // Collective numerals, dative — the count of a plural-only noun: "dvejiems
  // metams" (for two years). The cardinal "du" cannot count "metai".
  vieneriems: 1, vienerioms: 1, dvejiems: 2, dvejoms: 2, trejiems: 3, trejoms: 3,
  ketveriems: 4, ketverioms: 4, penkeriems: 5, penkerioms: 5,
  seseriems: 6, seserioms: 6, septyneriems: 7, septynerioms: 7,
  astuoneriems: 8, astuonerioms: 8, devyneriems: 9, devynerioms: 9,
  // Accusative — the counted object of "reikia / ieškau": "reikia penkis
  // darbuotojus" (2026-11-22: read as no number at all).
  tris: 3, keturis: 4, keturias: 4, penkis: 5, penkias: 5, sesis: 6, sesias: 6,
  septynis: 7, septynias: 7, astuonis: 8, astuonias: 8, devynis: 9, devynias: 9,
  // ── English ──
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100,
  // ── Russian (nominative + the counted genitive) ──
  один: 1, одна: 1, одного: 1, одной: 1, однои: 1, // `foldText` strips the breve of й
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
  // The counted genitive of 11–12 and the COLLECTIVE numerals people use for
  // people: "нужно пятеро рабочих", "нужны двое" (2026-11-22: no number).
  одиннадцати: 11, двенадцати: 12,
  двое: 2, двоих: 2, трое: 3, троих: 3, четверо: 4, четверых: 4,
  пятеро: 5, пятерых: 5, шестеро: 6, шестерых: 6, семеро: 7, семерых: 7,
  восьмеро: 8, восьмерых: 8, девятеро: 9, девятерых: 9, десятеро: 10, десятерых: 10,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60,
  семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100,
  // ── opportunistic NL/DE (unambiguous words only — no een/ein) ──
  twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7,
  negen: 9, tien: 10, elf: 11, twaalf: 12, twintig: 20,
  zwei: 2, drei: 3, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, zwolf: 12, zwanzig: 20,
  // ── Polish (folded: "pięć" → piec, "ośmiu" → osmiu) — the nominative and the
  // counted genitive ("potrzebuję pięciu pracowników", 2026-11-22: no number).
  // No `jeden` / `jedna`: the German "jeden" is "every" ("jeden Tag").
  jednego: 1,
  dwa: 2, dwie: 2, dwoch: 2, dwoje: 2, dwojga: 2,
  trzy: 3, trzech: 3, troje: 3,
  cztery: 4, czterech: 4, czworo: 4,
  piec: 5, pieciu: 5, piecioro: 5,
  szesc: 6, szesciu: 6,
  siedem: 7, siedmiu: 7,
  osiem: 8, osmiu: 8,
  dziewiec: 9, dziewieciu: 9,
  dziesiec: 10, dziesieciu: 10,
  jedenascie: 11, jedenastu: 11,
  dwanascie: 12, dwunastu: 12,
  dwadziescia: 20, dwudziestu: 20,
};

/**
 * Swedish (folded: "två" → tva, "åtta" → atta) — read only when the SENTENCE
 * the token came from is Swedish (`looksSwedish`): "tre" is Italian and
 * Norwegian, "elva" a town and a company name, "fem" and "tio" other
 * languages' words.
 */
const SV_WORD_NUMBERS: Record<string, number> = {
  // No `en` / `ett` (the article, and `en` is the Dutch "and"), no `sex` (an
  // English word) and no `tre` / `sju` / `tio` clash to guard — those three
  // are unambiguous and stay.
  tva: 2, tre: 3, fyra: 4, fem: 5, sju: 7, atta: 8, nio: 9, tio: 10,
  elva: 11, tolv: 12, tretton: 13, fjorton: 14, femton: 15, sexton: 16,
  sjutton: 17, arton: 18, nitton: 19, tjugo: 20, trettio: 30, fyrtio: 40,
  femtio: 50, hundra: 100,
};

/**
 * The written numbers as one regex ALTERNATION (folded, longest first), for a
 * pattern that must accept "8" and "eight" alike — the chat router's "a day +
 * a duration" rule (2026-11-22: "Užvakar aštuonias valandas suvirinau…"
 * routed `unknown` while "Užvakar 8 val. …" was the journal). The SAME table
 * as `parseWordNumber`, so the two can never disagree. Letters only — no
 * escaping needed. The Swedish words are a separate source, for a Swedish
 * sentence only.
 */
const alternation = (table: Record<string, number>): string =>
  Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .join("|");
export const WORD_NUMBER_SOURCE: string = alternation(WORD_NUMBERS);
export const SV_WORD_NUMBER_SOURCE: string = alternation(SV_WORD_NUMBERS);

/** Parse ONE token as a written number; null when it is not one. */
export function parseWordNumber(token: string, swedish = false): number | null {
  const folded = foldText((token ?? "").trim());
  if (!folded || folded.includes(" ")) return null;
  return WORD_NUMBERS[folded] ?? (swedish ? (SV_WORD_NUMBERS[folded] ?? null) : null);
}

export interface FoundWordNumber {
  readonly value: number;
  /** The original token as typed. */
  readonly raw: string;
  /** Token index in the text's word sequence (for adjacency checks). */
  readonly tokenIndex: number;
}

/**
 * The value of a RUN of adjacent number words, read as ONE quantity: a single
 * word is itself, tens + unit is their sum ([20, 5] → 25). Any other run is
 * null — unknown, never one of its parts: "twenty five workers" must not read
 * as five, nor "one hundred workers" as one or as a hundred.
 */
export function wordNumberRunValue(values: readonly number[]): number | null {
  if (values.length === 1) return values[0];
  if (values.length !== 2) return null;
  const [tens, unit] = values;
  return tens >= 20 && tens <= 90 && tens % 10 === 0 && unit >= 1 && unit <= 9 ? tens + unit : null;
}

/**
 * The text with every written number as digits ("мне нужны пять рабочих" →
 * "мне нужны 5 рабочих"), every other character untouched — so a digit reader
 * reads the same count said in words. A run of number words joined by spaces
 * or a hyphen becomes its `wordNumberRunValue`; a run that has none stays as
 * typed, which no digit reader counts.
 */
export function digitizeWordNumbers(
  text: string,
  /** Is the SENTENCE Swedish? Pass it when `text` is no longer as typed. */
  swedish: boolean = looksSwedish(text),
): string {
  return (text ?? "").replace(/\p{L}+(?:[ \t-]+\p{L}+)*/gu, (phrase) => {
    // [word, separator, word, separator, …, word]
    const parts = phrase.split(/([ \t-]+)/u);
    let out = "";
    let i = 0;
    while (i < parts.length) {
      const values: number[] = [];
      let j = i;
      for (;;) {
        const v = j < parts.length ? parseWordNumber(parts[j], swedish) : null;
        if (v === null) break;
        values.push(v);
        j += 2;
      }
      if (values.length === 0) {
        out += parts[i] + (parts[i + 1] ?? "");
        i += 2;
        continue;
      }
      const value = wordNumberRunValue(values);
      out += (value === null ? parts.slice(i, j - 1).join("") : String(value)) + (parts[j - 1] ?? "");
      i = j;
    }
    return out;
  });
}

/** Every written number in the text, in order, with token positions. */
export function findWordNumbers(
  text: string,
  /** Is the SENTENCE Swedish? Pass it when `text` is one token of a sentence. */
  swedish: boolean = looksSwedish(text),
): FoundWordNumber[] {
  const tokens = (text ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: FoundWordNumber[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const value = parseWordNumber(tokens[i], swedish);
    if (value !== null) out.push({ value, raw: tokens[i], tokenIndex: i });
  }
  return out;
}
