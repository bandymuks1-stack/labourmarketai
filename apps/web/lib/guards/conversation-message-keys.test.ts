/**
 * RAW TRANSLATION KEYS MUST NEVER REACH A USER.
 *
 * Found on PRODUCTION (build da076681, 2026-09-06) by the multi-turn
 * conversation walk — not by any unit test, because a missing message key is
 * invisible to every test that does not render the real bag:
 *
 *   "conversation.chat.knownState.usingProfile"
 *   "Pagal workspace.ai.dimension.salary filtruoti dar negaliu."
 *
 * Two different causes, one class:
 *
 *   1. THE KEY WAS WRITTEN INTO THE WRONG NAMESPACE. The known-state readback
 *      was added under `workspace.ai` while the handler reads it from
 *      `conversation.chat`. Both namespaces exist and both are valid, so
 *      nothing failed — the key simply resolved to itself.
 *
 *   2. THE KEY WAS NEVER WRITTEN AT ALL. `UNSUPPORTED_DIMENSIONS` — the four
 *      things the product honestly says it cannot filter by — never had
 *      labels, so "I can't filter by {dimension} yet" had ALWAYS rendered a
 *      raw key. It went unseen because the sentence was only reachable once
 *      the conversation could carry a pay constraint at all.
 *
 * The second one matters more than a typo: it is an HONESTY line. The product
 * telling a person "I cannot filter by workspace.ai.dimension.salary yet" is
 * worse than saying nothing, because it looks broken exactly where it is
 * being careful.
 *
 * This guard asserts the two paths in EVERY shipped locale, not just LT/EN —
 * a locale that silently lacks the key would leak the raw string to exactly
 * the users least able to report it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { UNSUPPORTED_DIMENSIONS } from "@/lib/ai-workspace/world-state-language";

const MESSAGES = resolve(__dirname, "..", "..", "messages");

type Bag = Record<string, unknown>;

const locales = readdirSync(MESSAGES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

function bag(locale: string): Bag {
  return JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8")) as Bag;
}

/** Resolve a dotted path, or `undefined`. */
function at(root: Bag, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Bag)[key] : undefined,
      root,
    );
}

/**
 * Which locales carry the conversation surface at all. A locale file that has
 * no `workspace.ai` is not a shipped conversation locale and is skipped —
 * asserting keys into it would force translations nobody renders.
 */
const conversationLocales = locales.filter((l) => at(bag(l), "workspace.ai") !== undefined);

describe("no raw translation key can reach a user in the conversation", () => {
  it("there is at least one conversation locale to check", () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(conversationLocales.length).toBeGreaterThan(0);
  });

  describe.each(conversationLocales)("%s", (locale) => {
    const b = bag(locale);

    /**
     * (1) The known-state readback, in the namespace the handler ACTUALLY
     * reads (`useTranslations("conversation.chat")` in the findWork handler).
     * Naming the full path here is the point: the previous version of these
     * strings existed, and was still invisible.
     */
    it.each([
      "conversation.chat.knownState.usingProfile",
      "conversation.chat.knownState.usingProfileNarrowed",
      "conversation.chat.knownState.profileEmpty",
    ])("%s is a real string", (path) => {
      const v = at(b, path);
      expect(typeof v, `${locale}: ${path} is missing → the raw key renders`).toBe("string");
      expect(String(v).trim().length).toBeGreaterThan(0);
    });

    it("the known-state copy is not left in the namespace it was written to by mistake", () => {
      // `workspace.ai.knownState` resolves for nobody: the handler reads
      // `conversation.chat`. Keeping a copy there would let the two drift and
      // would make the next reader believe the wrong one is live.
      expect(at(b, "workspace.ai.knownState")).toBeUndefined();
    });

    /**
     * (2) Every dimension the product can RECOGNISE but not act on must have
     * a label, because recognising it is precisely what the honest sentence
     * reports. Driven off the source constant, so adding a fifth unsupported
     * dimension fails here instead of shipping a raw key.
     */
    it.each(UNSUPPORTED_DIMENSIONS)("workspace.ai.dimension.%s is a real string", (dim) => {
      const v = at(b, `workspace.ai.dimension.${dim}`);
      expect(
        typeof v,
        `${locale}: workspace.ai.dimension.${dim} is missing → "unsupportedDimension" renders a raw key`,
      ).toBe("string");
      expect(String(v).trim().length).toBeGreaterThan(0);
    });

    it("the sentence that consumes those labels exists too", () => {
      expect(typeof at(b, "workspace.ai.unsupportedDimension")).toBe("string");
    });

    it("no label is itself a dotted key path", () => {
      // The failure mode this whole file is about: a value that looks like a
      // key. Catch it in the data, not only in the lookup.
      for (const dim of UNSUPPORTED_DIMENSIONS) {
        const v = String(at(b, `workspace.ai.dimension.${dim}`) ?? "");
        expect(v).not.toMatch(/^[a-z][a-zA-Z]*(\.[a-zA-Z]+){2,}$/);
      }
    });
  });
});
