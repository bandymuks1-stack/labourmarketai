import { GoalNavigation } from "@/components/navigation/goal-navigation";

/**
 * THE FIRST SCREEN IS THE CHOICE (owner priority 2026-11-12).
 *
 * The goal navigator — the page's h1 question, the six goals in one rail and
 * one active panel under it — is the first thing on the landing.
 */
export function LandingIntentChoice() {
  return (
    <div data-testid="landing-intent-choice">
      <GoalNavigation headingLevel="h1" />
    </div>
  );
}
