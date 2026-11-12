import { GoalRail } from "@/components/navigation/goal-rail";

/**
 * THE FIRST SCREEN IS THE CHOICE (owner priority 2026-11-12: a partner did
 * not go deeper because the navigation was not self-evident).
 *
 * Level 1 of the one navigation system: the six goals as a card rail — the
 * SAME six as the header (`lib/navigation/public-intents.ts`) — directly
 * under the promise. A card opens the goal's own view (level 2), where its
 * functions are one more action away. On a wide screen the rail shows as many
 * as fit; on a phone it swipes with the next card peeking.
 */
export function LandingIntentChoice() {
  return (
    <div data-testid="landing-intent-choice">
      <GoalRail />
    </div>
  );
}
