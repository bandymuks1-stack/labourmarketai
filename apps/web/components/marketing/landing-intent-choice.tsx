import { getLocale, getTranslations } from "next-intl/server";

import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { NavAuthCtas } from "@/components/layouts/nav-auth-ctas";
import { GoalNavigation } from "@/components/navigation/goal-navigation";
import { buttonLinkClassName } from "@/components/ui/Button";

/**
 * THE FIRST SCREEN IS THE CHOICE (owner priority 2026-11-12).
 *
 * The goal navigator — the page's h1 question, the six goals in one rail and
 * one active panel under it — is the first thing on the landing.
 *
 * Below `sm` the header row has room for Sign in only, so Sign up is shown
 * here, on the first screen, as well as first in the menu (owner 2026-11-12:
 * creating an account must be as easy to find as signing in). From `sm` up
 * the header carries both and this row is not rendered. A signed-in person
 * does not see it.
 */
export async function LandingIntentChoice({
  lead,
  phoneMore,
}: {
  lead?: string;
  phoneMore?: { readonly ids: readonly string[]; readonly label: string };
} = {}) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("siteNav")]);
  return (
    <div data-testid="landing-intent-choice">
      <GoalNavigation headingLevel="h1" phoneLayout="grid" lead={lead} phoneMore={phoneMore} />
      <div className="mt-3 sm:hidden" data-testid="landing-signup">
        <NavAuthCtas
          guest={
            <AuthCtaLink
              relPath={`/${locale}/auth/signup`}
              className={buttonLinkClassName("primary", "md") + " w-full"}
            >
              {t("signUp")}
            </AuthCtaLink>
          }
          member={null}
        />
      </div>
    </div>
  );
}
