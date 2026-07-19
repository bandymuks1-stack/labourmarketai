/**
 * Living CV route-transition skeleton (P0 performance repair v1).
 *
 * The CV lives OUTSIDE the dashboard shell, so it had no loading boundary:
 * journal → CV navigation froze on the old screen for the full server
 * render. Pure presentational placeholder — neutral pulsing blocks only,
 * no data, no claims.
 */
export default function CvLoading() {
  return (
    <div
      className="mx-auto flex max-w-3xl animate-pulse flex-col gap-6 px-4 py-10"
      data-testid="cv-loading"
      aria-hidden
    >
      <div className="h-8 w-56 rounded-md bg-ink-700/70" />
      <div className="h-24 rounded-lg border border-ink-600/40 bg-ink-800/50" />
      <div className="h-40 rounded-lg border border-ink-600/40 bg-ink-800/50" />
      <div className="h-40 rounded-lg border border-ink-600/40 bg-ink-800/50" />
    </div>
  );
}
