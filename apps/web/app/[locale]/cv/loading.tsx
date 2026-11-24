import { SkeletonBlock, SkeletonScreen } from "@/components/app/skeleton";

/**
 * Living CV route-transition skeleton (P0 performance repair v1).
 *
 * The CV lives OUTSIDE the dashboard shell, so it had no loading boundary:
 * journal → CV navigation froze on the old screen for the full server render.
 *
 * Composed from the shared primitive (components/app/skeleton.tsx).
 */
export default function CvLoading() {
  return (
    <SkeletonScreen testId="cv-loading" className="mx-auto max-w-3xl px-4 py-10">
      <SkeletonBlock height="h-8" width="w-56" />
      <SkeletonBlock height="h-24" variant="surface" />
      <SkeletonBlock height="h-40" variant="surface" />
      <SkeletonBlock height="h-40" variant="surface" />
    </SkeletonScreen>
  );
}
