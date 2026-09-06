import { nextPathForIntents } from "@/lib/onboarding/first-run-intent";

/**
 * THE PUBLIC DOORS — the final CTA band's registry, PURE (no React, no IO),
 * so the landing guard, the production walk and the band itself read ONE
 * list.
 *
 * Every href resolves to a REAL existing route under app/[locale]/ (enforced
 * by lib/guards/global-landing.test.ts — existence-checked on every CI run):
 *   worker      → /auth/signup     (worker signup)
 *   employer    → /company-need    (canonical §17 demand entry)
 *   agency      → /auth/signup     (agencies sign up through the same door)
 *   institution → /auth/signup?next=<organisation setup, training_provider
 *                 preset> — window 6 (2026-09-06), gap G-C1: a school /
 *                 college / university IS an organisation with the
 *                 `training_provider` capability; the door names it so a
 *                 lecturer no longer has to guess that "I am an employer"
 *                 is theirs.
 *   partner     → /about           (real about/contact page)
 * No dead links, no "coming soon" pages.
 */

/**
 * The institution door's post-auth destination — the SAME path the first-run
 * router hands an `education` intent (`/dashboard/start/company?capability=
 * training_provider`): the existing organisation setup with the
 * `training_provider` capability pre-selected. Derived, not retyped, so the
 * door can never point somewhere onboarding itself would not. It rides in
 * `?next=` through the existing `lib/auth/redirect.ts` return path
 * (`capability` is not a denied query key); the onboarding wizard's
 * `returnTo` wins over its own routed path, so a person who signs up through
 * this door lands on their institution's setup screen — and the setup page's
 * own rule (0 owned companies → create) covers a person who picked no
 * company intent on the way.
 */
export const INSTITUTION_DOOR_NEXT: string =
  nextPathForIntents(["education"]) ?? "/dashboard/start/company";

export type FinalDoorKey = "worker" | "employer" | "agency" | "institution" | "partner";

export const FINAL_CTA_LINKS: ReadonlyArray<{
  readonly key: FinalDoorKey;
  readonly href: string;
  readonly variant: "primary" | "secondary";
}> = [
  { key: "worker", href: "/auth/signup", variant: "primary" },
  { key: "employer", href: "/company-need", variant: "secondary" },
  { key: "agency", href: "/auth/signup", variant: "secondary" },
  {
    key: "institution",
    href: `/auth/signup?next=${encodeURIComponent(INSTITUTION_DOOR_NEXT)}`,
    variant: "secondary",
  },
  { key: "partner", href: "/about", variant: "secondary" },
];
