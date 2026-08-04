import {
  SkeletonBlock,
  SkeletonCardGrid,
  SkeletonScreen,
} from "@/components/app/skeleton";

/**
 * Dashboard-tree route-transition skeleton (P0 interaction-latency audit).
 *
 * Before this file existed the dashboard tree had NO loading boundary, so
 * every tab/navigation click held the previous screen frozen for the full
 * server render (measured 0.7–2.0s) with only the tiny nav spinner as
 * feedback. This skeleton streams instantly on every navigation inside the
 * authenticated shell, so a click always produces an immediate full-screen
 * response.
 *
 * Composed from the shared primitive (components/app/skeleton.tsx) — the
 * markup is no longer hand-rolled here. It stays a SYNCHRONOUS server
 * component: an async one would suspend and defeat the boundary it fills.
 */
export default function DashboardSectionLoading() {
  return (
    <SkeletonScreen testId="dashboard-section-loading">
      <div className="flex flex-col gap-3">
        <SkeletonBlock height="h-6" width="w-40" radius="rounded-full" />
        <SkeletonBlock height="h-9" width="w-72 max-w-full" />
      </div>
      <SkeletonBlock height="h-44" variant="surface" />
      <SkeletonCardGrid count={3} height="h-28" />
      <SkeletonBlock height="h-32" variant="surface" />
    </SkeletonScreen>
  );
}
