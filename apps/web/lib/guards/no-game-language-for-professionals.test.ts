import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A worker is a PROFESSIONAL, not a player (premium completion mission §6).
 * Bans game vocabulary in user-visible message values: "level up", "XP",
 * "player card". Deliberately NOT banned (legitimate): "level"
 * as language proficiency, "achievements" as a CV section, and the honest
 * negations "no scores / no stars" that deny scoring. Message KEYS and
 * component names (playerCard.*) are internal identifiers and are not scanned.
 */
const messages = join(__dirname, "..", "..", "messages");
const FILES = readdirSync(messages).filter((f) => f.endsWith(".json"));

const FORBIDDEN: RegExp[] = [
  /(?<![\p{L}\p{N}_])level[- ]?up(?![\p{L}\p{N}_])/iu,
  /(?<![\p{L}\p{N}_])XP(?![\p{L}\p{N}_])/u,
  /player[- ]card/iu,
];

function collect(node: unknown, out: string[]): void {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => collect(n, out));
  else if (node && typeof node === "object")
    Object.values(node).forEach((n) => collect(n, out));
}

describe("no game language describing professionals", () => {
  it.each(FILES)("%s has no game vocabulary in values", (file) => {
    const values: string[] = [];
    collect(JSON.parse(readFileSync(join(messages, file), "utf8")), values);
    const hits = values.filter((v) => FORBIDDEN.some((re) => re.test(v)));
    expect(hits).toEqual([]);
  });
});
