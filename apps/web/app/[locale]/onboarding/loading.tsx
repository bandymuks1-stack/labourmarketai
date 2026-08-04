import {
  SkeletonBlock,
  SkeletonCardGrid,
  SkeletonScreen,
} from "@/components/app/skeleton";

/** Onboarding route-transition skeleton (P0 interaction-latency audit) —
 *  instant visual response while the onboarding page's server reads run.
 *  Composed from the shared primitive (components/app/skeleton.tsx). */
export default function OnboardingLoading() {
  return (
    <SkeletonScreen
      testId="onboarding-loading"
      className="mx-auto min-h-screen max-w-2xl justify-center px-6 py-16"
    >
      <SkeletonBlock height="h-9" width="w-64 max-w-full" />
      <SkeletonBlock height="h-4" width="w-80 max-w-full" />
      <SkeletonCardGrid count={2} height="h-36" columns="sm:grid-cols-2" />
    </SkeletonScreen>
  );
}
