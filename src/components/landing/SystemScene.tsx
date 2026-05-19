/**
 * SystemScene — the cinematic reveal of one connected labour market.
 *
 * A dominant focal composition, not an explainer grid: the one profile card
 * glows at the centre of a living field, with a few minimal connected signals
 * around it. It reuses the shared ProfilePlayerCard and StatusChip — it never
 * defines a second profile / card / communication concept. The only number is
 * the example profile's own readiness, shown as a clearly-labelled preview.
 */
import { ProfilePlayerCard } from "@/components/profile/ProfilePlayerCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { profileToPlayerCard } from "@/lib/player-card";
import { sampleProfiles } from "@/lib/sample-data";

type Dot = "blue" | "violet" | "gold" | "";

function Signal({
  glyph,
  label,
  dot = "",
  className = "",
}: {
  glyph: string;
  label: string;
  dot?: Dot;
  className?: string;
}) {
  return (
    <div
      className={`module flex items-center gap-3 ${className}`}
    >
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line/70 bg-fg/[0.03] text-sm text-fg-dim"
      >
        {glyph}
      </span>
      <span className="text-sm font-medium">{label}</span>
      <span aria-hidden className={`live-dot ${dot} ml-auto`} />
    </div>
  );
}

export function SystemScene() {
  const candidate = sampleProfiles[0];
  const card = profileToPlayerCard(candidate);
  const tier = card.tier[0].toUpperCase() + card.tier.slice(1);

  return (
    <div className="stage sweep scout-frame relative p-5 sm:p-8 lg:p-10">
      <div aria-hidden className="halo" />
      <div aria-hidden className="orbit hidden lg:block" />

      <div className="relative z-[2] mb-6 flex items-center justify-between">
        <span className="eyebrow">One connected labour market</span>
        <StatusChip tone="muted">Product preview</StatusChip>
      </div>

      <div className="relative z-[2] grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* left signals — desktop only */}
        <div className="hidden flex-col gap-4 lg:flex">
          <Signal glyph="▤" label="Work proof" dot="blue" />
          <Signal glyph="⬡" label="Team" dot="" />
        </div>

        {/* the one profile — focal */}
        <div className="mx-auto w-full max-w-sm">
          <div className="core breathe overflow-hidden rounded-[var(--radius-xl)]">
            <ProfilePlayerCard profile={candidate} />
          </div>

          <div className="mt-4 rounded-[var(--radius-lg)] border border-line/60 bg-fg/[0.02] px-4 py-3">
            <div className="flex items-center justify-between text-xs text-fg-mute">
              <span className="font-semibold uppercase tracking-wider">
                Profile readiness
              </span>
              <span className="tabular-nums text-fg-dim">
                {candidate.signalScore}/100
              </span>
            </div>
            <div className="mt-2 bar" aria-hidden>
              <i style={{ width: `${candidate.signalScore}%` }} />
            </div>
          </div>

          {/* mobile signal strip — compact, single row */}
          <div className="mt-4 flex gap-2 lg:hidden">
            <Signal glyph="▤" label="Proof" dot="blue" className="flex-1" />
            <Signal glyph="◈" label="Talk" dot="violet" className="flex-1" />
            <Signal glyph="◆" label="Roles" dot="gold" className="flex-1" />
          </div>
        </div>

        {/* right signals — desktop only */}
        <div className="hidden flex-col gap-4 lg:flex">
          <Signal glyph="◈" label="Communication" dot="violet" />
          <Signal glyph="◆" label="Opportunities" dot="gold" />
        </div>
      </div>

      <div className="relative z-[2] mt-7 flex flex-wrap items-center justify-center gap-1.5">
        <StatusChip tone="positive" dot>
          Open to work
        </StatusChip>
        <StatusChip tone="silver" dot>
          Verified
        </StatusChip>
        <StatusChip tone="gold" dot>
          {tier} tier
        </StatusChip>
      </div>
    </div>
  );
}
