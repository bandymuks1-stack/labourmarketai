/** Onboarding route-transition skeleton (P0 interaction-latency audit) —
 *  instant visual response while the onboarding page's server reads run.
 *  Pure presentational placeholder; no data, nothing fake. */
export default function OnboardingLoading() {
  return (
    <div
      className="mx-auto flex min-h-screen max-w-2xl animate-pulse flex-col justify-center gap-6 px-6 py-16"
      data-testid="onboarding-loading"
      aria-hidden
    >
      <div className="h-9 w-64 max-w-full rounded-md bg-ink-700/70" />
      <div className="h-4 w-80 max-w-full rounded-md bg-ink-700/50" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-36 rounded-lg border border-ink-600/40 bg-ink-800/50" />
        <div className="h-36 rounded-lg border border-ink-600/40 bg-ink-800/50" />
      </div>
    </div>
  );
}
