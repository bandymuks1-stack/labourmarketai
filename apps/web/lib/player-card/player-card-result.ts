"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { getWorkerPlayerCard, type WorkerPlayerCard } from "./player-card";
import { buildPlayerCardLabels } from "./labels";
import {
  getOwnThermometer,
  toThermometerView,
} from "@/lib/market/thermometer-data";
import { getOwnAvatar } from "@/lib/profile/avatar";
import {
  getPrimaryProfessionSlug,
  getWorkerCoreRow,
} from "@/lib/data/worker-core";
import { getWorkerCard, type WorkEditorVM } from "@/lib/worker/work-card";
import { deriveWorkCardState } from "@/lib/worker/work-card-state";
import type { WorkCardLabels } from "@/components/app/work-card-editor";
import type {
  PlayerCardLabels,
  ThermometerView,
} from "@/components/app/worker-player-card";

/**
 * THE PLAYER CARD RESULT (W3 row 1).
 *
 * "Parodyk mano kortelę" opens the ONE canonical card — `WorkerPlayerCard`,
 * the same component the journal identity block renders — in the CONTEXT
 * PANEL. The chat explains and opens it; it no longer draws a second copy in
 * the thread, which is where this capability had two renderers.
 *
 * ONE DATA CHAIN. Everything below hangs off `getWorkerPlayerCard()`, which is
 * request-cached and is already the single canonical card model (the premium
 * hub's person block derived from the same call). Nothing here queries a table
 * of its own.
 *
 * THE EDITOR CAME WITH IT. `workEditor` is the state-aware next action plus the
 * inline availability/location/pay editor that used to be folded into the hub's
 * person block on `/dashboard/advanced` — the ONLY editor for those dimensions
 * anywhere in the product. Absorbing the card without it would have silently
 * deleted a capability, so it is derived here, from the same reads, and
 * rendered in the same result. It is `null` for any identity without a worker
 * row: a non-worker never receives worker-only editing controls, and the real
 * authorization stays where it already was — server-side, in the save RPCs the
 * editor calls.
 *
 * Honest degradation: a non-worker account (or a failed read) gets a stated
 * reason, never an empty card and never a fabricated one.
 */
export type PlayerCardResult =
  | {
      kind: "card";
      card: WorkerPlayerCard;
      labels: PlayerCardLabels;
      thermometer: ThermometerView | null;
      avatarUrl: string | null;
      /** Worker-only. `null` = this identity gets no editing controls. */
      workEditor: WorkEditorVM | null;
      /** Copy for the editor; `null` exactly when `workEditor` is null. */
      workEditorLabels: WorkCardLabels | null;
    }
  | { kind: "blocked"; message: string };

export async function loadPlayerCardResult(): Promise<PlayerCardResult> {
  const t = await getTranslations("conversation.chat");
  try {
    const card = await getWorkerPlayerCard();
    if (!card) {
      return { kind: "blocked", message: t("playerCardBlocked") };
    }
    const [labels, thermometer, avatar, editor] = await Promise.all([
      buildPlayerCardLabels(card),
      getOwnThermometer().then(toThermometerView),
      getOwnAvatar(),
      resolveWorkEditor(card),
    ]);
    return {
      kind: "card",
      card,
      labels,
      thermometer,
      avatarUrl: avatar.signedUrl,
      workEditor: editor?.vm ?? null,
      workEditorLabels: editor?.labels ?? null,
    };
  } catch {
    return { kind: "blocked", message: t("playerCardBlocked") };
  }
}

/**
 * The worker's next action + editable card values, or `null` when there is no
 * worker row to edit. Derived from the SAME counts the player card already
 * carries, so no dimension is read twice.
 */
async function resolveWorkEditor(card: WorkerPlayerCard): Promise<{
  vm: WorkEditorVM;
  labels: WorkCardLabels;
} | null> {
  const [worker, professionSlug] = await Promise.all([
    getWorkerCoreRow(),
    getPrimaryProfessionSlug(),
  ]);
  if (!worker?.id) return null;

  const tProf = await getTranslations("professions");
  const professionName =
    professionSlug && tProf.has(professionSlug as never)
      ? tProf(professionSlug as never)
      : professionSlug;

  const data = await getWorkerCard({
    workerId: worker.id,
    name: card.displayName ?? "",
    professionName: professionName ?? null,
    skillsCount: card.skillsDeclared,
    evidenceCount: card.evidenceEntries,
  });
  const derived = deriveWorkCardState(data.signals, Date.now());

  const tw = await getTranslations("auth.dashboard.workCard");
  return {
    vm: { state: derived.state, next: derived.next, values: data.values },
    labels: {
      nextEyebrow: tw("nextEyebrow"),
      nextLabel: tw(`next.${derived.next.dim}`),
      why: tw(derived.next.whyKey),
      staleTitle: tw("stale.title"),
      staleBody: tw("stale.body"),
      yes: tw("stale.yes"),
      change: tw("stale.change"),
      staleSaved: tw("stale.saved"),
      editorOpen: tw("editor.open"),
      editorTitle: tw("editor.title"),
      availabilityLabel: tw("editor.availabilityLabel"),
      availabilityOptionAvailable: tw("editor.availabilityOption.available"),
      availabilityOptionBusy: tw("editor.availabilityOption.busy"),
      availabilityOptionUnavailable: tw("editor.availabilityOption.unavailable"),
      availabilityOptionNone: tw("editor.availabilityOption.none"),
      availableFromLabel: tw("editor.availableFromLabel"),
      locationLabel: tw("editor.locationLabel"),
      locationHint: tw("editor.locationHint"),
      preferredLabel: tw("editor.preferredLabel"),
      preferredHint: tw("editor.preferredHint"),
      salaryMinLabel: tw("editor.salaryMinLabel"),
      salaryMaxLabel: tw("editor.salaryMaxLabel"),
      save: tw("editor.save"),
      saving: tw("editor.saving"),
      saved: tw("editor.saved"),
      errorMsg: tw("editor.error"),
      needsMigration: tw("editor.needsMigration"),
    },
  };
}
