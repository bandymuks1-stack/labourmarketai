/**
 * TeamCluster — a presentational team-presence cluster for the scene.
 *
 * Decorative initials only (no real identities, no counts presented as live
 * market data). Landing-only; not a profile / player-card concept.
 */
const INITIALS = ["AK", "MS", "LB", "NH"];

export function TeamCluster({ className = "" }: { className?: string }) {
  return (
    <div className={`module flex items-center gap-3 ${className}`}>
      <div className="flex -space-x-2.5">
        {INITIALS.map((s, i) => (
          <span
            key={s}
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-full border border-line bg-ink-2 text-[0.62rem] font-semibold text-fg-dim"
            style={{ zIndex: INITIALS.length - i }}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">Team</p>
        <p className="mt-0.5 text-[0.72rem] text-fg-mute">
          People you build with
        </p>
      </div>
      <span aria-hidden className="live-dot ml-auto" />
    </div>
  );
}
