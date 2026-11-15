import { UNICODE_WORD_BOUNDARY, fold } from "./intent-router";
import { looksSwedish } from "@/lib/structuring/looks-swedish";
import { HELP_TOPICS, type HelpChip, type HelpTopic, type HelpTopicId } from "./product-help-topics";

/**
 * Reads WHICH product-help question a sentence asked, from the same sources
 * the router's `product-help` rule is built from. Pure; no IO.
 *
 * Both sides are folded exactly as the router does (diacritics, lower case,
 * ASCII `\b` -> the Unicode word boundary), so a topic the router recognised is
 * always a topic this reads back.
 */
type CompiledTopic = { topic: HelpTopic; res: RegExp[]; svRes: RegExp[] };
let compiled: ReadonlyArray<CompiledTopic> | null = null;

const toRe = (src: string): RegExp => new RegExp(fold(src).replace(/\\b/g, UNICODE_WORD_BOUNDARY), "u");

function compile(): ReadonlyArray<CompiledTopic> {
  if (!compiled) {
    compiled = HELP_TOPICS.map((topic) => ({
      topic,
      res: topic.sources.map(toRe),
      svRes: topic.svSources.map(toRe),
    }));
  }
  return compiled;
}

export function readHelpTopic(sentence: string): HelpTopic | null {
  const folded = fold(sentence);
  // The Swedish sources count for a Swedish sentence only — the same gate the
  // router's `sv()` patterns use, so the two still cannot disagree.
  const swedish = looksSwedish(sentence);
  for (const { topic, res, svRes } of compile()) {
    if (res.some((re) => re.test(folded))) return topic;
    if (swedish && svRes.some((re) => re.test(folded))) return topic;
  }
  return null;
}

/** The chips a topic offers in the given identity. */
export function helpChipsFor(
  topic: HelpTopic,
  identity: "company" | "person",
): readonly HelpChip[] {
  return topic.chips.filter((c) => !c.only || c.only === identity);
}

export type { HelpTopicId };
