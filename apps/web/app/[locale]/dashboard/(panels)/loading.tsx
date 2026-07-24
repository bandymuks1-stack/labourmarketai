/**
 * Dashboard-tree route-transition skeleton (P0 interaction-latency audit).
 *
 * Before this file existed the dashboard tree had NO loading boundary, so
 * every tab/navigation click held the previous screen frozen for the full
 * server render (measured 0.7–2.0s) with only the tiny nav spinner as
 * feedback. This skeleton streams instantly on every navigation inside the
 * authenticated shell, so a click always produces an immediate full-screen
 * response. Pure presentational placeholder — no data, no claims, nothing
 * fake; just neutral pulsing blocks in the app's surface rhythm.
 */
export default function DashboardSectionLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6"
      data-testid="dashboard-section-loading"
      aria-hidden
    >
      <div className="flex flex-col gap-3">
        <div className="h-6 w-40 rounded-full bg-ink-700/70" />
        <div className="h-9 w-72 max-w-full rounded-md bg-ink-700/70" />
      </div>
      <div className="h-44 rounded-lg border border-ink-600/40 bg-ink-800/50" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 rounded-lg border border-ink-600/40 bg-ink-800/50" />
        <div className="h-28 rounded-lg border border-ink-600/40 bg-ink-800/50" />
        <div className="h-28 rounded-lg border border-ink-600/40 bg-ink-800/50" />
      </div>
      <div className="h-32 rounded-lg border border-ink-600/40 bg-ink-800/50" />
    </div>
  );
}
