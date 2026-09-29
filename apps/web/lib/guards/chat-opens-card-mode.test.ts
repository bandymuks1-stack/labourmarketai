import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAT CONTROLS, THE CARD TRANSFORMS (owner command 2026-09-29 §21, item 4).
 * The router still decides THAT the card answers a sentence; the sentence
 * then decides WHICH lens of the SAME card opens (`?card=`), and a sentence
 * that names no lens opens the whole card.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const HOOK = read("components/app/workspace/use-result-param.ts");
const PANEL = read("components/app/workspace/player-card-result.tsx");
const CSS = read("app/globals.css");

describe("chat → Player Card mode", () => {
  it("the card opener reads the routed sentence's lens, once", () => {
    expect(CHAT).toMatch(/openPlayerCardRef\.current\(cardModeFromText\(routedTextRef\.current\)\)/);
    expect(CHAT).toMatch(/routedTextRef\.current = text;\s*dispatchIntent\(intent, handlers, withTyping, fallback\)/);
    expect(CHAT).toMatch(/routedTextRef\.current = null;/);
  });

  it("the URL carries the lens in ONE write; identity writes no param; close clears it", () => {
    expect(HOOK).toMatch(/result: "player-card",[\s\S]{0,160}card: mode === "identity" \? null : mode/);
    expect(HOOK).toMatch(/closeResult[\s\S]{0,200}card: null/);
  });

  it("the panel opens the card on the URL's lens, validated", () => {
    expect(PANEL).toMatch(/isPlayerCardMode\(rawMode\) \? rawMode : "identity"/);
    expect(PANEL).toMatch(/initialMode=\{mode\}/);
  });

  it("the identity stage sizes to its container (the chat panel), not the viewport", () => {
    expect(CSS).toMatch(/\.identity-stage \{\s*container-type: inline-size;/);
    expect(CSS).toMatch(/@container \(max-width: 560px\)/);
  });
});
