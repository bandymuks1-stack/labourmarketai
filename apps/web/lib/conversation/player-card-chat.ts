"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import {
  getWorkerPlayerCard,
  type WorkerPlayerCard,
} from "@/lib/player-card/player-card";
import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import {
  getOwnThermometer,
  toThermometerView,
} from "@/lib/market/thermometer-data";
import { getOwnAvatar } from "@/lib/profile/avatar";
import type {
  PlayerCardLabels,
  ThermometerView,
} from "@/components/app/worker-player-card";

/**
 * THE PLAYER CARD AS A CONVERSATION PROJECTION (owner audit §5.1).
 *
 * "Parodyk mano kortelę" — the ONE canonical card (`WorkerPlayerCard`, the
 * same component the journal identity block and the profile render) arrives
 * IN the conversation, with the same server-derived data set the journal
 * page composes: the real card facts, the localized label bag, the market
 * thermometer view and the signed avatar URL. No second card implementation,
 * no card-shaped summary — the projection IS the card.
 *
 * Honest degradation: a non-worker account (or a failed read) gets a stated
 * reason, never an empty card and never a fabricated one.
 */
export type PlayerCardChatResult =
  | {
      kind: "card";
      card: WorkerPlayerCard;
      labels: PlayerCardLabels;
      thermometer: ThermometerView | null;
      avatarUrl: string | null;
    }
  | { kind: "blocked"; message: string };

export async function loadPlayerCardForChat(): Promise<PlayerCardChatResult> {
  const t = await getTranslations("conversation.chat");
  try {
    const card = await getWorkerPlayerCard();
    if (!card) {
      return { kind: "blocked", message: t("playerCardBlocked") };
    }
    const [labels, thermometer, avatar] = await Promise.all([
      buildPlayerCardLabels(card),
      getOwnThermometer().then(toThermometerView),
      getOwnAvatar(),
    ]);
    return {
      kind: "card",
      card,
      labels,
      thermometer,
      avatarUrl: avatar.signedUrl,
    };
  } catch {
    return { kind: "blocked", message: t("playerCardBlocked") };
  }
}
