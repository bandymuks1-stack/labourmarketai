/**
 * THE WORKER PROFILE DOOR (owner P0 2026-11-15, F2 / F6): the ONE way every
 * public "build your profile / CV" entry opens. Sign-up first, carrying the
 * profile builder (`/dashboard/profile`: upload or paste a CV, review each
 * fact, confirm) as its return path, so the need for an account is plain
 * before anything is typed and nothing typed is lost on the way.
 * `signup-form` sanitises `next`, onboarding honours it, and the login
 * page's sign-up link keeps it.
 *
 * The free-CV page's own CTAs carry the same path (`CREATE_CV_NEXT` in
 * `app/[locale]/(marketing)/create-cv/page.tsx`, an owner-gated file);
 * `lib/guards/worker-profile-door.test.ts` keeps the two equal.
 * `/worker-intake` stays as a preview that stores nothing; it is no longer
 * where "build your profile" leads, and its own sign-up and login links carry
 * this door's path too.
 *
 * A module of its own: `public-doors.ts` is inside the landing freeze.
 * PURE: no React, no IO.
 */
export const WORKER_PROFILE_DOOR_NEXT = "/dashboard/profile";

/** Locale-less sign-up href for the worker profile door. */
export const WORKER_PROFILE_DOOR_HREF = `/auth/signup?next=${encodeURIComponent(WORKER_PROFILE_DOOR_NEXT)}`;
