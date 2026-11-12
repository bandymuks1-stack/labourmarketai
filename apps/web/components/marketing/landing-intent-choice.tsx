import { GoalNavigation } from "@/components/navigation/goal-navigation";

/**
 * THE FIRST SCREEN IS THE CHOICE (owner priority 2026-11-12).
 *
 * The goal navigator — the six goals in one rail and one active panel under
 * it — directly under the headline. The same component renders on
 * `/start/<goal>`, which is this view's own URL state.
 */
export function LandingIntentChoice() {
  return (
    <div data-testid="landing-intent-choice">
      <GoalNavigation />
    </div>
  );
}
