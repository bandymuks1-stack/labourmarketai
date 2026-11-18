/**
 * The Professional Player Card's modes (owner command 2026-09-29 §9) — one
 * list shared by the card's client switcher, the pages that read `?card=`
 * and the chat that asks for a mode. Plain module: callable on the server.
 */
export const PLAYER_CARD_MODES = ["identity", "work", "skills", "evidence", "history", "next"] as const;
export type PlayerCardMode = (typeof PLAYER_CARD_MODES)[number];

export function isPlayerCardMode(v: unknown): v is PlayerCardMode {
  return typeof v === "string" && (PLAYER_CARD_MODES as readonly string[]).includes(v);
}
