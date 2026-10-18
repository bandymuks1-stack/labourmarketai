import { UNICODE_WORD_BOUNDARY, fold } from "./intent-router";
import { HELP_TOPICS, type HelpChip, type HelpTopic, type HelpTopicId } from "./product-help-topics";

/**
 * Reads WHICH product-help question a sentence asked, from the same sources
 * the router's `product-help` rule is built from. Pure; no IO.
 *
 * Both sides are folded exactly as the router does (diacritics, lower case,
 * ASCII `\b` -> the Unicode word boundary), so a topic the router recognised is
 * always a topic this reads back.
 */
let compiled: ReadonlyArray<{ topic: HelpTopic; res: RegExp[] }> | null = null;

function compile(): ReadonlyArray<{ topic: HelpTopic; res: RegExp[] }> {
  if (!compiled) {
    compiled = HELP_TOPICS.map((topic) => ({
      topic,
      res: topic.sources.map(
        (src) => new RegExp(fold(src).replace(/\\b/g, UNICODE_WORD_BOUNDARY), "u"),
      ),
    }));
  }
  return compiled;
}

export function readHelpTopic(sentence: string): HelpTopic | null {
  const folded = fold(sentence);
  for (const { topic, res } of compile()) {
    if (res.some((re) => re.test(folded))) return topic;
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
