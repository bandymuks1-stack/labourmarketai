/**
 * PlayerSurface — the ONE visual frame for the player-card system.
 *
 * It renders a derived {@link PlayerCard} view-model and nothing else. The
 * avatar / tier ring / stat layout lives here and only here so people and
 * companies share an identical visual identity across discover, matching,
 * worker search, company needs, teams and future map views.
 *
 * This is deliberately NOT named *PlayerCard: the two canonical card
 * components (ProfilePlayerCard, CompanyPlayerCard) are the only entry points
 * and both render this surface.
 */
import type { PlayerCard, PlayerTier } from "@/lib/types";

const TIER_LABEL: Record<PlayerTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  elite: "Elite",
};

export function PlayerSurface({
  card,
  footer,
}: {
  card: PlayerCard;
  footer?: React.ReactNode;
}) {
  const accent = `accent-${card.accent}`;
  const glow = `glow-${card.accent}`;

  return (
    <article
      className={`player glass glass-hover ${glow} flex h-full flex-col p-5`}
    >
      {/* sheen layer + faint kind glyph */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 select-none text-[7rem] font-black leading-none text-fg/[0.03]"
      >
        {card.kind === "company" ? "▣" : "◆"}
      </span>

      <header className="relative z-[3] flex items-start gap-4">
        <div className={`tier-ring ${accent} shrink-0`}>
          <div className="grid h-16 w-16 place-items-center rounded-full bg-ink-2 text-lg font-bold tracking-tight">
            {card.initials}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold leading-tight">
              {card.name}
            </h3>
            <span className="chip border-0 bg-fg/[0.06] px-2 py-0.5 text-[0.66rem] uppercase tracking-wider text-fg-dim">
              {TIER_LABEL[card.tier]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-fg-dim">{card.role}</p>
          <p className="mt-1 text-xs text-fg-mute">{card.location}</p>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold tabular-nums leading-none grad-text">
            {card.signalScore}
          </div>
          <div className="mt-1 text-[0.62rem] uppercase tracking-wider text-fg-mute">
            Signal
          </div>
        </div>
      </header>

      <div className="relative z-[3] mt-4 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            card.kind === "company" ? "bg-violet" : "bg-emerald"
          }`}
        />
        <span className="text-xs font-medium text-fg-dim">{card.status}</span>
      </div>

      <div className="relative z-[3] mt-4 flex flex-wrap gap-1.5">
        {card.tags.map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>

      <div className="relative z-[3] mt-auto grid grid-cols-3 gap-2 pt-5">
        {card.stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-line/60 bg-fg/[0.02] px-2 py-2 text-center"
          >
            <div className="text-sm font-semibold tabular-nums">
              {stat.value}
            </div>
            <div className="mt-0.5 text-[0.6rem] uppercase tracking-wider text-fg-mute">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {footer ? (
        <div className="relative z-[3] mt-4 border-t border-line/60 pt-4">
          {footer}
        </div>
      ) : null}
    </article>
  );
}
