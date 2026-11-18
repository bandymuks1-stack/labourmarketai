/**
 * WHERE A WORKER'S PROFILE IS MADE, AND HOW SIGN-UP RETURNS THERE (owner P0
 * 2026-11-15, F2).
 *
 * `/worker-intake` is the first step and needs no account. Its sign-up and
 * login links carry the profile builder (`/dashboard/profile`: the composer,
 * then a review of each fact, then confirm) as their return path, and what
 * the person typed waits in the browser until the builder places it in the
 * composer (`lib/staffing/worker-intake-draft.ts`). `signup-form` sanitises
 * `next`, onboarding honours it, and the login page's sign-up link keeps it.
 *
 * The free-CV page's CTAs carry the same path (`CREATE_CV_NEXT` in
 * `app/[locale]/(marketing)/create-cv/page.tsx`, an owner-gated file);
 * `lib/guards/worker-profile-door.test.ts` keeps the two equal.
 *
 * A module of its own: `public-doors.ts` is inside the landing freeze.
 * PURE: no React, no IO.
 */
export const WORKER_PROFILE_DOOR_NEXT = "/dashboard/profile";

/** Locale-less sign-up href that returns to the profile builder. */
export const WORKER_PROFILE_DOOR_HREF = `/auth/signup?next=${encodeURIComponent(WORKER_PROFILE_DOOR_NEXT)}`;

/**
 * True when a sanitised return path (`getSafeReturnPath`: `/<locale>/…`) is
 * the profile builder: the sign-up / sign-in the intake's own links open.
 * Only then is the intake draft bound to the email used (decision 0024).
 */
export function isWorkerProfileDoorNext(path: string | null | undefined): boolean {
  if (!path) return false;
  const bare = path.split(/[?#]/)[0];
  return /^\/[a-z]{2}(?:-[A-Za-z]{2,4})?\/dashboard\/profile\/?$/.test(bare) || bare === WORKER_PROFILE_DOOR_NEXT;
}
