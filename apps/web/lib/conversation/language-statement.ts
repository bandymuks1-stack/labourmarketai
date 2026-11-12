import type { WorkerLanguageCode, WorkerLanguageLevel } from "@/lib/worker/worker-languages-model";

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

/**
 * Stems, folded, in the served locales. Order matters only for display.
 *
 * sv (2026-11-12): "Jag talar svenska och engelska" routed to
 * `language-statement` and this reader returned [] — the router knew the
 * Swedish names and the reader did not, so the chat asked which languages the
 * person had just named. The Swedish names sit beside the others; the short
 * ones are word-bounded because a bare stem would open on another language's
 * everyday word (`rysk` is Lithuanian "ryškus" folded, `tysk` / `norsk` are
 * kept whole so nothing longer can carry them).
 */
const STEMS: ReadonlyArray<readonly [WorkerLanguageCode, RegExp]> = [
  ["en", /(anglisk|anglu\b|english|англ|englisch|angielsk|engelsk)/u],
  ["ru", /(rusisk|rusu\b|russian|русск|по-русски|russisch|rosyjsk|\bryska\b)/u],
  ["lt", /(lietuvisk|lietuviu\b|lithuanian|литовск|litauisch|litewsk|litauisk)/u],
  ["lv", /(latvisk|latviu\b|latvian|латышск|lettisch|lotewsk|łotewsk|lettisk)/u],
  ["et", /(estisk|estu\b|estonian|эстонск|estnisch|estonsk|estnisk)/u],
  ["nl", /(olandisk|olandu\b|dutch|голландск|нидерландск|niederlandisch|niderlandzk|nederlandsk|hollandsk)/u],
  ["de", /(vokisk|vokieciu\b|german|немецк|deutsch|niemieck|\btyska?\b)/u],
  ["da", /(danisk|danu\b|danish|датск|danisch|dunsk|duńsk|\bdansk)/u],
  ["no", /(norvegisk|norvegu\b|norwegian|норвежск|norwegisch|norwesk|\bnorska?\b)/u],
  ["sv", /(svedisk|svedu\b|swedish|шведск|schwedisch|szwedzk|svensk)/u],
  ["pl", /(lenkisk|lenku\b|polish|польск|polnisch|polsk)/u],
];

const CEFR = /\b(a1|a2|b1|b2|c1|c2)\b/u;
const NATIVE = /(gimtoji|gimtąja|gimtaja|native|mother\s+tongue|родн|muttersprach|moedertaal|ojczyst|modersmal)/u;

export function readStatedLanguages(text: string): StatedLanguage[] {
  const q = fold(text ?? "");
  const hits: { lang: WorkerLanguageCode; at: number; end: number }[] = [];
  for (const [lang, re] of STEMS) {
    const m = re.exec(q);
    if (m) hits.push({ lang, at: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.at - b.at);
  return hits.map((h, i) => {
    // A level belongs to the language it follows, up to the next language.
    const tail = q.slice(h.end, i + 1 < hits.length ? hits[i + 1]!.at : undefined).slice(0, 40);
    const cefr = CEFR.exec(tail)?.[1];
    const level: WorkerLanguageLevel | null = cefr
      ? (cefr.toUpperCase() as WorkerLanguageLevel)
      : NATIVE.test(tail)
        ? "native"
        : null;
    return { lang: h.lang, level };
  });
}
