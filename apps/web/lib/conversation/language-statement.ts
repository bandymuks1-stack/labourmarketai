import type { WorkerLanguageCode, WorkerLanguageLevel } from "@/lib/worker/worker-languages-model";
import { looksSwedish } from "@/lib/structuring/looks-swedish";

/**
 * LANGUAGES SAID IN WORDS (owner continuation 2026-09-29, PERSON chat walk).
 * "Kalbu angliškai ir rusiškai." scored 0 and the fallback showed the profile
 * completeness card — the languages were dropped. Their one home is
 * `worker_languages` (written by `worker.add-language`, the profile's form).
 * This reads which languages were named, and a level ONLY when the person said
 * one ("B2", "gimtoji") — never guessed from "gerai" or "laisvai". Nothing
 * here writes. Pure.
 */
export interface StatedLanguage {
  readonly lang: WorkerLanguageCode;
  readonly level: WorkerLanguageLevel | null;
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Stems, folded, in the served locales. Order matters only for display. */
const STEMS: ReadonlyArray<readonly [WorkerLanguageCode, RegExp]> = [
  ["en", /(anglisk|anglu\b|english|англ|englisch|angielsk)/u],
  ["ru", /(rusisk|rusu\b|russian|русск|по-русски|russisch|rosyjsk)/u],
  ["lt", /(lietuvisk|lietuviu\b|lithuanian|литовск|litauisch|litewsk)/u],
  ["lv", /(latvisk|latviu\b|latvian|латышск|lettisch|lotewsk|łotewsk)/u],
  ["et", /(estisk|estu\b|estonian|эстонск|estnisch|estonsk)/u],
  ["nl", /(olandisk|olandu\b|dutch|голландск|нидерландск|niederlandisch|niderlandzk)/u],
  ["de", /(vokisk|vokieciu\b|german|немецк|deutsch|niemieck)/u],
  ["da", /(danisk|danu\b|danish|датск|danisch|dunsk|duńsk)/u],
  ["no", /(norvegisk|norvegu\b|norwegian|норвежск|norwegisch|norwesk)/u],
  ["sv", /(svedisk|svedu\b|swedish|шведск|schwedisch|szwedzk)/u],
  ["pl", /(lenkisk|lenku\b|polish|польск|polnisch|polsk)/u],
];

/**
 * The SWEDISH names of the same languages (folded) — sv, 2026-11-12: "Jag
 * talar svenska och engelska" routed to `language-statement` and this reader
 * returned [], so the chat asked which languages the person had just named.
 *
 * Read only for a sentence `looksSwedish` reads as Swedish; the short ones are
 * word-bounded besides (`rysk` is the Lithuanian "ryškus" folded).
 *
 * The codes are the CLOSED set `worker_languages.lang` accepts (a database
 * CHECK): there is no Finnish, French, Spanish or Arabic to record, so the
 * router's Swedish rule names only the languages listed here — a sentence
 * about any other language is not sent to a reader that cannot hold it
 * (review finding 12: "Jag talar finska" was routed here and read as nothing).
 */
const SV_STEMS: ReadonlyArray<readonly [WorkerLanguageCode, RegExp]> = [
  ["en", /engelsk/u],
  ["ru", /\bryska\b/u],
  ["lt", /litauisk/u],
  ["lv", /lettisk/u],
  ["et", /estnisk/u],
  ["nl", /(nederlandsk|hollandsk)/u],
  ["de", /\btyska?\b/u],
  ["da", /\bdansk/u],
  ["no", /\bnorska?\b/u],
  ["sv", /svensk/u],
  ["pl", /\bpolska\b/u],
  ["uk", /\bukrainska\b/u],
];

const CEFR = /\b(a1|a2|b1|b2|c1|c2)\b/u;
const NATIVE = /(gimtoji|gimtąja|gimtaja|native|mother\s+tongue|родн|muttersprach|moedertaal|ojczyst)/u;
const SV_NATIVE = /modersmal/u;

export function readStatedLanguages(text: string): StatedLanguage[] {
  const q = fold(text ?? "");
  const hits: { lang: WorkerLanguageCode; at: number; end: number }[] = [];
  for (const [lang, re] of STEMS) {
    const m = re.exec(q);
    if (m) hits.push({ lang, at: m.index, end: m.index + m[0].length });
  }
  // Swedish names count in a Swedish sentence only.
  const swedish = looksSwedish(text);
  if (swedish) {
    for (const [lang, re] of SV_STEMS) {
      if (hits.some((h) => h.lang === lang)) continue;
      const m = re.exec(q);
      if (m) hits.push({ lang, at: m.index, end: m.index + m[0].length });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  return hits.map((h, i) => {
    // A level belongs to the language it follows, up to the next language.
    const tail = q.slice(h.end, i + 1 < hits.length ? hits[i + 1]!.at : undefined).slice(0, 40);
    const cefr = CEFR.exec(tail)?.[1];
    const level: WorkerLanguageLevel | null = cefr
      ? (cefr.toUpperCase() as WorkerLanguageLevel)
      : NATIVE.test(tail) || (swedish && SV_NATIVE.test(tail))
        ? "native"
        : null;
    return { lang: h.lang, level };
  });
}
