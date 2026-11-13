"use client";

import { useState, useSyncExternalStore, type ComponentProps } from "react";

import { GoalNavigator, type NavigatorGoal } from "@/components/navigation/goal-navigator";
import type { RailCard } from "@/components/navigation/card-rail";
import {
  readPinned,
  readPinnedOnServer,
  requestPinToggle,
  subscribePinned,
} from "@/lib/workspace/pin-sync";

/** A function card the person may pin: the reference and both control names. */
export type PinnableFunction = Omit<RailCard, "pin"> & {
  readonly pinning?: { readonly ref: string; readonly add: string; readonly remove: string };
};
export type HomeNavigatorGoal = Omit<NavigatorGoal, "functions" | "pin"> & {
  readonly functions: readonly PinnableFunction[];
};

/**
 * THE SIGNED-IN HOME'S CLIENT HALF: the shared `GoalNavigator`, with the
 * shared card's pin slot filled in. It draws nothing of its own — the card,
 * the rail and the pin control are `components/navigation/card-rail.tsx`.
 *
 * What is pinned is the pinned row's state (`lib/workspace/pin-sync.ts`): a
 * toggle asks the row to change it, so the row and the card always agree and
 * there is one writer. Until the row has announced itself (server render,
 * unreadable pin store) the cards carry no toggle at all.
 */
export function HomeGoalNavigator({
  goals,
  ...rest
}: Omit<ComponentProps<typeof GoalNavigator>, "goals"> & { goals: readonly HomeNavigatorGoal[] }) {
  const pinned = useSyncExternalStore(subscribePinned, readPinned, readPinnedOnServer);
  const [status, setStatus] = useState("");

  const toggle = (ref: string, label: string) => {
    setStatus("");
    void requestPinToggle({ ref, label }).then((result) => {
      if (!result.ok && result.message) setStatus(result.message);
    });
  };

  return (
    <>
      <GoalNavigator
        {...rest}
        goals={goals.map((goal) => ({
          ...goal,
          functions: goal.functions.map(({ pinning, ...card }) => {
            if (!pinning || !pinned.available) return card;
            const pressed = pinned.refs.includes(pinning.ref);
            return {
              ...card,
              pin: {
                pressed,
                label: pressed ? pinning.remove : pinning.add,
                onToggle: () => toggle(pinning.ref, card.label),
              },
            };
          }),
        }))}
      />
      {/* Why a pin did not happen (the row is full, the store is away). */}
      <p role="status" aria-live="polite" data-testid="home-pin-status" className="text-support text-text-secondary empty:hidden">
        {status}
      </p>
    </>
  );
}
