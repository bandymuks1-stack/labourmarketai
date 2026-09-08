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

/**
 * ── PARTNER IS NOT AN ACTOR CONTEXT (owner window 11 §20) ──────────────────
 *
 * "Esu darbuotojas / Esu darbdavys / Atstovauju agentūrai / Atstovauju
 * mokyklai" all answer the same question: *what work am I here to do today?*
 * Each opens an account and a workspace in the product.
 *
 * "Noriu tapti partneriu" answers a different question — a commercial
 * relationship with the company behind the product — and it opens `/about`,
 * not a workspace. Sitting it in the same grid put a business-development
 * enquiry at the same conceptual level as a welder starting work, which is
 * exactly what §20 asked to be reconsidered.
 *
 * It is NOT removed: the door still exists, and the contexts section renders
 * it as one quiet line beneath the four, with its own framing. Nothing became
 * unreachable; it stopped pretending to be a starting context.
 */
export const STARTING_CONTEXTS: ReadonlyArray<{
  readonly key: Exclude<FinalDoorKey, "partner">;
  readonly href: string;
  readonly variant: "primary" | "secondary";
  /** The audience page that explains this context — nav lost these links in
   *  §16, and this is where they are honestly re-offered, by name, at the
   *  moment a person is deciding. `null` where no such page exists. */
  readonly learnMore: string | null;
}> = [
  { key: "worker", href: "/auth/signup", variant: "primary", learnMore: "/for-workers" },
  { key: "employer", href: "/company-need", variant: "secondary", learnMore: "/for-companies" },
  { key: "agency", href: "/auth/signup", variant: "secondary", learnMore: "/for-agencies" },
  {
    key: "institution",
    href: `/auth/signup?next=${encodeURIComponent(INSTITUTION_DOOR_NEXT)}`,
    variant: "secondary",
    learnMore: null,
  },
];

/** The partner enquiry — a real door, at its own level. */
export const PARTNER_DOOR = { key: "partner" as const, href: "/about" };

/**
 * The full door list, unchanged in membership so every existing consumer
 * (the landing guard, the production walk, the route-existence check) keeps
 * asserting the SAME five real destinations. Only the PRESENTATION split.
 */
export const FINAL_CTA_LINKS: ReadonlyArray<{
  readonly key: FinalDoorKey;
  readonly href: string;
  readonly variant: "primary" | "secondary";
}> = [
  ...STARTING_CONTEXTS.map(({ key, href, variant }) => ({ key, href, variant })),
  { key: PARTNER_DOOR.key, href: PARTNER_DOOR.href, variant: "secondary" as const },
];
