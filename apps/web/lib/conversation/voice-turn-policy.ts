import { isPlainAffirmation } from "./conversation-goal";

/**
 * VOICE TURN POLICY - the whole of what "voice-origin" changes in the chat.
 *
 * Voice is a DOOR into the one typed-chat spine (docs/VOICE_DOOR_ADAPTER_V1.md):
 * the reviewed transcript enters `handleSend` like a typed sentence and the
 * intent router, action registry, authority and confirmation cards are
 * unchanged. This module adds exactly two guards for sentences whose WORDS may
 * have been misheard (speech-to-text is probabilistic; typing is not):
 *
 *  1. A bare "yes" never proceeds. Speech noise ("ok", "da", "yes") must never
 *     re-enter a goal or accept anything. The person is told to press the
 *     button on the card; a spoken "yes" is NOT the confirmation.
 *  2. Three intents that act on a SINGLE fuzzy name match show that match as a
 *     chip the person presses instead of acting on it: switch-context (changes
 *     the workspace later writes are attributed to), open-conversation (opens or
 *     creates a thread with a person), write-employer (opens a thread with a
 *     counterparty).
 *
 * It grants no authority and widens nothing: every consequential step is still
 * the existing card + token + server-side authority. Pure and framework-free so
 * it can be pinned by tests.
 */

export type TurnOrigin = "typed" | "voice";

/** Handlers whose single-match shortcut is replaced by a pressable chip for a
 *  voice-origin turn. */
export const VOICE_CHIP_ONLY_HANDLERS = ["switchContext", "openConversation", "writeEmployer"] as const;
export type VoiceChipOnlyHandler = (typeof VOICE_CHIP_ONLY_HANDLERS)[number];

/** What to do with the sentence BEFORE routing. */
export function preRouteDisposition(input: {
  origin: TurnOrigin;
  text: string;
}): "route" | "refuse-bare-affirmation" {
  if (input.origin === "voice" && isPlainAffirmation(input.text)) return "refuse-bare-affirmation";
  return "route";
}

/** True when a single match for `handler` must be offered as a chip, not acted on. */
export function singleMatchNeedsChip(origin: TurnOrigin, handler: VoiceChipOnlyHandler): boolean {
  return origin === "voice" && (VOICE_CHIP_ONLY_HANDLERS as readonly string[]).includes(handler);
}
