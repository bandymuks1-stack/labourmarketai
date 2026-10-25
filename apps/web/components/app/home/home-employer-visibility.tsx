import { DiscoverabilityConsent } from "@/components/app/discoverability-consent";
import { Card } from "@/components/ui/Card";
import { loadEmployerVisibilityForChat } from "@/lib/conversation/employer-visibility-chat";
import { Link } from "@/lib/i18n/navigation";
import { EMPLOYER_VISIBILITY_HREF } from "@/lib/privacy/employer-visibility";

/**
 * "CAN EMPLOYERS FIND ME?" ON THE WORKER HOME — always, not once.
 *
 * Owner goal 2026-10-24 ("matchability"): a worker must understand at once
 * whether employers can find them and change it in ONE action. The home used
 * to carry only the once-only ASK, a door with "not now": it vanished after
 * any decision (or a dismissal), so a person who had switched visibility on
 * never saw on the home that they were findable, and one who had said "not
 * now" never saw the question again (local walk 2026-10-24).
 *
 * This renders the SAME consent component every other door renders, in its
 * `compact` form (source "home"): the status line, what never leaves the
 * profile, and one action — "switch off" when ON (one tap), "read the terms
 * and turn on" when OFF, which opens the full versioned text in place before
 * its grant button exists. Nothing here grants, withdraws or pre-selects.
 *
 * Reads through the ONE loader the conversation and onboarding use
 * (`loadEmployerVisibilityForChat`). An account with no worker row renders
 * nothing; an UNKNOWN state renders its honest line and the door to the
 * canonical screen — never "off" (SEP-7).
 */
export async function HomeEmployerVisibility({ locale }: { readonly locale: string }) {
  const visibility = await loadEmployerVisibilityForChat();
  if (visibility.kind === "no-worker") return null;
  if (!visibility.consent) {
    return (
      <section data-testid="home-employer-visibility" data-visibility="unknown">
        <Card compact>
          <p role="status" className="text-sm text-text-secondary">
            {visibility.line}
          </p>
          <Link
            href={EMPLOYER_VISIBILITY_HREF as "/dashboard"}
            className="inline-flex min-h-11 items-center text-sm font-medium text-text-primary underline underline-offset-4 hover:no-underline"
          >
            {visibility.chipLabel} →
          </Link>
        </Card>
      </section>
    );
  }
  return (
    <section data-testid="home-employer-visibility" data-visibility={visibility.visibility}>
      <Card compact>
        <DiscoverabilityConsent compact locale={locale} source="home" {...visibility.consent} />
      </Card>
    </section>
  );
}
